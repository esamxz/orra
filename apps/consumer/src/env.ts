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
  AI_PROVIDER: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().optional(),
  GEMINI_BASE_URL: z.string().optional(),
  // z.coerce.number() because Worker bindings are always strings at runtime
  AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
});

export type ConsumerEnv = z.infer<typeof ConsumerEnvSchema>;
