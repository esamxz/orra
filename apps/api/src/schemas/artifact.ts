import { z } from 'zod';
import { ActionSchema } from '@orra/shared';

// ---------------------------------------------------------------------------
// Artifact route schemas
// ---------------------------------------------------------------------------

export const ArtifactIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ApplyActionBodySchema = z.object({
  baseVersion: z.number().int().positive(),
  action: ActionSchema,
});
