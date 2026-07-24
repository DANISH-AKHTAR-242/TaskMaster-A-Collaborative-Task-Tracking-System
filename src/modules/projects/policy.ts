import type { ProjectRole } from '../../generated/prisma/enums.js';
export const canReadProject = (role: ProjectRole): boolean =>
  ['ADMIN', 'MEMBER', 'VIEWER'].includes(role);
export const canMutateProjectContent = (role: ProjectRole): boolean =>
  role === 'ADMIN' || role === 'MEMBER';
export const canAdministerProject = (role: ProjectRole): boolean => role === 'ADMIN';
