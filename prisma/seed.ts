import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

if (process.env['NODE_ENV'] === 'production') throw new Error('Seed is disabled in production');
const url =
  process.env['DATABASE_URL'] ?? 'postgresql://taskmaster:taskmaster@localhost:5433/taskmaster';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = 'development-password-only';
const passwordHash = await hash(password, { type: 2 });
await db.$transaction(async (tx) => {
  await tx.idempotencyKey.deleteMany();
  await tx.auditLog.deleteMany();
  await tx.notification.deleteMany();
  await tx.outboxEvent.deleteMany();
  await tx.taskAttachment.deleteMany();
  await tx.taskComment.deleteMany();
  await tx.task.deleteMany();
  await tx.projectMember.deleteMany();
  await tx.project.deleteMany();
  await tx.teamInvitation.deleteMany();
  await tx.teamMember.deleteMany();
  await tx.team.deleteMany();
  await tx.authSession.deleteMany();
  await tx.user.deleteMany();
  const users = await Promise.all(
    ['owner', 'member', 'viewer'].map((name) =>
      tx.user.create({
        data: { email: `${name}@taskmaster.local`, displayName: `Seed ${name}`, passwordHash },
      }),
    ),
  );
  const [owner, member, viewer] = users;
  if (owner === undefined || member === undefined || viewer === undefined)
    throw new Error('Seed user creation failed');
  const team = await tx.team.create({
    data: { name: 'TaskMaster Demo', slug: 'taskmaster-demo', createdBy: owner.id },
  });
  await tx.teamMember.createMany({
    data: [
      { teamId: team.id, userId: owner.id, role: 'OWNER' },
      { teamId: team.id, userId: member.id, role: 'MEMBER' },
      { teamId: team.id, userId: viewer.id, role: 'MEMBER' },
    ],
  });
  for (const projectName of ['Product Launch', 'Internal Operations']) {
    const project = await tx.project.create({
      data: { teamId: team.id, name: projectName, createdBy: owner.id },
    });
    await tx.projectMember.createMany({
      data: [
        { projectId: project.id, userId: owner.id, addedBy: owner.id, role: 'ADMIN' },
        { projectId: project.id, userId: member.id, addedBy: owner.id, role: 'MEMBER' },
        { projectId: project.id, userId: viewer.id, addedBy: owner.id, role: 'VIEWER' },
      ],
    });
    const tasks = await Promise.all(
      ['OPEN', 'IN_PROGRESS', 'COMPLETED'].map((status, index) =>
        tx.task.create({
          data: {
            projectId: project.id,
            title: `${projectName} task ${index + 1}`,
            description: 'Deterministic development seed task',
            status: status as 'OPEN' | 'IN_PROGRESS' | 'COMPLETED',
            createdBy: owner.id,
            assigneeId: index === 0 ? owner.id : member.id,
            completedAt: status === 'COMPLETED' ? new Date() : null,
          },
        }),
      ),
    );
    await tx.taskComment.createMany({
      data: tasks.map((task, index) => ({
        taskId: task.id,
        authorId: index === 0 ? owner.id : member.id,
        body: `Seed comment ${index + 1}`,
      })),
    });
  }
});
console.log(`Seed complete. Users: owner/member/viewer@taskmaster.local; password: ${password}`);
await db.$disconnect();
