import { generatedTaskSchema, DisabledTaskGenerationProvider } from './provider.js';
describe('AI boundary', () => {
  it('validates untrusted provider output and never writes tasks', async () => {
    expect(
      generatedTaskSchema.safeParse({
        title: 'Draft',
        description: 'Text',
        acceptanceCriteria: [],
        suggestedDueAt: null,
      }).success,
    ).toBe(true);
    expect(
      generatedTaskSchema.safeParse({
        title: '',
        description: 'Text',
        acceptanceCriteria: [],
        suggestedDueAt: null,
      }).success,
    ).toBe(false);
    await expect(new DisabledTaskGenerationProvider().generateTaskDraft()).rejects.toMatchObject({
      code: 'AI_DISABLED',
    });
  });
});
