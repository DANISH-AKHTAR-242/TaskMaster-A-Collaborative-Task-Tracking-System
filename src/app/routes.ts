import { Router } from 'express';
import type { Env } from '../config/env.js';
import type { DatabaseClient } from '../infrastructure/database/prisma.js';
import { createAuthModule } from '../modules/auth/routes.js';
import { healthRoutes } from '../modules/health/routes.js';
import { userRoutes } from '../modules/users/routes.js';
import { teamRoutes } from '../modules/teams/routes.js';
import { projectRoutes } from '../modules/projects/routes.js';
import { taskRoutes } from '../modules/tasks/routes.js';
import { commentRoutes } from '../modules/comments/routes.js';
import { attachmentRoutes } from '../modules/attachments/routes.js';

export function createRoutes(database: DatabaseClient, env: Env): Router {
  const router = Router();
  const auth = createAuthModule(database, env);
  router.use(
    '/health',
    healthRoutes(async () => database.$queryRaw`SELECT 1`),
  );
  router.use('/auth', auth.router);
  router.use('/users', userRoutes(database, auth.authenticate));
  const teams = teamRoutes(database, env, auth.authenticate);
  router.use('/teams', teams.teams);
  router.use('/team-invitations', teams.accept);
  const projects = projectRoutes(database, auth.authenticate);
  router.use('/teams', projects.teams);
  router.use('/projects', projects.projects);
  const tasks = taskRoutes(database, env, auth.authenticate);
  router.use('/projects', tasks.projects);
  router.use('/tasks', tasks.tasks);
  const comments = commentRoutes(database, auth.authenticate);
  router.use('/tasks', comments.tasks);
  router.use('/comments', comments.comments);
  const attachments = attachmentRoutes(database, env, auth.authenticate);
  router.use('/tasks', attachments.tasks);
  router.use('/attachments', attachments.attachments);
  return router;
}
