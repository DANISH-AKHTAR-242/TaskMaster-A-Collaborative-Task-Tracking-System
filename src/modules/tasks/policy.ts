import type { ProjectRole } from '../../generated/prisma/enums.js';
export const canCreateTask = (role: ProjectRole) => role === 'ADMIN' || role === 'MEMBER';
export const canUpdateTask = (
  role: ProjectRole,
  userId: string,
  task: { createdBy: string; assigneeId: string | null },
) =>
  role === 'ADMIN' ||
  (role === 'MEMBER' && (task.createdBy === userId || task.assigneeId === userId));
export const canDeleteTask = (role: ProjectRole) => role === 'ADMIN';
