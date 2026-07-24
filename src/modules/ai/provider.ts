import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
export const generatedTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(20_000),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(10),
    suggestedDueAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type TaskDraftResult = z.infer<typeof generatedTaskSchema>;
export interface TaskGenerationProvider {
  generateTaskDraft(
    input: { prompt: string },
    context: { userId: string; projectId: string },
  ): Promise<TaskDraftResult>;
  summarizeTask(
    input: { taskId: string },
    context: { userId: string; projectId: string },
  ): Promise<{ summary: string }>;
}
export class DisabledTaskGenerationProvider implements TaskGenerationProvider {
  generateTaskDraft(): Promise<never> {
    return Promise.reject(
      new AppError(503, 'AI_DISABLED', 'Service unavailable', 'AI functionality is disabled.'),
    );
  }
  summarizeTask(): Promise<never> {
    return Promise.reject(
      new AppError(503, 'AI_DISABLED', 'Service unavailable', 'AI functionality is disabled.'),
    );
  }
}
