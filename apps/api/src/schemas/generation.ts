import { z } from 'zod';

// ---------------------------------------------------------------------------
// Generation job route schemas
// ---------------------------------------------------------------------------

export const CreateGenerationJobBodySchema = z.object({
  projectId: z.string().uuid(),
  approvalMessageId: z.string().uuid(),
  idempotencyKey: z.string().trim().max(256).optional(),
});

export const JobIdParamSchema = z.object({
  id: z.string().uuid(),
});
