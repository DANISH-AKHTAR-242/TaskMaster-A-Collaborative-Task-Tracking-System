import { canCreateTask, canUpdateTask } from './policy.js';
describe('task policy', () => {
  it('keeps viewers read-only and lets assignees update', () => {
    expect(canCreateTask('VIEWER')).toBe(false);
    expect(canUpdateTask('MEMBER', 'u', { createdBy: 'x', assigneeId: 'u' })).toBe(true);
  });
});
