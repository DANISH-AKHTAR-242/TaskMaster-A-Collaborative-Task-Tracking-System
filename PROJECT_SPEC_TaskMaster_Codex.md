# TaskMaster Backend — Codex Build Specification

> **Purpose:** Give this file to Codex as the authoritative implementation specification for the TaskMaster backend.
>
> **Instruction to Codex:** Build the complete repository described below. Work phase by phase, run tests and linters after each phase, and do not replace required functionality with placeholders. Optional features must be isolated behind feature flags and must not block the core MVP.

---

# SPEC-1-TaskMaster-Collaborative-Task-Tracking-System

## 0. Codex Execution Contract

### Primary objective

Create a production-oriented backend for a collaborative task tracking application where users can:

- Register, log in, refresh sessions, log out, and manage their profile.
- Create teams and invite members.
- Create projects with explicit project membership.
- Create, assign, update, complete, search, filter, sort, restore, and soft-delete tasks.
- Comment on tasks.
- Upload and download task attachments through presigned object-storage URLs.
- Optionally receive real-time notifications using Server-Sent Events.
- Optionally generate user-reviewed task drafts and summaries through a provider-neutral AI adapter.

### Rules for implementation

1. Treat this document as the source of truth.
2. Use strict TypeScript.
3. Keep controllers thin; place business rules in services and authorization policies.
4. Do not expose Prisma models directly as public API response types.
5. Validate all external input.
6. Enforce authorization on every resource read and write.
7. Use database transactions for multi-record business operations.
8. Do not store plaintext passwords, refresh tokens, invitation tokens, or provider secrets.
9. Do not store attachment binaries in PostgreSQL.
10. Do not let optional notifications or AI features break core task operations.
11. Do not leave `TODO`, fake implementations, disabled tests, or unhandled promise rejections in the final repository.
12. Run and fix all required checks before considering the project complete.

### Required final repository state

The repository must pass:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run build
```

The local development stack must start with:

```bash
docker compose up -d
npm run db:migrate
npm run dev
```

---

## Background

TaskMaster is a multi-team backend service for collaborative task tracking and project organization. It provides a centralized REST API for creating, assigning, monitoring, discussing, and completing work.

The initial release targets small and medium-sized teams, with an expected scale of approximately:

- 10,000 registered users.
- 1,000 concurrent authenticated users.
- Multiple teams per user.
- Multiple projects per team.
- Explicit membership for each project.

The backend will be delivered as a modular monolith. This keeps the MVP straightforward to deploy while preserving domain boundaries that can later be extracted into separate services.

---

## Requirements

### Must Have

- Users can register using a unique email address and password.
- Passwords are hashed using Argon2id.
- Users can log in and receive a short-lived JWT access token.
- Users receive a rotating opaque refresh token.
- Users can revoke the current session or all sessions.
- Users can view and update their own profile.
- Users can create teams.
- Team owners and administrators can invite users.
- Users can accept valid invitations associated with their account email.
- Users can belong to multiple teams.
- Teams can contain multiple projects.
- Every project uses explicit project membership.
- Team membership alone does not grant access to project task content.
- Project administrators can manage project membership.
- Project members can create tasks.
- Tasks support title, description, status, due date, creator, assignee, completion timestamp, and soft deletion.
- Assignees must be active members of the task's project.
- Users can list tasks assigned to them.
- Users can mark permitted tasks completed or reopen them.
- Tasks can be filtered, sorted, searched, and paginated.
- Project members can comment on tasks.
- Authorized project members can attach files to tasks.
- Attachment data is stored in S3-compatible object storage.
- PostgreSQL stores attachment metadata.
- Request bodies, path parameters, and query parameters are validated.
- API errors follow a consistent Problem Details format.
- Authorization is enforced at team, project, task, comment, attachment, and notification boundaries.
- Database migrations are included.
- Automated unit and integration tests cover authentication, authorization, membership, tasks, comments, and attachments.
- The repository contains a complete README and OpenAPI description.

### Should Have

- Refresh-token rotation and reuse detection.
- Optimistic concurrency control for task updates.
- Audit logging for important mutations.
- Idempotency keys for important create operations.
- Keyset pagination instead of offset pagination.
- Rate limiting.
- Project and task restoration after soft deletion.
- Docker-based local dependencies.
- Structured logs with request correlation IDs.
- Health and readiness endpoints.

### Could Have

- Real-time in-application notifications using Server-Sent Events.
- Notification persistence and replay.
- AI-assisted task draft generation.
- AI-generated task and comment-thread summaries.
- Email invitation delivery.
- Configurable notification preferences.

### Won't Have in the MVP

- Billing and subscriptions.
- Native mobile applications.
- Offline synchronization.
- Social login, SAML, or LDAP.
- Multi-region active-active deployment.
- Custom workflow builders.
- Complex approval workflows.
- Automatic AI writes to tasks.
- AI access to attachment contents.
- WebSocket-based collaborative editing.

---

## Method

## 1. Technology Baseline

Use stable releases within these supported major versions:

| Area | Technology |
|---|---|
| Runtime | Node.js 24 LTS |
| Language | TypeScript, strict mode |
| HTTP framework | Express 5.x |
| Database | PostgreSQL 18.x |
| ORM and migrations | Prisma ORM 7.x |
| Validation | Zod 4.x |
| JWT | `jose` 6.x |
| Password hashing | `argon2` with Argon2id |
| Logging | Pino |
| Tests | Vitest and Supertest |
| API documentation | OpenAPI 3.1 or newer supported version |
| Object storage | S3-compatible API; MinIO locally |
| Optional shared state | Redis |
| Optional AI | Provider-neutral adapter; OpenAI implementation allowed |
| Package manager | npm with committed `package-lock.json` |

Do not depend on floating package versions in production. Commit the generated lockfile.

## 2. Architectural Style

Implement a modular monolith with one Express application and explicit module boundaries.

```text
src/
├── app/
│   ├── create-app.ts
│   ├── routes.ts
│   ├── openapi.ts
│   └── middleware/
│       ├── authenticate.ts
│       ├── error-handler.ts
│       ├── not-found.ts
│       ├── request-id.ts
│       ├── request-logger.ts
│       ├── rate-limit.ts
│       └── validate.ts
├── config/
│   ├── env.ts
│   └── constants.ts
├── modules/
│   ├── auth/
│   ├── users/
│   ├── teams/
│   ├── projects/
│   ├── tasks/
│   ├── comments/
│   ├── attachments/
│   ├── notifications/
│   ├── ai/
│   ├── audit/
│   └── health/
├── infrastructure/
│   ├── database/
│   ├── storage/
│   ├── events/
│   ├── cache/
│   └── observability/
├── shared/
│   ├── authorization/
│   ├── errors/
│   ├── pagination/
│   ├── security/
│   ├── types/
│   └── utilities/
├── server.ts
└── worker.ts
```

Each feature module should follow this pattern where applicable:

```text
<module>/
├── controller.ts
├── service.ts
├── repository.ts
├── policy.ts
├── routes.ts
├── schemas.ts
├── dto.ts
├── events.ts
└── index.ts
```

### Responsibility rules

- **Routes:** route definitions and middleware composition.
- **Controllers:** translate HTTP input into service calls and service results into HTTP responses.
- **Services:** business rules, transactions, orchestration, and domain event creation.
- **Repositories:** Prisma/database operations only.
- **Policies:** authorization decisions only.
- **Schemas:** Zod schemas for external inputs.
- **DTOs:** explicit public response shapes.
- **Infrastructure:** integrations with PostgreSQL, Redis, object storage, email, logging, and AI providers.

Do not import controllers across modules. Cross-module calls must go through exported application services or narrow interfaces.

## 3. Component Diagram

```plantuml
@startuml
actor User
rectangle "Client" as Client
rectangle "HTTPS Reverse Proxy" as Proxy

node "TaskMaster API" {
  component "Auth Module"
  component "User Module"
  component "Team Module"
  component "Project Module"
  component "Task Module"
  component "Comment Module"
  component "Attachment Module"
  component "Authorization Policies"
  component "Audit Module"
  component "Optional Notification Module"
  component "Optional AI Module"
}

database "PostgreSQL" as DB
cloud "S3-Compatible Storage" as Storage
queue "Optional Redis" as Redis
node "Optional Worker" as Worker
cloud "Optional AI Provider" as AI

User --> Client
Client --> Proxy : HTTPS
Proxy --> "TaskMaster API"
"TaskMaster API" --> DB
"Attachment Module" --> Storage
"Optional Notification Module" --> Redis
Worker --> DB
Worker --> Redis
"Optional AI Module" --> AI
@enduml
```

## 4. Authentication and Session Design

### Passwords

- Hash passwords with Argon2id.
- Use the library's secure defaults unless deployment benchmarking produces stronger safe parameters.
- Never log passwords.
- Never return password hashes.
- A password must be at least 12 characters and at most 128 characters.
- Do not impose composition rules that reduce usability.
- Allow all printable Unicode characters.

### Access token

Use a signed JWT with a 15-minute lifetime.

Required claims:

```json
{
  "sub": "user UUID",
  "sid": "session UUID",
  "iss": "taskmaster-api",
  "aud": "taskmaster-client",
  "iat": 0,
  "exp": 0
}
```

Rules:

- Sign with an asymmetric key pair where practical.
- Validate issuer, audience, signature, expiration, subject, and session identifier.
- Do not store team or project roles in the access token.
- Use the current database membership for authorization.

### Refresh token

Use an opaque random token with at least 256 bits of entropy.

- Recommended lifetime: 30 days.
- Browser delivery: `Secure`, `HttpOnly`, `SameSite=Lax` cookie.
- Store only a SHA-256 hash in PostgreSQL.
- Rotate the token on every successful refresh.
- Revoke the full token family when a revoked refresh token is reused.
- Verify the request origin for cookie-authenticated refresh and logout endpoints.
- Clear the cookie on logout even when the session is already revoked.

### Authentication flow

```plantuml
@startuml
participant Client
participant API
database PostgreSQL

Client -> API : POST /auth/login
API -> PostgreSQL : Find normalized email
API -> API : Verify Argon2id hash
API -> PostgreSQL : Create auth session
API --> Client : JWT access token + refresh cookie

Client -> API : POST /auth/refresh
API -> PostgreSQL : Hash and find refresh token
alt active session
  API -> PostgreSQL : Revoke old token and create replacement
  API --> Client : New access token + refresh cookie
else reused revoked token
  API -> PostgreSQL : Revoke token family
  API --> Client : 401
else invalid or expired
  API --> Client : 401
end
@enduml
```

## 5. Authorization Model

### Team roles

- `OWNER`
- `ADMIN`
- `MEMBER`

### Project roles

- `ADMIN`
- `MEMBER`
- `VIEWER`

### Core rules

1. Team creation automatically creates an `OWNER` membership for the creator.
2. There must always be at least one active team owner.
3. Ownership transfer is a separate transaction.
4. Project creation automatically creates a project `ADMIN` membership for the creator.
5. Only active team members can become project members.
6. Team membership does not automatically grant access to project task content.
7. Team owners can manage project existence and project membership metadata but cannot read task content without active project membership.
8. Only active project members can be task assignees.
9. Project viewers have read-only access.
10. Project members can create tasks and comments.
11. A task creator or current assignee may update ordinary task fields unless a stricter project policy denies it.
12. Project administrators can update, archive, restore, or delete any project task.
13. Comment authors can edit their own comments.
14. Comment authors or project administrators can delete comments.
15. Attachment access inherits access from the parent task.
16. Unauthorized resources should usually return `404` rather than reveal that a hidden resource exists.
17. List endpoints must filter unauthorized data in SQL.

### Authorization matrix

| Operation | Team Owner | Team Admin | Project Admin | Project Member | Project Viewer |
|---|---:|---:|---:|---:|---:|
| Update team | Yes | Yes | No | No | No |
| Delete team | Yes | No | No | No | No |
| Invite team member | Yes | Yes | No | No | No |
| Create project | Yes | Yes | No | No | No |
| Manage project membership | Yes, metadata only | Yes, metadata only | Yes | No | No |
| Read task content | Only with project membership | Only with project membership | Yes | Yes | Yes |
| Create task | With project role | With project role | Yes | Yes | No |
| Assign task | With project role | With project role | Yes | Yes | No |
| Delete/restore any task | No unless project admin | No unless project admin | Yes | No | No |
| Add comment | With project role | With project role | Yes | Yes | No |
| Read comments | With project role | With project role | Yes | Yes | Yes |
| Upload attachment | With project role | With project role | Yes | Yes | No |

## 6. Database Model

Use UUID primary keys, UTC `TIMESTAMPTZ` timestamps, and snake_case database names.

### Required enums

```text
TEAM_ROLE:
  OWNER
  ADMIN
  MEMBER

PROJECT_ROLE:
  ADMIN
  MEMBER
  VIEWER

TASK_STATUS:
  OPEN
  IN_PROGRESS
  COMPLETED

ATTACHMENT_STATUS:
  PENDING
  READY
  FAILED
  DELETED

AI_REQUEST_STATUS:
  PENDING
  COMPLETED
  FAILED

OUTBOX_STATUS:
  PENDING
  PUBLISHED
  DEAD_LETTER
```

### Required tables

#### users

```text
id                    UUID PRIMARY KEY
email                 VARCHAR(320) NOT NULL
password_hash         TEXT NOT NULL
display_name          VARCHAR(120) NOT NULL
avatar_url            TEXT NULL
email_verified_at     TIMESTAMPTZ NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at            TIMESTAMPTZ NOT NULL
deleted_at            TIMESTAMPTZ NULL
```

Create a case-insensitive unique active-email index:

```sql
CREATE UNIQUE INDEX users_email_active_unique
ON users (lower(email))
WHERE deleted_at IS NULL;
```

#### auth_sessions

```text
id                    UUID PRIMARY KEY
user_id               UUID NOT NULL REFERENCES users(id)
token_family_id       UUID NOT NULL
refresh_token_hash    CHAR(64) NOT NULL UNIQUE
replaced_by_id        UUID NULL REFERENCES auth_sessions(id)
user_agent            TEXT NULL
ip_address            INET NULL
expires_at            TIMESTAMPTZ NOT NULL
revoked_at            TIMESTAMPTZ NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

Indexes:

```text
(user_id, revoked_at)
(token_family_id)
(expires_at)
```

#### teams

```text
id                    UUID PRIMARY KEY
name                  VARCHAR(120) NOT NULL
slug                  VARCHAR(80) NOT NULL
created_by            UUID NOT NULL REFERENCES users(id)
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at            TIMESTAMPTZ NOT NULL
deleted_at            TIMESTAMPTZ NULL
```

Create a unique active slug index.

#### team_members

```text
id                    UUID PRIMARY KEY
team_id               UUID NOT NULL REFERENCES teams(id)
user_id               UUID NOT NULL REFERENCES users(id)
role                  TEAM_ROLE NOT NULL
joined_at             TIMESTAMPTZ NOT NULL DEFAULT now()
removed_at            TIMESTAMPTZ NULL

UNIQUE (team_id, user_id)
```

Retain removed membership records for history.

#### team_invitations

```text
id                    UUID PRIMARY KEY
team_id               UUID NOT NULL REFERENCES teams(id)
email                 VARCHAR(320) NOT NULL
role                  TEAM_ROLE NOT NULL
token_hash            CHAR(64) NOT NULL UNIQUE
invited_by            UUID NOT NULL REFERENCES users(id)
expires_at            TIMESTAMPTZ NOT NULL
accepted_at           TIMESTAMPTZ NULL
revoked_at            TIMESTAMPTZ NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

Create a partial unique index for active invitations by team and normalized email.

#### projects

```text
id                    UUID PRIMARY KEY
team_id               UUID NOT NULL REFERENCES teams(id)
name                  VARCHAR(160) NOT NULL
description           TEXT NULL
created_by            UUID NOT NULL REFERENCES users(id)
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at            TIMESTAMPTZ NOT NULL
archived_at           TIMESTAMPTZ NULL
deleted_at            TIMESTAMPTZ NULL
```

#### project_members

```text
id                    UUID PRIMARY KEY
project_id            UUID NOT NULL REFERENCES projects(id)
user_id               UUID NOT NULL REFERENCES users(id)
role                  PROJECT_ROLE NOT NULL
added_by              UUID NOT NULL REFERENCES users(id)
joined_at             TIMESTAMPTZ NOT NULL DEFAULT now()
removed_at            TIMESTAMPTZ NULL

UNIQUE (project_id, user_id)
```

#### tasks

```text
id                    UUID PRIMARY KEY
project_id            UUID NOT NULL REFERENCES projects(id)
title                 VARCHAR(200) NOT NULL
description           TEXT NULL
status                TASK_STATUS NOT NULL DEFAULT 'OPEN'
due_at                TIMESTAMPTZ NULL
created_by            UUID NOT NULL REFERENCES users(id)
assignee_id           UUID NULL REFERENCES users(id)
completed_at          TIMESTAMPTZ NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at            TIMESTAMPTZ NOT NULL
deleted_at            TIMESTAMPTZ NULL
version               INTEGER NOT NULL DEFAULT 1
search_vector         TSVECTOR
```

Indexes:

```text
(project_id, status, deleted_at)
(assignee_id, status, due_at)
(project_id, due_at)
(created_at)
GIN(search_vector)
```

Maintain `search_vector` using a generated column if supported cleanly by the chosen migration approach, otherwise use a PostgreSQL trigger.

Weight task title more heavily than description.

Example:

```sql
setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
setweight(to_tsvector('english', coalesce(description, '')), 'B')
```

#### task_comments

```text
id                    UUID PRIMARY KEY
task_id               UUID NOT NULL REFERENCES tasks(id)
author_id             UUID NOT NULL REFERENCES users(id)
body                  TEXT NOT NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at            TIMESTAMPTZ NOT NULL
deleted_at            TIMESTAMPTZ NULL
```

Index `(task_id, created_at, id)`.

#### task_attachments

```text
id                    UUID PRIMARY KEY
task_id               UUID NOT NULL REFERENCES tasks(id)
uploaded_by           UUID NOT NULL REFERENCES users(id)
storage_provider      VARCHAR(30) NOT NULL
storage_bucket        VARCHAR(120) NOT NULL
storage_key           TEXT NOT NULL UNIQUE
original_filename     VARCHAR(255) NOT NULL
content_type          VARCHAR(150) NOT NULL
size_bytes            BIGINT NOT NULL
checksum_sha256       CHAR(64) NULL
status                ATTACHMENT_STATUS NOT NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at            TIMESTAMPTZ NULL
```

#### audit_logs

```text
id                    UUID PRIMARY KEY
actor_user_id         UUID NULL REFERENCES users(id)
team_id               UUID NULL REFERENCES teams(id)
action                VARCHAR(100) NOT NULL
entity_type           VARCHAR(50) NOT NULL
entity_id             UUID NULL
request_id            UUID NOT NULL
metadata              JSONB NOT NULL DEFAULT '{}'
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

Audit records are append-only.

#### idempotency_keys

```text
id                    UUID PRIMARY KEY
user_id               UUID NULL REFERENCES users(id)
key                   VARCHAR(200) NOT NULL
method                 VARCHAR(10) NOT NULL
route                  VARCHAR(300) NOT NULL
request_hash           CHAR(64) NOT NULL
response_status        INTEGER NULL
response_body          JSONB NULL
locked_until           TIMESTAMPTZ NULL
expires_at             TIMESTAMPTZ NOT NULL
created_at             TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE (user_id, key, method, route)
```

#### outbox_events

Required when notifications are enabled; safe to create in the initial schema.

```text
id                    UUID PRIMARY KEY
event_type            VARCHAR(100) NOT NULL
aggregate_type        VARCHAR(50) NOT NULL
aggregate_id          UUID NOT NULL
payload               JSONB NOT NULL
status                OUTBOX_STATUS NOT NULL DEFAULT 'PENDING'
occurred_at            TIMESTAMPTZ NOT NULL DEFAULT now()
published_at          TIMESTAMPTZ NULL
attempt_count         INTEGER NOT NULL DEFAULT 0
next_attempt_at       TIMESTAMPTZ NOT NULL DEFAULT now()
last_error            TEXT NULL
```

#### notifications

```text
id                    UUID PRIMARY KEY
source_event_id       UUID NOT NULL REFERENCES outbox_events(id)
recipient_user_id     UUID NOT NULL REFERENCES users(id)
actor_user_id         UUID NULL REFERENCES users(id)
project_id            UUID NULL REFERENCES projects(id)
task_id               UUID NULL REFERENCES tasks(id)
type                  VARCHAR(100) NOT NULL
payload               JSONB NOT NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
read_at               TIMESTAMPTZ NULL
expires_at            TIMESTAMPTZ NOT NULL

UNIQUE (source_event_id, recipient_user_id)
```

#### ai_generation_requests

```text
id                    UUID PRIMARY KEY
requested_by          UUID NOT NULL REFERENCES users(id)
project_id            UUID NOT NULL REFERENCES projects(id)
task_id               UUID NULL REFERENCES tasks(id)
purpose               VARCHAR(50) NOT NULL
provider              VARCHAR(50) NOT NULL
model                 VARCHAR(100) NOT NULL
input_hash            CHAR(64) NOT NULL
status                AI_REQUEST_STATUS NOT NULL
prompt_tokens         INTEGER NULL
completion_tokens     INTEGER NULL
latency_ms             INTEGER NULL
provider_request_id   TEXT NULL
error_code            VARCHAR(100) NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
completed_at          TIMESTAMPTZ NULL
expires_at            TIMESTAMPTZ NOT NULL
```

Do not store raw prompts or generated text by default.

### Prisma requirements

- Represent supported relations and enums in `prisma/schema.prisma`.
- Use custom SQL migrations for partial indexes, `INET`, `TSVECTOR`, full-text indexes, generated columns, or triggers that Prisma cannot express directly.
- Never use `prisma db push` as the production migration workflow.
- Add seed data through `prisma/seed.ts`.
- Use one Prisma client instance per process.
- Configure graceful disconnection during shutdown.

## 7. Transaction Boundaries

Use PostgreSQL transactions for:

- Team creation and owner membership creation.
- Project creation and project-admin membership creation.
- Invitation acceptance and team membership creation.
- Ownership transfer.
- Project-member creation after validating team membership.
- Task creation after validating assignee membership.
- Task status update and completion timestamp update.
- Task mutation and corresponding audit/outbox insert.
- Refresh-token rotation.
- Token-family revocation.
- Soft deletion and associated cleanup-job creation.
- Notification fan-out idempotency.

Use the transactional outbox pattern for notification events.

## 8. REST API Conventions

Base path:

```text
/api/v1
```

### Success response

```json
{
  "data": {
    "id": "UUID"
  }
}
```

### Collection response

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

### Request ID

- Accept a valid `X-Request-Id` or generate a UUID.
- Return it as `X-Request-Id`.
- Include it in logs, audit records, and errors.

### Content types

- JSON requests: `application/json`.
- Errors: `application/problem+json`.
- SSE: `text/event-stream`.
- Binary attachments transfer directly between client and object storage.

## 9. Error Contract

Use RFC Problem Details semantics.

Example:

```json
{
  "type": "https://taskmaster.example/problems/validation-error",
  "title": "Request validation failed",
  "status": 422,
  "detail": "One or more request fields are invalid.",
  "instance": "/api/v1/projects/PROJECT_ID/tasks",
  "code": "VALIDATION_ERROR",
  "requestId": "UUID",
  "errors": [
    {
      "path": "title",
      "code": "too_small",
      "message": "Title is required."
    }
  ]
}
```

Status mapping:

| Status | Meaning |
|---:|---|
| 400 | Malformed request |
| 401 | Missing, invalid, expired, or revoked authentication |
| 403 | Authenticated but forbidden |
| 404 | Missing or intentionally hidden resource |
| 409 | Version, state, membership, idempotency, or uniqueness conflict |
| 413 | Attachment too large |
| 415 | Unsupported content type |
| 422 | Validation failure |
| 429 | Rate limit exceeded |
| 500 | Unexpected internal failure |
| 502 | Invalid upstream response |
| 503 | Optional provider unavailable |
| 504 | Optional provider timeout |

Never expose stack traces, SQL errors, internal storage keys, tokens, secrets, or provider credentials.

## 10. Validation Rules

| Field | Rule |
|---|---|
| Email | Valid email, maximum 320 characters, normalized for lookup |
| Password | 12–128 characters |
| Display name | 1–120 trimmed characters |
| Team name | 1–120 trimmed characters |
| Team slug | Lowercase URL-safe slug, 3–80 characters |
| Project name | 1–160 trimmed characters |
| Task title | 1–200 trimmed characters |
| Task description | Maximum 20,000 characters |
| Comment body | 1–10,000 characters |
| Search text | 2–200 characters |
| Attachment name | 1–255 characters |
| Attachment size | Maximum 25 MB |
| UUID | Valid UUID |
| Dates | RFC 3339 with explicit timezone |

Additional rules:

- Reject unknown properties in create and update payloads.
- Never accept ownership, creator, password hash, audit fields, or internal storage fields from clients.
- Validate query parameters before database access.
- Normalize and validate pagination inputs.
- Validate uploaded object size and type again during attachment completion.

## 11. API Endpoints

### Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health/live` | No | Process liveness |
| `GET` | `/health/ready` | No | Database and required dependency readiness |

### Authentication and profile

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | No | Register |
| `POST` | `/auth/login` | No | Log in |
| `POST` | `/auth/refresh` | Refresh cookie | Rotate session |
| `POST` | `/auth/logout` | Refresh cookie or access token | Revoke current session |
| `POST` | `/auth/logout-all` | Access token | Revoke all sessions |
| `GET` | `/users/me` | Access token | Get profile |
| `PATCH` | `/users/me` | Access token | Update profile |

Registration request:

```json
{
  "email": "alex@example.com",
  "password": "correct-horse-battery-staple",
  "displayName": "Alex Morgan"
}
```

Login request:

```json
{
  "email": "alex@example.com",
  "password": "correct-horse-battery-staple"
}
```

Profile update request:

```json
{
  "displayName": "Alex M.",
  "avatarUrl": "https://example.com/avatar.png"
}
```

Return the same public error for unknown email and incorrect password.

### Teams

| Method | Path | Authorization |
|---|---|---|
| `POST` | `/teams` | Authenticated |
| `GET` | `/teams` | Current user's active teams |
| `GET` | `/teams/{teamId}` | Active team member |
| `PATCH` | `/teams/{teamId}` | Team owner/admin |
| `DELETE` | `/teams/{teamId}` | Team owner |
| `POST` | `/teams/{teamId}/restore` | Team owner |
| `GET` | `/teams/{teamId}/members` | Active team member |
| `PATCH` | `/teams/{teamId}/members/{userId}` | Team owner/admin |
| `DELETE` | `/teams/{teamId}/members/{userId}` | Team owner/admin |
| `POST` | `/teams/{teamId}/ownership-transfer` | Team owner |

Prevent deletion or demotion of the last active owner.

### Team invitations

| Method | Path | Authorization |
|---|---|---|
| `POST` | `/teams/{teamId}/invitations` | Team owner/admin |
| `GET` | `/teams/{teamId}/invitations` | Team owner/admin |
| `DELETE` | `/teams/{teamId}/invitations/{invitationId}` | Team owner/admin |
| `POST` | `/team-invitations/accept` | Authenticated invitee |

Invitation acceptance:

```json
{
  "token": "opaque-invitation-secret"
}
```

Invitation rules:

- Store only the invitation-token hash.
- Default expiration: seven days.
- Match the invite email to the authenticated account's normalized email.
- Reject accepted, revoked, expired, or mismatched invitations.
- Invitation acceptance must be idempotent.

### Projects

| Method | Path | Authorization |
|---|---|---|
| `POST` | `/teams/{teamId}/projects` | Team owner/admin |
| `GET` | `/teams/{teamId}/projects` | Active team member; content filtered |
| `GET` | `/projects/{projectId}` | Active project member |
| `PATCH` | `/projects/{projectId}` | Project admin |
| `DELETE` | `/projects/{projectId}` | Project admin |
| `POST` | `/projects/{projectId}/restore` | Project admin |
| `GET` | `/projects/{projectId}/members` | Project member |
| `POST` | `/projects/{projectId}/members` | Project admin or authorized team admin metadata flow |
| `PATCH` | `/projects/{projectId}/members/{userId}` | Project admin |
| `DELETE` | `/projects/{projectId}/members/{userId}` | Project admin |

Do not expose task counts or task content to a team owner who lacks project membership.

### Tasks

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/projects/{projectId}/tasks` | Create task |
| `GET` | `/projects/{projectId}/tasks` | List visible project tasks |
| `GET` | `/tasks` | List tasks visible to the current user |
| `GET` | `/tasks/{taskId}` | Get task |
| `PATCH` | `/tasks/{taskId}` | Update task |
| `DELETE` | `/tasks/{taskId}` | Soft-delete task |
| `POST` | `/tasks/{taskId}/restore` | Restore task |

Task creation:

```json
{
  "title": "Prepare release notes",
  "description": "Summarize changes included in version 1.4.",
  "dueAt": "2026-08-05T12:00:00Z",
  "assigneeId": "USER_UUID"
}
```

Task update:

```json
{
  "status": "COMPLETED",
  "version": 4
}
```

Every mutation must include the last observed `version`. Increment the version atomically.

Example update:

```sql
UPDATE tasks
SET
  status = $1,
  completed_at = $2,
  version = version + 1,
  updated_at = now()
WHERE id = $3
  AND version = $4
  AND deleted_at IS NULL;
```

Zero updated rows return:

```text
409 TASK_VERSION_CONFLICT
```

Status transitions:

```text
OPEN -> IN_PROGRESS
OPEN -> COMPLETED
IN_PROGRESS -> OPEN
IN_PROGRESS -> COMPLETED
COMPLETED -> OPEN
COMPLETED -> IN_PROGRESS
```

Completing sets `completedAt`; reopening clears it.

### Task query parameters

```text
status=OPEN,IN_PROGRESS
assigneeId=<uuid>
assignee=me
unassigned=true
createdBy=<uuid>
dueBefore=<RFC3339>
dueAfter=<RFC3339>
search=<text>
sort=createdAt|updatedAt|dueAt|title|status
order=asc|desc
cursor=<opaque>
limit=25
```

Rules:

- Default limit: 25.
- Maximum limit: 100.
- Use keyset pagination.
- Use `id` as the final deterministic sort key.
- Put `NULL` due dates last.
- Sign or authenticate cursors so clients cannot alter their content.
- Cursor payload should contain route-relevant filter hash, sort field, direction, final sort value, and final UUID.

### Search

Use PostgreSQL full-text search:

```sql
search_vector @@ websearch_to_tsquery('english', $search)
```

Order search results by rank and UUID.

Do not construct raw SQL with concatenated user input.

### Comments

| Method | Path | Authorization |
|---|---|---|
| `POST` | `/tasks/{taskId}/comments` | Project member/admin |
| `GET` | `/tasks/{taskId}/comments` | Project viewer/member/admin |
| `PATCH` | `/comments/{commentId}` | Author |
| `DELETE` | `/comments/{commentId}` | Author or project admin |

Comment creation:

```json
{
  "body": "The draft is ready for review."
}
```

Comment deletion is soft deletion.

### Attachments

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/tasks/{taskId}/attachments/uploads` | Initialize upload |
| `POST` | `/attachments/{attachmentId}/complete` | Verify upload |
| `GET` | `/tasks/{taskId}/attachments` | List attachments |
| `POST` | `/attachments/{attachmentId}/download-url` | Get authorized URL |
| `DELETE` | `/attachments/{attachmentId}` | Soft-delete attachment |

Upload initialization:

```json
{
  "filename": "requirements.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 734003
}
```

Attachment workflow:

1. Authorize access to the parent task.
2. Validate filename, declared type, and size.
3. Generate a server-controlled random storage key.
4. Insert a `PENDING` attachment.
5. Return a presigned upload URL valid for ten minutes.
6. Client uploads directly to object storage.
7. Client calls the completion endpoint.
8. Server performs an object metadata/HEAD request.
9. Verify object existence, size, key, and type.
10. Change the record to `READY`.
11. Return attachment metadata.
12. A cleanup worker removes stale `PENDING` uploads after 24 hours.

Limits:

```text
Maximum size: 25 MB
Upload URL lifetime: 10 minutes
Download URL lifetime: 5 minutes
Pending lifetime: 24 hours
```

Use an allowlist of common image, text, PDF, office-document, spreadsheet, plain-data, and archive MIME types. Reject executables, scripts, and mismatched metadata.

Never expose the object-storage key directly as a public download mechanism.

### Notifications — optional

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/notifications` | List notifications |
| `GET` | `/notifications/unread-count` | Get unread count |
| `PATCH` | `/notifications/{notificationId}` | Mark read/unread |
| `POST` | `/notifications/read-all` | Mark all visible notifications read |
| `GET` | `/notifications/stream` | Open SSE stream |

Initial event types:

```text
TASK_ASSIGNED
TASK_REASSIGNED
TASK_UPDATED
TASK_COMPLETED
TASK_REOPENED
TASK_COMMENT_ADDED
PROJECT_MEMBER_ADDED
PROJECT_MEMBER_REMOVED
```

SSE requirements:

- `Content-Type: text/event-stream`
- Heartbeat every 20 seconds.
- Persist notifications in PostgreSQL.
- At-least-once delivery.
- De-duplicate by notification UUID.
- Accept `Last-Event-ID` and replay missed events.
- Maximum five open streams per user.
- Close slow clients when the unsent buffer exceeds a safe configured threshold.
- Close connections during graceful shutdown.
- Retain notifications for 30 days.
- Use Redis for cross-instance pub/sub in production.
- PostgreSQL remains the source of truth.

Process outbox records with:

```sql
SELECT id
FROM outbox_events
WHERE status = 'PENDING'
  AND next_attempt_at <= now()
ORDER BY occurred_at
FOR UPDATE SKIP LOCKED
LIMIT 100;
```

Use exponential backoff with jitter. Move repeatedly failing events to `DEAD_LETTER`.

### AI — optional

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/projects/{projectId}/ai/task-drafts` | Generate task draft |
| `POST` | `/tasks/{taskId}/ai/summary` | Generate task summary |

Create a provider-neutral interface:

```typescript
export interface TaskGenerationProvider {
  generateTaskDraft(
    input: TaskDraftInput,
    context: GenerationContext,
  ): Promise<TaskDraftResult>;

  summarizeTask(
    input: TaskSummaryInput,
    context: GenerationContext,
  ): Promise<TaskSummaryResult>;
}
```

Provide:

- `DisabledTaskGenerationProvider`
- One provider implementation configured through environment variables

AI rules:

- AI never creates or updates a task directly.
- Return a draft requiring explicit user approval.
- The user submits approved fields through the normal task endpoint.
- Re-run all standard validation and authorization.
- Treat model output as untrusted.
- Validate structured output with Zod.
- Do not send passwords, tokens, secret keys, or unrelated project data.
- Do not send attachment contents in the first implementation.
- Do not store raw prompts or output by default.
- Pin the model identifier.
- AI failures must not affect ordinary task operations.

Task-draft request:

```json
{
  "prompt": "Prepare the production release and coordinate QA sign-off.",
  "includeProjectContext": true
}
```

Task-draft result:

```json
{
  "data": {
    "generationId": "UUID",
    "title": "Coordinate production release",
    "description": "Prepare the release candidate, verify QA approval, coordinate deployment, and document the release outcome.",
    "acceptanceCriteria": [
      "QA sign-off is recorded",
      "Deployment checklist is completed",
      "Release notes are published"
    ],
    "suggestedDueAt": null,
    "requiresUserApproval": true
  }
}
```

Validate output:

```typescript
const generatedTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20_000),
  acceptanceCriteria: z
    .array(z.string().trim().min(1).max(500))
    .max(10),
  suggestedDueAt: z.string().datetime().nullable(),
});
```

Limits:

```text
Maximum prompt: 4,000 characters
Maximum selected comment text: 20,000 characters
Task drafts per user: 20/day
Summaries per user: 20/day
Provider timeout: 20 seconds
Maximum attempts: 2 for transient failures
Metadata retention: 30 days
```

## 12. Idempotency

Support the `Idempotency-Key` header for:

- Registration.
- Team creation.
- Project creation.
- Task creation.
- Invitation creation.
- Attachment upload initialization.

Behavior:

1. Hash the normalized request body.
2. Store user, route, method, key, request hash, and result.
3. Keep completed records for 24 hours.
4. Identical replays return the original response.
5. Reuse with a different request returns `409 IDEMPOTENCY_KEY_REUSED`.
6. Concurrent requests using the same key must not perform the action twice.

## 13. Rate Limits

Initial defaults:

```text
Registration:       5 requests/hour/IP
Login failures:    10 attempts/15 minutes/account+IP
Refresh:           30 requests/minute/session
General API:      300 requests/minute/user
Search:            60 requests/minute/user
Upload init:       30 requests/hour/user
AI draft:          20 requests/day/user
AI summary:        20 requests/day/user
```

- Local development may use an in-memory limiter.
- Multi-instance production deployments must use Redis.
- Return standard rate-limit headers and `429`.

## 14. Security Requirements

- Run behind TLS in production.
- Use Helmet with reviewed settings.
- Configure CORS from an explicit allowlist.
- Limit JSON request-body size.
- Disable Express framework identification.
- Protect refresh-cookie endpoints with origin checks.
- Use parameterized database queries.
- Validate all UUIDs and query parameters.
- Never log credentials, access tokens, refresh tokens, invitation tokens, cookies, authorization headers, or raw AI prompts.
- Redact sensitive fields in Pino configuration.
- Use a deployment secret manager in production.
- Apply least-privilege credentials for PostgreSQL, Redis, object storage, and AI.
- Use separate object-storage buckets or prefixes per environment.
- Generate object keys on the server.
- Use dependency scanning in CI.
- Return generic login errors.
- Record security-sensitive actions in the audit log.
- Use graceful shutdown for HTTP, Prisma, Redis, workers, and SSE connections.
- Apply database connection limits appropriate for each process and deployment replica.
- Do not include personally sensitive content in notification payloads beyond what is required for the UI.

## 15. Logging and Observability

Use structured JSON logs with Pino.

Each request log must include, when available:

```text
requestId
method
route
statusCode
durationMs
userId
sessionId
teamId
projectId
taskId
clientIp
userAgent
```

Redact secrets and request fields such as:

```text
password
refreshToken
authorization
cookie
invitationToken
providerApiKey
```

Expose:

- Liveness endpoint.
- Readiness endpoint.
- Request latency metrics.
- Error count by code.
- Authentication failure count.
- Database query duration.
- Active SSE connections.
- Outbox backlog.
- Notification processing failures.
- AI provider latency, failure rate, and token usage metadata.

Do not use high-cardinality labels such as raw request IDs in metrics.

## 16. Configuration

Create `.env.example` with at least:

```dotenv
NODE_ENV=development
PORT=3000
APP_BASE_URL=http://localhost:3000
CLIENT_ORIGINS=http://localhost:5173

DATABASE_URL=postgresql://taskmaster:taskmaster@localhost:5432/taskmaster
DIRECT_DATABASE_URL=postgresql://taskmaster:taskmaster@localhost:5432/taskmaster

JWT_ISSUER=taskmaster-api
JWT_AUDIENCE=taskmaster-client
JWT_PRIVATE_KEY_BASE64=
JWT_PUBLIC_KEY_BASE64=
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000
REFRESH_COOKIE_NAME=taskmaster_refresh

PASSWORD_PEPPER=
INVITATION_TOKEN_TTL_SECONDS=604800

S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=taskmaster
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
ATTACHMENT_MAX_BYTES=26214400

REDIS_URL=redis://localhost:6379
NOTIFICATIONS_ENABLED=false
SSE_ENABLED=false

AI_ENABLED=false
AI_PROVIDER=disabled
AI_MODEL=
OPENAI_API_KEY=

LOG_LEVEL=info
```

Validate environment variables with Zod at process startup. Exit with a clear configuration error when required values are invalid.

## 17. Local Development Infrastructure

Create `compose.yaml` containing:

- PostgreSQL.
- MinIO.
- MinIO bucket initialization.
- Redis.
- Optional Mailpit for local invitation emails.

Use persistent named volumes.

The API may run on the host during development. A production `Dockerfile` must also be included.

### Dockerfile requirements

- Multi-stage build.
- Non-root runtime user.
- Production dependencies only in the runtime stage.
- Copy generated Prisma client.
- Include a health check or document the orchestrator health endpoint.
- Do not bake secrets into the image.
- Use a small official Node.js image compatible with native `argon2` dependencies.

## 18. Package Scripts

Include at least:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "dev:worker": "tsx watch src/worker.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js",
    "start:worker": "node dist/worker.js",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier . --write",
    "format:check": "prettier . --check",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --exclude '**/*.integration.test.ts'",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:coverage": "vitest run --coverage",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy",
    "db:migrate:dev": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "openapi:check": "node scripts/check-openapi.mjs"
  }
}
```

Adjust exact commands to match the installed stable tool versions, while preserving the required functionality.

## 19. Testing Strategy

### Unit tests

Cover:

- Password hashing and verification.
- JWT signing and verification.
- Refresh-token hashing.
- Cursor encoding, signing, decoding, and filter binding.
- Authorization policies.
- Task status transitions.
- Task version conflicts.
- Validation schemas.
- Idempotency behavior.
- Attachment allowlist and size rules.
- AI output validation.
- Notification recipient selection.

### Integration tests

Run against a real disposable PostgreSQL database.

Cover at least:

#### Authentication

- Successful registration.
- Duplicate active email rejected.
- Login succeeds with correct credentials.
- Login returns generic failure for bad credentials.
- Access token allows protected request.
- Expired token is rejected.
- Refresh rotation succeeds.
- Old refresh token reuse revokes the family.
- Logout revokes the current session.
- Logout-all revokes all sessions.

#### Teams and projects

- Team creator becomes owner.
- Last owner cannot be removed or demoted.
- Invitation acceptance requires matching email.
- Revoked and expired invitations are rejected.
- Project creator becomes project admin.
- Non-team member cannot join a project.
- Team owner without project membership cannot read tasks.
- Project viewer cannot mutate tasks.

#### Tasks

- Project member can create a task.
- Assignee must be an active project member.
- Assigned task appears in `assignee=me`.
- Filtering by status works.
- Full-text search finds title and description.
- Keyset pagination is stable with duplicate sort values.
- Task completion sets `completedAt`.
- Reopening clears `completedAt`.
- Stale version returns `409`.
- Soft-deleted task is hidden.
- Authorized admin can restore task.
- Unauthorized user cannot infer hidden task existence.

#### Comments

- Member can add comment.
- Viewer can read but not create.
- Author can edit own comment.
- Non-author cannot edit.
- Project admin can delete.
- Soft-deleted comments are hidden.

#### Attachments

- Authorized member can initialize upload.
- Oversized files are rejected.
- Unsupported types are rejected.
- Completion verifies object metadata.
- Download URL requires current task access.
- Deleted attachment cannot receive a download URL.
- Stale pending uploads are cleaned up.

#### Notifications

When enabled:

- Task assignment creates one notification.
- Reprocessing an outbox event does not duplicate notifications.
- SSE replays events after `Last-Event-ID`.
- Users cannot read another user's notifications.

#### AI

When enabled:

- Unauthorized project access is rejected before provider call.
- Provider result must pass Zod validation.
- Generated draft does not create a task.
- Provider timeout returns the expected problem code.
- Core task routes work when AI is disabled or unavailable.

### Test isolation

- Reset data between tests.
- Do not depend on test execution order.
- Freeze time where expiration logic is tested.
- Use deterministic factories.
- Stub object storage and AI only for unit tests; use MinIO for attachment integration tests where practical.

## 20. OpenAPI Requirements

Create an OpenAPI document covering:

- All routes.
- Security schemes.
- Request and response schemas.
- Query parameters.
- Pagination cursor.
- Problem Details errors.
- Examples.
- Role-based behavior descriptions.
- Attachment presigned-upload workflow.
- SSE event types.
- Optional feature-disabled responses.

Add a CI check that fails when the document is invalid.

Expose interactive documentation only in development or behind administrative protection.

## 21. README Requirements

The final README must contain:

1. Project overview.
2. Feature list.
3. Architecture summary.
4. Technology stack.
5. Prerequisites.
6. Local setup.
7. Environment configuration.
8. Docker Compose usage.
9. Database migration and seeding.
10. Running API and worker.
11. Running lint, types, tests, and build.
12. API documentation location.
13. Authentication usage example.
14. Attachment upload sequence.
15. Optional notification setup.
16. Optional AI setup.
17. Security decisions.
18. Directory structure.
19. Deployment notes.
20. Troubleshooting.
21. License placeholder.
22. GitHub repository submission instructions.

Include a small example workflow using `curl`:

- Register.
- Log in.
- Create team.
- Create project.
- Add project member.
- Create task.
- List assigned tasks.
- Complete task.
- Add comment.

Do not place real credentials or secrets in the README.

## 22. CI Pipeline

Create a GitHub Actions workflow that:

1. Checks out the repository.
2. Installs the supported Node.js version.
3. Runs `npm ci`.
4. Starts PostgreSQL and required test dependencies.
5. Applies migrations.
6. Runs formatting check.
7. Runs lint.
8. Runs type checking.
9. Runs unit tests.
10. Runs integration tests.
11. Runs OpenAPI validation.
12. Builds the project.
13. Optionally uploads coverage and test reports.

Use dependency caching based on `package-lock.json`.

## 23. Implementation

Build in the following order.

### Phase 1 — Repository foundation

- Initialize npm and TypeScript.
- Configure strict compiler settings.
- Configure ESLint and Prettier.
- Add Express application factory.
- Add environment validation.
- Add request ID, JSON parser, logger, 404, and error middleware.
- Add health routes.
- Add Docker Compose and PostgreSQL.
- Add Prisma configuration and initial migration.
- Add CI skeleton.

**Exit criteria:** API starts, readiness verifies PostgreSQL, lint/typecheck/tests/build pass.

### Phase 2 — Authentication and users

- Implement user repository and service.
- Implement Argon2id password hashing.
- Implement JWT access tokens.
- Implement refresh sessions, rotation, family revocation, logout, and logout-all.
- Implement registration, login, refresh, and profile endpoints.
- Add authentication middleware.
- Add unit and integration tests.

**Exit criteria:** all authentication acceptance tests pass.

### Phase 3 — Teams and invitations

- Implement team creation and membership.
- Implement team roles and policies.
- Implement invitations with hashed tokens.
- Implement invitation acceptance.
- Implement ownership transfer.
- Prevent removal of final owner.
- Add audit records and tests.

**Exit criteria:** team and invitation acceptance tests pass.

### Phase 4 — Projects and project membership

- Implement project CRUD.
- Implement explicit project membership.
- Enforce active team membership.
- Enforce separation between team administration and task-content access.
- Add tests.

**Exit criteria:** project access-isolation tests pass.

### Phase 5 — Tasks

- Implement task CRUD and soft deletion.
- Implement assignment rules.
- Implement status transitions.
- Implement optimistic concurrency.
- Implement full-text search migration.
- Implement filtering, sorting, and keyset pagination.
- Add tests.

**Exit criteria:** task workflow, search, pagination, and concurrency tests pass.

### Phase 6 — Comments

- Implement comment CRUD.
- Enforce inherited task access.
- Add audit records and tests.

**Exit criteria:** comment authorization tests pass.

### Phase 7 — Attachments

- Implement storage adapter.
- Implement MinIO/S3 adapter.
- Implement upload initialization, completion, listing, download URL, and deletion.
- Implement cleanup job.
- Add tests.

**Exit criteria:** attachment workflow passes with MinIO.

### Phase 8 — Hardening and documentation

- Implement idempotency.
- Implement rate limiting.
- Complete audit coverage.
- Add secure headers and CORS.
- Complete OpenAPI.
- Complete README.
- Complete Dockerfile.
- Complete CI.
- Add seed data.

**Exit criteria:** all mandatory repository checks pass.

### Phase 9 — Optional notifications

- Add outbox writes to relevant transactions.
- Implement worker claiming and retry.
- Implement notification persistence.
- Implement Redis pub/sub.
- Implement SSE stream and replay.
- Add tests and documentation.

**Exit criteria:** notification tests pass while the feature remains disableable.

### Phase 10 — Optional AI

- Implement provider interface.
- Implement disabled provider.
- Implement configured provider adapter.
- Implement draft and summary routes.
- Add quotas, timeout, metadata, validation, and tests.
- Document provider setup and privacy boundary.

**Exit criteria:** AI tests pass and ordinary task operations work without provider configuration.

## 24. Milestones

| Milestone | Scope | Completion signal |
|---|---|---|
| M1 | Foundation | Server, database, CI, health checks |
| M2 | Identity | Registration, login, refresh, logout, profile |
| M3 | Collaboration hierarchy | Teams, invitations, projects, membership |
| M4 | Task core | CRUD, assignment, status, search, filters, pagination |
| M5 | Collaboration content | Comments and attachments |
| M6 | Production hardening | Security, idempotency, audit, docs, Docker |
| M7 | Optional notifications | Outbox, worker, SSE, persistence |
| M8 | Optional AI | Drafts, summaries, provider adapter |

## 25. Acceptance Criteria

The MVP is accepted only when all of the following are true:

- A new user can register and log in.
- Passwords and refresh tokens are not stored in plaintext.
- Access tokens expire and refresh tokens rotate.
- Logout invalidates the relevant session.
- A user can create a team.
- A team owner/admin can invite another user.
- The invited user can join using a valid token.
- A team can contain multiple projects.
- A project uses explicit membership.
- A team owner without project membership cannot access project task content.
- A project member can create and assign a task to another project member.
- An assignee can list their tasks.
- Tasks can be filtered by status.
- Tasks can be searched by title or description.
- A permitted user can complete and reopen a task.
- Concurrent stale task updates produce `409`.
- A permitted user can add comments.
- A permitted user can upload and retrieve an attachment through presigned URLs.
- Unauthorized users cannot access another project's tasks, comments, or attachments.
- Soft-deleted resources are hidden and can be restored by authorized users.
- Validation and errors are consistent.
- Unit and integration tests pass.
- OpenAPI validation passes.
- Docker-based local setup is documented and functional.
- The README is sufficient for a reviewer to run and evaluate the repository.
- Optional services can be disabled without breaking the core API.

## Gathering Results

After implementation, record and verify:

### Functional results

- Percentage of acceptance criteria covered by automated tests.
- Authentication workflow success.
- Authorization-denial coverage.
- Search correctness.
- Task version-conflict behavior.
- Attachment completion and cleanup behavior.
- Notification replay behavior when enabled.
- AI no-write boundary when enabled.

### Performance results

Run a documented load test against a production-like environment.

Minimum scenarios:

1. Login and token refresh.
2. List assigned tasks with filters.
3. Create and update tasks.
4. Search project tasks.
5. Open SSE connections when notifications are enabled.

Initial targets:

```text
Read endpoint p95:            under 300 ms
Write endpoint p95:           under 500 ms
Search endpoint p95:          under 750 ms
5xx rate:                     below 0.5%
Authentication error leakage: none
Lost committed outbox events: zero
Duplicate visible notification rate: zero after client de-duplication
```

Document the dataset size, concurrency, hardware, database connection limits, test duration, and percentile results. Do not claim that the target scale is supported without a reproducible test report.

### Production-readiness review

Verify:

- Backups and restore procedure.
- Migration rollback or forward-fix plan.
- Secret rotation.
- Object-storage lifecycle rules.
- Log redaction.
- Alerts for elevated errors and outbox backlog.
- Database connection saturation.
- Graceful shutdown.
- Dependency vulnerability scan.
- Rate limits.
- CORS and cookie configuration.
- Data retention jobs.
- Incident-response owner.

## 26. Suggested Seed Data

Create a deterministic development seed:

- Three users: owner, member, viewer.
- One team.
- Two projects.
- Project memberships for all three roles.
- Tasks across all statuses.
- One assigned task per active user.
- Several comments.
- Attachment metadata only if a corresponding local MinIO object is created.

Use clearly non-production credentials and print them only when seeding a local development environment.

## 27. Expected Codex Final Report

After building the repository, Codex should output a concise completion report containing:

- Implemented phases.
- Commands executed.
- Test results.
- Build result.
- Migration names.
- Main architectural decisions.
- Optional features enabled or disabled.
- Any deviations from this specification and their rationale.
- Remaining risks, if any.
- Repository file tree summary.
- Git commands needed to create the final commit.

Codex must not claim completion when required tests or builds are failing.

---

## Need Professional Help in Developing Your Architecture?

Please contact me at [sammuti.com](https://sammuti.com) :)
