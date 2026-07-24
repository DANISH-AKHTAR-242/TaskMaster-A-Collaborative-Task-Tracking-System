CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE team_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE project_role AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE task_status AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE attachment_status AS ENUM ('PENDING', 'READY', 'FAILED', 'DELETED');
CREATE TYPE ai_request_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE outbox_status AS ENUM ('PENDING', 'PUBLISHED', 'DEAD_LETTER');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(320) NOT NULL,
  password_hash TEXT NOT NULL, display_name VARCHAR(120) NOT NULL, avatar_url TEXT,
  email_verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX users_email_active_unique ON users (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_family_id UUID NOT NULL, refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  replaced_by_id UUID UNIQUE, user_agent TEXT, ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_replaced_by_fkey FOREIGN KEY (replaced_by_id) REFERENCES auth_sessions(id)
);
CREATE INDEX auth_sessions_user_id_revoked_at_idx ON auth_sessions(user_id, revoked_at);
CREATE INDEX auth_sessions_token_family_id_idx ON auth_sessions(token_family_id);
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions(expires_at);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) NOT NULL, slug VARCHAR(80) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX teams_slug_active_unique ON teams(lower(slug)) WHERE deleted_at IS NULL;

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role team_role NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), removed_at TIMESTAMPTZ, UNIQUE(team_id, user_id)
);
CREATE INDEX team_members_user_id_removed_at_idx ON team_members(user_id, removed_at);

CREATE TABLE team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL, role team_role NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id), expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX team_invitations_active_unique ON team_invitations(team_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX team_invitations_team_id_created_at_idx ON team_invitations(team_id, created_at);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL, description TEXT, created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
);
CREATE INDEX projects_team_id_deleted_at_idx ON projects(team_id, deleted_at);

CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role project_role NOT NULL,
  added_by UUID NOT NULL REFERENCES users(id), joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ, UNIQUE(project_id, user_id)
);
CREATE INDEX project_members_user_id_removed_at_idx ON project_members(user_id, removed_at);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL, description TEXT, status task_status NOT NULL DEFAULT 'OPEN', due_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id), assignee_id UUID REFERENCES users(id), completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ, version INTEGER NOT NULL DEFAULT 1, search_vector TSVECTOR
);
CREATE INDEX tasks_project_id_status_deleted_at_idx ON tasks(project_id, status, deleted_at);
CREATE INDEX tasks_assignee_id_status_due_at_idx ON tasks(assignee_id, status, due_at);
CREATE INDEX tasks_project_id_due_at_idx ON tasks(project_id, due_at);
CREATE INDEX tasks_created_at_idx ON tasks(created_at);
CREATE INDEX tasks_search_vector_idx ON tasks USING GIN(search_vector);
CREATE FUNCTION task_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END $$;
CREATE TRIGGER task_search_vector_trigger BEFORE INSERT OR UPDATE OF title, description ON tasks
FOR EACH ROW EXECUTE FUNCTION task_search_vector_update();

CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);
CREATE INDEX task_comments_task_id_created_at_id_idx ON task_comments(task_id, created_at, id);

CREATE TABLE task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id), storage_provider VARCHAR(30) NOT NULL,
  storage_bucket VARCHAR(120) NOT NULL, storage_key TEXT NOT NULL UNIQUE,
  original_filename VARCHAR(255) NOT NULL, content_type VARCHAR(150) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK(size_bytes >= 0), checksum_sha256 CHAR(64),
  status attachment_status NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);
CREATE INDEX task_attachments_task_id_status_deleted_at_idx ON task_attachments(task_id, status, deleted_at);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id UUID REFERENCES users(id), team_id UUID REFERENCES teams(id),
  action VARCHAR(100) NOT NULL, entity_type VARCHAR(50) NOT NULL, entity_id UUID, request_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_type_entity_id_created_at_idx ON audit_logs(entity_type, entity_id, created_at);

CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id), key VARCHAR(200) NOT NULL,
  method VARCHAR(10) NOT NULL, route VARCHAR(300) NOT NULL, request_hash CHAR(64) NOT NULL,
  response_status INTEGER, response_body JSONB, locked_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key, method, route)
);
CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys(expires_at);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL, aggregate_id UUID NOT NULL, payload JSONB NOT NULL,
  status outbox_status NOT NULL DEFAULT 'PENDING', occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ, attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_error TEXT
);
CREATE INDEX outbox_events_status_next_attempt_at_occurred_at_idx ON outbox_events(status, next_attempt_at, occurred_at);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_event_id UUID NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_user_id UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id), task_id UUID REFERENCES tasks(id), type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL, UNIQUE(source_event_id, recipient_user_id)
);
CREATE INDEX notifications_recipient_user_id_created_at_id_idx ON notifications(recipient_user_id, created_at, id);

CREATE TABLE ai_generation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), requested_by UUID NOT NULL REFERENCES users(id),
  project_id UUID NOT NULL REFERENCES projects(id), task_id UUID REFERENCES tasks(id), purpose VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL, model VARCHAR(100) NOT NULL, input_hash CHAR(64) NOT NULL,
  status ai_request_status NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER, latency_ms INTEGER,
  provider_request_id TEXT, error_code VARCHAR(100), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ai_generation_requests_requested_by_purpose_created_at_idx ON ai_generation_requests(requested_by, purpose, created_at);
