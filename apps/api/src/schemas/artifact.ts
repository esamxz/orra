import { z } from 'zod';

// ---------------------------------------------------------------------------
// Artifact route schemas
// ---------------------------------------------------------------------------

export const ArtifactIdParamSchema = z.object({
  id: z.string().uuid(),
});
