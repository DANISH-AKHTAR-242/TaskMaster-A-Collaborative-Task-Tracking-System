import { canAdministerProject, canMutateProjectContent } from './policy.js';
describe('project policy', () => {
  it('keeps viewers read-only', () => {
    expect(canMutateProjectContent('VIEWER')).toBe(false);
    expect(canAdministerProject('ADMIN')).toBe(true);
  });
});
