import { canAdministerTeam, canAssignTeamRole, canDeleteTeam } from './policy.js';

describe('team policy', () => {
  it('reserves owner operations for owners', () => {
    expect(canDeleteTeam('OWNER')).toBe(true);
    expect(canDeleteTeam('ADMIN')).toBe(false);
    expect(canAssignTeamRole('ADMIN', 'OWNER')).toBe(false);
    expect(canAdministerTeam('ADMIN')).toBe(true);
  });
});
