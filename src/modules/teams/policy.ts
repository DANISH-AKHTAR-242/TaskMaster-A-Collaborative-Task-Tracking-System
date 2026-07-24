import type { TeamRole } from '../../generated/prisma/enums.js';

export const canAdministerTeam = (role: TeamRole): boolean => role === 'OWNER' || role === 'ADMIN';
export const canDeleteTeam = (role: TeamRole): boolean => role === 'OWNER';
export const canAssignTeamRole = (actor: TeamRole, target: TeamRole): boolean =>
  actor === 'OWNER' || (actor === 'ADMIN' && target !== 'OWNER');
