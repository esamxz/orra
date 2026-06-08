import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment bindings for the queue consumer Worker
// ---------------------------------------------------------------------------
// The consumer needs DB access but no Clerk auth. It receives messages
// from the generation queue and processes them idempotently.

export const ConsumerEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
});

export type ConsumerEnv = z.infer<typeof ConsumerEnvSchema>;
