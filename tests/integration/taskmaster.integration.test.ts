import { PrismaPg } from '@prisma/adapter-pg';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import request from 'supertest';
import { createApp } from '../../src/app/create-app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const databaseUrl =
  process.env['TEST_DATABASE_URL'] ??
  process.env['DATABASE_URL'] ??
  'postgresql://taskmaster:taskmaster@localhost:5433/taskmaster';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
let env: Env;

async function clean(): Promise<void> {
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
  });
  await clean();
});
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

type Json = Record<string, unknown>;
const data = (response: request.Response): Json => (response.body as { data: Json }).data;
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
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
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
});
