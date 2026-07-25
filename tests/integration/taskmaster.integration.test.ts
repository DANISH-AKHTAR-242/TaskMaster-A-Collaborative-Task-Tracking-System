import { PrismaPg } from '@prisma/adapter-pg';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import request from 'supertest';
import { createApp } from '../../src/app/create-app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { S3ObjectStorage } from '../../src/infrastructure/storage/s3-storage.js';
import { AttachmentRepository } from '../../src/modules/attachments/repository.js';
import { AttachmentService } from '../../src/modules/attachments/service.js';
import { executeMutation } from '../../src/shared/mutations/executor.js';

const databaseUrl =
  process.env['TEST_DATABASE_URL'] ??
  process.env['DATABASE_URL'] ??
  'postgresql://taskmaster:taskmaster@localhost:5433/taskmaster';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
let env: Env;

async function clean(): Promise<void> {
  await db.idempotencyKey.deleteMany();
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.outboxEvent.deleteMany();
  await db.taskAttachment.deleteMany();
  await db.taskComment.deleteMany();
  await db.task.deleteMany();
  await db.projectMember.deleteMany();
  await db.project.deleteMany();
  await db.teamInvitation.deleteMany();
  await db.teamMember.deleteMany();
  await db.team.deleteMany();
  await db.authSession.deleteMany();
  await db.user.deleteMany();
}

beforeAll(async () => {
  const keys = await generateKeyPair('RS256', { extractable: true });
  env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: databaseUrl,
    CURSOR_SECRET: 'integration-cursor-secret-is-at-least-32-chars',
    JWT_PRIVATE_KEY_BASE64: Buffer.from(await exportPKCS8(keys.privateKey)).toString('base64'),
    JWT_PUBLIC_KEY_BASE64: Buffer.from(await exportSPKI(keys.publicKey)).toString('base64'),
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'taskmaster',
    S3_ACCESS_KEY: 'minio',
    S3_SECRET_KEY: 'minioadmin',
    S3_FORCE_PATH_STYLE: 'true',
    CLIENT_ORIGINS: 'http://localhost:5173',
    APP_BASE_URL: 'http://localhost:3000',
    LOG_LEVEL: 'silent',
  });
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

type Json = Record<string, unknown>;
const data = (response: request.Response): Json => (response.body as { data: Json }).data;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(
  app: ReturnType<typeof createApp>,
  email: string,
  displayName = email.split('@')[0] ?? 'User',
): Promise<Json> {
  return data(
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse-battery-staple', displayName })
      .expect(201),
  );
}

async function projectFixture(app: ReturnType<typeof createApp>, prefix: string) {
  const owner = await register(app, `${prefix}-owner@example.com`, `${prefix} Owner`);
  const token = owner['accessToken'] as string;
  const userId = (owner['user'] as Json)['id'] as string;
  const team = data(
    await request(app)
      .post('/api/v1/teams')
      .set(auth(token))
      .send({ name: `${prefix} Team`, slug: `${prefix}-team` })
      .expect(201),
  );
  const project = data(
    await request(app)
      .post(`/api/v1/teams/${team['id'] as string}/projects`)
      .set(auth(token))
      .send({ name: `${prefix} Project` })
      .expect(201),
  );
  return {
    token,
    userId,
    teamId: team['id'] as string,
    projectId: project['id'] as string,
  };
}
function firstCookie(response: request.Response): string {
  const cookies: unknown = response.headers['set-cookie'];
  const cookie: unknown = Array.isArray(cookies) ? cookies[0] : undefined;
  if (typeof cookie !== 'string') throw new Error('Expected a response cookie');
  return cookie;
}

describe('TaskMaster integration workflow', () => {
  it('rotates refresh tokens and revokes a reused family', async () => {
    const app = createApp({ env, database: db });
    const registered = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'session@example.com',
        password: 'correct-horse-battery-staple',
        displayName: 'Session User',
      })
      .expect(201);
    const oldCookie = firstCookie(registered);
    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', oldCookie)
      .expect(200);
    const newCookie = firstCookie(refreshed);
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', oldCookie)
      .expect(401);
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', newCookie)
      .expect(401);
    expect(await db.auditLog.count({ where: { action: 'AUTH_REFRESH_TOKEN_REUSED' } })).toBe(2);
  });

  it('handles duplicate registration, generic login failures, protection, logout, and logout-all', async () => {
    const app = createApp({ env, database: db });
    const credentials = {
      email: 'authentication@example.com',
      password: 'correct-horse-battery-staple',
      displayName: 'Authentication User',
    };
    await request(app).post('/api/v1/auth/register').send(credentials).expect(201);
    await request(app).post('/api/v1/auth/register').send(credentials).expect(409);
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.com', password: credentials.password })
      .expect(401);
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'this-password-is-wrong' })
      .expect(401);
    expect((unknown.body as Json)['code']).toBe('INVALID_CREDENTIALS');
    expect((wrongPassword.body as Json)['code']).toBe('INVALID_CREDENTIALS');
    await request(app).get('/api/v1/users/me').expect(401);

    const loggedIn = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const loggedInData = data(loggedIn);
    const token = loggedInData['accessToken'] as string;
    const cookie = firstCookie(loggedIn);
    await request(app).get('/api/v1/users/me').set(auth(token)).expect(200);
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .expect(204);
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .expect(401);

    const secondLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const secondToken = data(secondLogin)['accessToken'] as string;
    await request(app).post('/api/v1/auth/logout-all').set(auth(secondToken)).expect(204);
    await request(app).get('/api/v1/users/me').set(auth(secondToken)).expect(401);
    expect(await db.auditLog.count({ where: { action: 'AUTH_LOGIN' } })).toBe(2);
    expect(await db.auditLog.count({ where: { action: 'AUTH_LOGOUT' } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'AUTH_LOGOUT_ALL' } })).toBe(1);
  });

  it('enforces membership and supports task, comment, and attachment workflows', async () => {
    const app = createApp({ env, database: db });
    const register = async (email: string, name: string) =>
      data(
        await request(app)
          .post('/api/v1/auth/register')
          .send({ email, password: 'correct-horse-battery-staple', displayName: name })
          .expect(201),
      );
    const owner = await register('owner@example.com', 'Owner'),
      member = await register('member@example.com', 'Member'),
      outsider = await register('outsider@example.com', 'Outsider');
    const ownerToken = owner['accessToken'] as string,
      memberToken = member['accessToken'] as string,
      outsiderToken = outsider['accessToken'] as string;
    const ownerId = (owner['user'] as Json)['id'] as string,
      memberId = (member['user'] as Json)['id'] as string;
    const team = data(
      await request(app)
        .post('/api/v1/teams')
        .set(auth(ownerToken))
        .send({ name: 'Integration Team', slug: 'integration-team' })
        .expect(201),
    );
    const invite = data(
      await request(app)
        .post(`/api/v1/teams/${team['id'] as string}/invitations`)
        .set(auth(ownerToken))
        .send({ email: 'member@example.com', role: 'MEMBER' })
        .expect(201),
    );
    await request(app)
      .post('/api/v1/team-invitations/accept')
      .set(auth(memberToken))
      .send({ token: invite['token'] })
      .expect(200);
    const project = data(
      await request(app)
        .post(`/api/v1/teams/${team['id'] as string}/projects`)
        .set(auth(ownerToken))
        .send({ name: 'Integration Project' })
        .expect(201),
    );
    await request(app)
      .post(`/api/v1/projects/${project['id'] as string}/members`)
      .set(auth(ownerToken))
      .send({ userId: memberId, role: 'MEMBER' })
      .expect(201);
    const task = data(
      await request(app)
        .post(`/api/v1/projects/${project['id'] as string}/tasks`)
        .set(auth(ownerToken))
        .send({
          title: 'Release integration',
          description: 'Verify the complete workflow',
          assigneeId: memberId,
        })
        .expect(201),
    );
    await request(app)
      .get(`/api/v1/tasks/${task['id'] as string}`)
      .set(auth(outsiderToken))
      .expect(404);
    const completed = data(
      await request(app)
        .patch(`/api/v1/tasks/${task['id'] as string}`)
        .set(auth(memberToken))
        .send({ status: 'COMPLETED', version: 1 })
        .expect(200),
    );
    expect(completed['completedAt']).toBeTruthy();
    await request(app)
      .patch(`/api/v1/tasks/${task['id'] as string}`)
      .set(auth(memberToken))
      .send({ status: 'OPEN', version: 1 })
      .expect(409);
    await request(app)
      .post(`/api/v1/tasks/${task['id'] as string}/comments`)
      .set(auth(memberToken))
      .send({ body: 'Integration complete' })
      .expect(201);
    const initialized = data(
      await request(app)
        .post(`/api/v1/tasks/${task['id'] as string}/attachments/uploads`)
        .set(auth(memberToken))
        .send({ filename: 'evidence.txt', contentType: 'text/plain', sizeBytes: 5 })
        .expect(201),
    );
    await fetch(initialized['uploadUrl'] as string, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    const attachment = initialized['attachment'] as Json;
    await request(app)
      .post(`/api/v1/attachments/${attachment['id'] as string}/complete`)
      .set(auth(memberToken))
      .expect(200);
    expect(ownerId).not.toBe(memberId);
  });

  it('replays concurrent create requests once and rejects changed idempotent input', async () => {
    const app = createApp({ env, database: db });
    const registration = {
      email: 'idempotent@example.com',
      password: 'correct-horse-battery-staple',
      displayName: 'Idempotent User',
    };
    const [first, concurrentReplay] = await Promise.all([
      request(app)
        .post('/api/v1/auth/register')
        .set('Idempotency-Key', 'registration-1')
        .send(registration),
      request(app)
        .post('/api/v1/auth/register')
        .set('Idempotency-Key', 'registration-1')
        .send(registration),
    ]);
    expect([first.status, concurrentReplay.status]).toEqual([201, 201]);
    expect(data(first)['user']).toEqual(data(concurrentReplay)['user']);
    expect(
      [
        first.headers['idempotency-replayed'],
        concurrentReplay.headers['idempotency-replayed'],
      ].sort(),
    ).toEqual(['false', 'true']);
    expect(await db.user.count({ where: { email: registration.email } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'USER_REGISTERED' } })).toBe(1);

    await request(app)
      .post('/api/v1/auth/register')
      .set('Idempotency-Key', 'registration-1')
      .send({ ...registration, displayName: 'Changed Name' })
      .expect(409);

    const token = data(first)['accessToken'] as string;
    const createTeam = () =>
      request(app)
        .post('/api/v1/teams')
        .set(auth(token))
        .set('Idempotency-Key', 'team-1')
        .send({ name: 'Once Team', slug: 'once-team' });
    const [teamFirst, teamReplay] = await Promise.all([createTeam(), createTeam()]);
    expect([teamFirst.status, teamReplay.status]).toEqual([201, 201]);
    expect(data(teamFirst)['id']).toBe(data(teamReplay)['id']);
    expect(await db.team.count({ where: { slug: 'once-team' } })).toBe(1);

    const teamId = data(teamFirst)['id'] as string;
    const replayCreate = async (
      url: string,
      key: string,
      body: Json,
      selectId: (responseData: Json) => string,
    ): Promise<string> => {
      const original = await request(app)
        .post(url)
        .set(auth(token))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
      const replay = await request(app)
        .post(url)
        .set(auth(token))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect(selectId(data(replay))).toBe(selectId(data(original)));
      return selectId(data(original));
    };
    const projectId = await replayCreate(
      `/api/v1/teams/${teamId}/projects`,
      'project-1',
      { name: 'Once Project' },
      (value) => value['id'] as string,
    );
    const taskId = await replayCreate(
      `/api/v1/projects/${projectId}/tasks`,
      'task-1',
      { title: 'Once Task' },
      (value) => value['id'] as string,
    );
    const secondProjectId = await replayCreate(
      `/api/v1/teams/${teamId}/projects`,
      'project-2',
      { name: 'Second Project' },
      (value) => value['id'] as string,
    );
    const sameKeyDifferentProject = data(
      await request(app)
        .post(`/api/v1/projects/${secondProjectId}/tasks`)
        .set(auth(token))
        .set('Idempotency-Key', 'task-1')
        .send({ title: 'Once Task' })
        .expect(201),
    );
    expect(sameKeyDifferentProject['id']).not.toBe(taskId);
    await replayCreate(
      `/api/v1/teams/${teamId}/invitations`,
      'invitation-1',
      { email: 'invited-once@example.com', role: 'MEMBER' },
      (value) => (value['invitation'] as Json)['id'] as string,
    );
    await replayCreate(
      `/api/v1/tasks/${taskId}/attachments/uploads`,
      'attachment-1',
      { filename: 'once.txt', contentType: 'text/plain', sizeBytes: 4 },
      (value) => (value['attachment'] as Json)['id'] as string,
    );
  });

  it('uses PostgreSQL full-text search and lossless keyset pagination for every sort', async () => {
    const app = createApp({ env, database: db });
    const fixture = await projectFixture(app, 'search');
    const taskInputs = [
      { title: 'Alpha', description: 'ordinary work', dueAt: '2026-08-01T10:00:00.000Z' },
      { title: 'Bravo launch', description: 'production rollout', dueAt: null },
      { title: 'Charlie', description: 'launch checklist', dueAt: '2026-07-29T10:00:00.000Z' },
      { title: 'Delta', description: 'documentation', dueAt: null },
      { title: 'Echo', description: 'monitoring', dueAt: '2026-08-03T10:00:00.000Z' },
      { title: 'Foxtrot', description: 'security', dueAt: '2026-08-02T10:00:00.000Z' },
      { title: 'Golf', description: 'cleanup', dueAt: null },
      { title: 'Hotel', description: 'launch checklist', dueAt: null },
    ];
    for (const input of taskInputs) {
      await request(app)
        .post(`/api/v1/projects/${fixture.projectId}/tasks`)
        .set(auth(fixture.token))
        .send(input)
        .expect(201);
    }

    const searchResponse = await request(app)
      .get(`/api/v1/projects/${fixture.projectId}/tasks`)
      .set(auth(fixture.token))
      .query({ search: 'launch', limit: 1 })
      .expect(200);
    const searchIds = new Set<string>();
    let searchPage = searchResponse.body as { data: Json[]; page: { nextCursor: string | null } };
    let hasSearchPage = true;
    while (hasSearchPage) {
      for (const task of searchPage.data) searchIds.add(task['id'] as string);
      if (searchPage.page.nextCursor === null) {
        hasSearchPage = false;
        continue;
      }
      const next = await request(app)
        .get(`/api/v1/projects/${fixture.projectId}/tasks`)
        .set(auth(fixture.token))
        .query({ search: 'launch', limit: 1, cursor: searchPage.page.nextCursor })
        .expect(200);
      searchPage = next.body as typeof searchPage;
    }
    expect(searchIds.size).toBe(3);

    for (const sort of ['createdAt', 'updatedAt', 'dueAt', 'title', 'status'] as const) {
      for (const order of ['asc', 'desc'] as const) {
        const ids: string[] = [];
        let cursor: string | null = null;
        do {
          const response = await request(app)
            .get(`/api/v1/projects/${fixture.projectId}/tasks`)
            .set(auth(fixture.token))
            .query({ sort, order, limit: 2, ...(cursor === null ? {} : { cursor }) })
            .expect(200);
          const body = response.body as { data: Json[]; page: { nextCursor: string | null } };
          ids.push(...body.data.map((task) => task['id'] as string));
          cursor = body.page.nextCursor;
        } while (cursor !== null);
        expect(new Set(ids).size, `${sort}/${order} returned a duplicate`).toBe(taskInputs.length);
        expect(ids).toHaveLength(taskInputs.length);
      }
    }
  });

  it('couples audit and idempotency records to the mutation transaction', async () => {
    const user = await db.user.create({
      data: {
        email: 'rollback@example.com',
        displayName: 'Rollback',
        passwordHash: 'not-used-in-this-test',
      },
    });
    await expect(
      executeMutation(
        db,
        {
          actorUserId: user.id,
          requestId: '00000000-0000-4000-8000-000000000001',
          method: 'POST',
          route: '/test/rollback',
          idempotencyKey: 'rollback-key',
          requestBody: { slug: 'rolled-back' },
        },
        async (transaction) => {
          await transaction.team.create({
            data: { name: 'Rolled Back', slug: 'rolled-back', createdBy: user.id },
          });
          throw new Error('force rollback');
        },
      ),
    ).rejects.toThrow('force rollback');
    expect(await db.team.count({ where: { slug: 'rolled-back' } })).toBe(0);
    expect(
      await db.auditLog.count({
        where: { requestId: '00000000-0000-4000-8000-000000000001' },
      }),
    ).toBe(0);
    expect(await db.idempotencyKey.count({ where: { key: 'rollback-key' } })).toBe(0);

    const nullBodyContext = {
      actorUserId: user.id,
      requestId: '00000000-0000-4000-8000-000000000002',
      method: 'POST',
      route: '/test/null-body',
      idempotencyKey: 'null-body-key',
      requestBody: null,
    } as const;
    const nullBodyOperation = () =>
      Promise.resolve({
        status: 204,
        body: null,
        audit: { action: 'NULL_BODY_TEST', entityType: 'USER', entityId: user.id },
      });
    expect(await executeMutation(db, nullBodyContext, nullBodyOperation)).toMatchObject({
      status: 204,
      body: null,
      replayed: false,
    });
    expect(await executeMutation(db, nullBodyContext, nullBodyOperation)).toMatchObject({
      status: 204,
      body: null,
      replayed: true,
    });
    expect(await db.auditLog.count({ where: { action: 'NULL_BODY_TEST' } })).toBe(1);
  });

  it('enforces invitation state, last-owner safety, and project membership boundaries', async () => {
    const app = createApp({ env, database: db });
    const fixture = await projectFixture(app, 'invitations');
    const invited = await register(app, 'invitations-member@example.com', 'Invited');
    const mismatch = await register(app, 'invitations-mismatch@example.com', 'Mismatch');
    const invitedId = (invited['user'] as Json)['id'] as string;
    const invitedToken = invited['accessToken'] as string;
    const mismatchToken = mismatch['accessToken'] as string;
    const createInvite = async () =>
      data(
        await request(app)
          .post(`/api/v1/teams/${fixture.teamId}/invitations`)
          .set(auth(fixture.token))
          .send({ email: 'invitations-member@example.com', role: 'MEMBER' })
          .expect(201),
      );

    const revoked = await createInvite();
    await request(app)
      .post('/api/v1/team-invitations/accept')
      .set(auth(mismatchToken))
      .send({ token: revoked['token'] })
      .expect(404);
    const revokedInvitationId = (revoked['invitation'] as Json)['id'] as string;
    await request(app)
      .delete(`/api/v1/teams/${fixture.teamId}/invitations/${revokedInvitationId}`)
      .set(auth(fixture.token))
      .expect(204);
    await request(app)
      .post('/api/v1/team-invitations/accept')
      .set(auth(invitedToken))
      .send({ token: revoked['token'] })
      .expect(409);

    const expired = await createInvite();
    await db.teamInvitation.update({
      where: { id: (expired['invitation'] as Json)['id'] as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app)
      .post('/api/v1/team-invitations/accept')
      .set(auth(invitedToken))
      .send({ token: expired['token'] })
      .expect(409);
    await request(app)
      .delete(
        `/api/v1/teams/${fixture.teamId}/invitations/${(expired['invitation'] as Json)['id'] as string}`,
      )
      .set(auth(fixture.token))
      .expect(204);

    const active = await createInvite();
    await request(app)
      .post('/api/v1/team-invitations/accept')
      .set(auth(invitedToken))
      .send({ token: active['token'] })
      .expect(200);
    await request(app)
      .patch(`/api/v1/teams/${fixture.teamId}/members/${fixture.userId}`)
      .set(auth(fixture.token))
      .send({ role: 'ADMIN' })
      .expect(409);
    await request(app)
      .patch(`/api/v1/teams/${fixture.teamId}/members/${invitedId}`)
      .set(auth(fixture.token))
      .send({ role: 'OWNER' })
      .expect(200);

    await request(app)
      .get(`/api/v1/projects/${fixture.projectId}`)
      .set(auth(invitedToken))
      .expect(404);
    await request(app)
      .get(`/api/v1/projects/${fixture.projectId}/tasks`)
      .set(auth(invitedToken))
      .expect(404);
  });

  it('enforces project-content roles, assignee rules, comments, task lifecycle, and audit writes', async () => {
    const app = createApp({ env, database: db });
    const fixture = await projectFixture(app, 'policy');
    const viewer = await register(app, 'policy-viewer@example.com', 'Viewer');
    const outsider = await register(app, 'policy-outsider@example.com', 'Outsider');
    const viewerId = (viewer['user'] as Json)['id'] as string;
    const viewerToken = viewer['accessToken'] as string;
    const outsiderId = (outsider['user'] as Json)['id'] as string;
    const outsiderToken = outsider['accessToken'] as string;

    const invite = data(
      await request(app)
        .post(`/api/v1/teams/${fixture.teamId}/invitations`)
        .set(auth(fixture.token))
        .send({ email: 'policy-viewer@example.com', role: 'MEMBER' })
        .expect(201),
    );
    await request(app)
      .post('/api/v1/team-invitations/accept')
      .set(auth(viewerToken))
      .send({ token: invite['token'] })
      .expect(200);
    await request(app)
      .post(`/api/v1/projects/${fixture.projectId}/members`)
      .set(auth(fixture.token))
      .send({ userId: viewerId, role: 'VIEWER' })
      .expect(201);
    await request(app)
      .post(`/api/v1/projects/${fixture.projectId}/members`)
      .set(auth(fixture.token))
      .send({ userId: outsiderId, role: 'MEMBER' })
      .expect(409);

    const task = data(
      await request(app)
        .post(`/api/v1/projects/${fixture.projectId}/tasks`)
        .set(auth(fixture.token))
        .send({ title: 'Policy task' })
        .expect(201),
    );
    const assigned = data(
      await request(app)
        .post(`/api/v1/projects/${fixture.projectId}/tasks`)
        .set(auth(fixture.token))
        .send({
          title: 'Viewer assignment',
          assigneeId: viewerId,
          dueAt: '2026-08-10T10:00:00.000Z',
        })
        .expect(201),
    );
    const assignedList = await request(app)
      .get('/api/v1/tasks')
      .set(auth(viewerToken))
      .query({ assignee: 'me', status: 'OPEN', dueBefore: '2026-08-11T10:00:00.000Z' })
      .expect(200);
    expect((assignedList.body as { data: Json[] }).data.map((item) => item['id'])).toContain(
      assigned['id'],
    );
    await request(app)
      .post(`/api/v1/projects/${fixture.projectId}/tasks`)
      .set(auth(fixture.token))
      .send({ title: 'Invalid assignment', assigneeId: outsiderId })
      .expect(409);
    await request(app)
      .get(`/api/v1/tasks/${task['id'] as string}`)
      .set(auth(outsiderToken))
      .expect(404);
    await request(app)
      .patch(`/api/v1/tasks/${task['id'] as string}`)
      .set(auth(viewerToken))
      .send({ title: 'Forbidden', version: 1 })
      .expect(403);
    await request(app)
      .post(`/api/v1/tasks/${task['id'] as string}/comments`)
      .set(auth(viewerToken))
      .send({ body: 'Forbidden comment' })
      .expect(403);

    const comment = data(
      await request(app)
        .post(`/api/v1/tasks/${task['id'] as string}/comments`)
        .set(auth(fixture.token))
        .send({ body: 'Original comment' })
        .expect(201),
    );
    await request(app)
      .get(`/api/v1/tasks/${task['id'] as string}/comments`)
      .set(auth(viewerToken))
      .expect(200);
    await request(app)
      .patch(`/api/v1/comments/${comment['id'] as string}`)
      .set(auth(viewerToken))
      .send({ body: 'Not mine' })
      .expect(403);

    const completed = data(
      await request(app)
        .patch(`/api/v1/tasks/${task['id'] as string}`)
        .set(auth(fixture.token))
        .send({ status: 'COMPLETED', version: 1 })
        .expect(200),
    );
    const reopened = data(
      await request(app)
        .patch(`/api/v1/tasks/${task['id'] as string}`)
        .set(auth(fixture.token))
        .send({ status: 'OPEN', version: completed['version'] })
        .expect(200),
    );
    expect(reopened['completedAt']).toBeNull();
    await request(app)
      .delete(`/api/v1/tasks/${task['id'] as string}`)
      .set(auth(fixture.token))
      .expect(204);
    await request(app)
      .get(`/api/v1/tasks/${task['id'] as string}`)
      .set(auth(fixture.token))
      .expect(404);
    await request(app)
      .post(`/api/v1/tasks/${task['id'] as string}/restore`)
      .set(auth(fixture.token))
      .expect(200);
    expect(await db.auditLog.count({ where: { entityId: task['id'] as string } })).toBeGreaterThan(
      3,
    );
  });

  it('rejects invalid attachments and removes stale pending objects through cleanup', async () => {
    const app = createApp({ env, database: db });
    const fixture = await projectFixture(app, 'cleanup');
    const task = data(
      await request(app)
        .post(`/api/v1/projects/${fixture.projectId}/tasks`)
        .set(auth(fixture.token))
        .send({ title: 'Cleanup task' })
        .expect(201),
    );
    const taskId = task['id'] as string;
    await request(app)
      .post(`/api/v1/tasks/${taskId}/attachments/uploads`)
      .set(auth(fixture.token))
      .send({ filename: 'malware.exe', contentType: 'application/x-msdownload', sizeBytes: 1 })
      .expect(415);
    await request(app)
      .post(`/api/v1/tasks/${taskId}/attachments/uploads`)
      .set(auth(fixture.token))
      .send({
        filename: 'large.txt',
        contentType: 'text/plain',
        sizeBytes: env.ATTACHMENT_MAX_BYTES + 1,
      })
      .expect(413);

    const initialized = data(
      await request(app)
        .post(`/api/v1/tasks/${taskId}/attachments/uploads`)
        .set(auth(fixture.token))
        .send({ filename: 'stale.txt', contentType: 'text/plain', sizeBytes: 5 })
        .expect(201),
    );
    const attachment = initialized['attachment'] as Json;
    await fetch(initialized['uploadUrl'] as string, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    await request(app)
      .post(`/api/v1/attachments/${attachment['id'] as string}/complete`)
      .set(auth(fixture.token))
      .expect(200);
    await request(app)
      .post(`/api/v1/attachments/${attachment['id'] as string}/download-url`)
      .set(auth(fixture.token))
      .expect(200);
    const outsider = await register(app, 'cleanup-outsider@example.com', 'Cleanup Outsider');
    await request(app)
      .post(`/api/v1/attachments/${attachment['id'] as string}/download-url`)
      .set(auth(outsider['accessToken'] as string))
      .expect(404);
    await request(app)
      .delete(`/api/v1/attachments/${attachment['id'] as string}`)
      .set(auth(fixture.token))
      .expect(204);
    await request(app)
      .post(`/api/v1/attachments/${attachment['id'] as string}/download-url`)
      .set(auth(fixture.token))
      .expect(404);

    const mismatched = data(
      await request(app)
        .post(`/api/v1/tasks/${taskId}/attachments/uploads`)
        .set(auth(fixture.token))
        .send({ filename: 'mismatch.txt', contentType: 'text/plain', sizeBytes: 5 })
        .expect(201),
    );
    await fetch(mismatched['uploadUrl'] as string, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'four',
    });
    await request(app)
      .post(`/api/v1/attachments/${(mismatched['attachment'] as Json)['id'] as string}/complete`)
      .set(auth(fixture.token))
      .expect(409);

    const pending = data(
      await request(app)
        .post(`/api/v1/tasks/${taskId}/attachments/uploads`)
        .set(auth(fixture.token))
        .send({ filename: 'pending.txt', contentType: 'text/plain', sizeBytes: 4 })
        .expect(201),
    );
    const pendingAttachment = pending['attachment'] as Json;
    await fetch(pending['uploadUrl'] as string, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'data',
    });
    const pendingId = pendingAttachment['id'] as string;
    const record = await db.taskAttachment.update({
      where: { id: pendingId },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const storage = new S3ObjectStorage(env);
    const cleanup = new AttachmentService(new AttachmentRepository(db), storage, env);
    expect(await cleanup.cleanup()).toBe(1);
    expect((await db.taskAttachment.findUnique({ where: { id: pendingId } }))?.status).toBe(
      'DELETED',
    );
    expect(await storage.head(record.storageKey)).toBeNull();
  });
});
