import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment bindings for Cloudflare Workers
// ---------------------------------------------------------------------------
// Placeholders for later phases. Not required at runtime for health tests.

export const EnvSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  QUEUE_NAME: z.string().optional(),
  ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
  ALLOWED_ORIGINS: z.string().optional(), // comma-separated list
});

export type Env = z.infer<typeof EnvSchema> & {
  // Cloudflare bindings (optional until used)
  ORRA_ASSETS?: R2Bucket;
  ORRA_QUEUE?: Queue;
};
