# TaskMaster backend

TaskMaster is a production-oriented Express 5 REST API for collaborative team, project, and task tracking. It is a strict-TypeScript modular monolith backed by PostgreSQL and Prisma. Project membership is explicit: being a team owner or administrator does not grant task-content access.

## Features and architecture

- Rotating opaque refresh sessions, Argon2id passwords, asymmetric 15-minute JWT access tokens, profile management, and session revocation.
- Teams, hashed seven-day invitations, ownership transfer, and final-owner protection.
- Projects with independent `ADMIN`, `MEMBER`, and read-only `VIEWER` roles.
- Versioned soft-deletable tasks, assignments, status transitions, signed keyset cursors for every supported sort, filters, and ranked PostgreSQL `TSVECTOR` search.
- Comments and direct-to-S3 attachments with metadata verification and server-controlled keys.
- RFC Problem Details, Zod input validation, Pino JSON logs, request IDs, Helmet, CORS, rate limits, transaction-coupled audit records, database-backed create idempotency, health probes, Docker, CI, OpenAPI, and deterministic seed data.
- Notification and AI database foundations are present; runtime features are disabled by default.

Routes/controllers translate HTTP, services implement business rules, policies decide authorization, repositories contain Prisma access, and `infrastructure` contains database/storage adapters. Public DTOs omit hashes, internal storage keys, and Prisma-only fields.

## Stack and prerequisites

Node.js 24 LTS, npm, Docker Desktop/Engine with Compose, PostgreSQL 18, MinIO, and Redis. The production image uses Node 24 Bookworm slim and a non-root user.

## Local setup

```bash
cp .env.example .env
# Generate an RSA key pair, base64-encode the PEM files, and fill JWT_*_KEY_BASE64.
# Set CURSOR_SECRET to at least 32 random characters.
docker compose up -d
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

PowerShell key generation example (requires OpenSSL):

```powershell
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
[Convert]::ToBase64String([IO.File]::ReadAllBytes('private.pem'))
[Convert]::ToBase64String([IO.File]::ReadAllBytes('public.pem'))
```

The API is at `http://localhost:3000/api/v1`; the Compose PostgreSQL port is 5433 and MinIO is at ports 9000/9001. Override the database mapping with `POSTGRES_PORT` if needed. Run the optional Mailpit profile with `docker compose --profile mail up -d`. Do not reuse example local credentials in production.

## Configuration

Copy `.env.example`; every variable is documented by its name and validated at startup. Required secrets are the JWT PEM values, cursor secret, database credentials, and production object-storage credentials. `CLIENT_ORIGINS` is a comma-separated allowlist. Keep `.env` out of Git and use a deployment secret manager. `NOTIFICATIONS_ENABLED`, `SSE_ENABLED`, and `AI_ENABLED` default to `false`.

## Database operations

`npm run db:migrate` applies committed migrations; `npm run db:migrate:dev` creates a reviewed development migration. Production uses `prisma migrate deploy`, never `db push`. `npm run db:seed` replaces local development data with three users, one team, two projects, role memberships, tasks, and comments. Back up PostgreSQL before production migrations; favor forward-fix migrations and test restore procedures regularly.

## Running and validation

```bash
npm run dev             # API with watch mode
npm run dev:worker      # worker; runs stale attachment cleanup immediately and hourly
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run openapi:check
npm run build
npm start
```

The OpenAPI 3.1 contract is [openapi.yaml](./openapi.yaml). Production interactive documentation should be separately access-controlled; this service does not expose it publicly.

Create endpoints for registration, teams, invitations, projects, tasks, and attachment-upload initialization accept an optional `Idempotency-Key` header (1–200 characters). Records are retained for 24 hours. Replaying the same method, route, actor, key, and normalized body returns the stored status/body with `Idempotency-Replayed: true`; changing the body returns `409 IDEMPOTENCY_KEY_REUSED`. Concurrent duplicates are serialized in PostgreSQL.

## Example API workflow

```bash
BASE=http://localhost:3000/api/v1
curl -c cookies.txt -H 'Content-Type: application/json' -d '{"email":"alex@example.com","password":"correct-horse-battery-staple","displayName":"Alex"}' "$BASE/auth/register"
TOKEN='<access token from response>'
curl -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: create-example-team' -H 'Content-Type: application/json' -d '{"name":"Example Team","slug":"example-team"}' "$BASE/teams"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Launch"}' "$BASE/teams/<teamId>/projects"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"userId":"<userId>","role":"MEMBER"}' "$BASE/projects/<projectId>/members"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"Prepare release notes","assigneeId":"<userId>"}' "$BASE/projects/<projectId>/tasks"
curl -H "Authorization: Bearer $TOKEN" "$BASE/tasks?assignee=me&status=OPEN"
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"status":"COMPLETED","version":1}' "$BASE/tasks/<taskId>"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"body":"Ready for review."}' "$BASE/tasks/<taskId>/comments"
```

## Attachment sequence

Initialize at `POST /tasks/{taskId}/attachments/uploads`, PUT the bytes to the returned ten-minute URL using the declared `Content-Type`, call `POST /attachments/{id}/complete`, then request a five-minute URL from `/download-url`. The API performs a HEAD check for size/type before READY. Binaries never enter PostgreSQL. The worker removes stale `PENDING` records and their objects on startup and every hour; run one worker process in local and deployed environments. Configure a 24-hour bucket lifecycle safety rule in production as a second safety net.

## Optional notifications and AI

Notifications require Redis and `NOTIFICATIONS_ENABLED=true`; PostgreSQL outbox/notification tables remain the source of truth. SSE additionally requires `SSE_ENABLED=true`. The optional runtime pipeline is deliberately deferred; leaving both flags false has no effect on task operations.

AI is disabled with `AI_ENABLED=false` and `AI_PROVIDER=disabled`. A production adapter requires a pinned `AI_MODEL`, provider key from a secret manager, quotas, and privacy review. AI drafts must always be validated and submitted through normal task routes; AI is never authorized to write tasks and attachment contents must not be sent.

## Security and deployment notes

Terminate TLS before the API; use least-privilege database/object-store identities, rotate RSA keys and credentials, constrain database pools per replica, retain audit logs append-only, enable dependency scanning, and alert on errors, saturation, authentication failures, and cleanup backlog. Refresh cookies are HttpOnly, Secure in production, SameSite=Lax, and origin-checked. Logs redact authorization, cookies, passwords, invitation/refresh tokens, provider keys, and prompts. Configure backups, tested restore, incident ownership, retention jobs, and object lifecycle rules before launch.

Build with `docker build -t taskmaster-api .`; inject configuration at runtime. Orchestrators should probe `/api/v1/health/live` and `/api/v1/health/ready` and allow graceful shutdown.

## Directory structure

`src/app` HTTP composition; `src/modules` domains; `src/shared` errors/security/pagination; `src/infrastructure` PostgreSQL, logging, and S3; `prisma` schema/migrations/seed; `tests` integration suites; `.github/workflows` CI.

## Troubleshooting

- Readiness failure: verify `DATABASE_URL`, `docker compose ps`, and migration state.
- Prisma import errors: run `npm run db:generate`.
- Refresh returns 403: send an allowed `Origin` and the refresh cookie.
- Attachment completion conflict: upload the exact declared byte length and MIME type to MinIO.
- Docker pipe missing on Windows: start Docker Desktop and wait for the Linux engine.
- Native Argon2 install failure: use Node 24 or the provided Debian-based image.

## Submission and license

Review `git status`, ensure `.env` and PEM keys are absent, run the complete validation suite, then commit the source and `package-lock.json`. License: choose and add an approved project license before public distribution.
