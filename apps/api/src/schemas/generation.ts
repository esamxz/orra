import { z } from 'zod';

// ---------------------------------------------------------------------------
// Generation job route schemas
// ---------------------------------------------------------------------------

export const GenerationScopeSchema = z.enum(['full_artifact', 'selected_card']);

export const CreateGenerationJobBodySchema = z
  .object({
    projectId: z.string().uuid(),
    approvalMessageId: z.string().uuid(),
    idempotencyKey: z.string().trim().max(256).optional(),
    generationScope: GenerationScopeSchema.optional().default('full_artifact'),
    targetCardId: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.generationScope === 'selected_card' && !val.targetCardId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetCardId'],
        message: 'targetCardId is required when generationScope is selected_card',
      });
    }
  });

export const JobIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Generation estimate route schemas (W8)
// ---------------------------------------------------------------------------

export const GenerationEstimateBodySchema = z
  .object({
    generationScope: GenerationScopeSchema,
    targetCardId: z.string().uuid().optional(),
    approvalMessageId: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.generationScope === 'selected_card' && !val.targetCardId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetCardId'],
        message: 'targetCardId is required when generationScope is selected_card',
      });
    }
  });
