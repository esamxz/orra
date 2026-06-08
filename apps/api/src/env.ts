import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment bindings for Cloudflare Workers
// ---------------------------------------------------------------------------
// Placeholders for later phases. Not required at runtime for health tests.

export const EnvSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_JWKS_URL: z.string().url().optional(),
  CLERK_JWT_ISSUER: z.string().optional(),
  CLERK_AUDIENCE: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  QUEUE_NAME: z.string().optional(),
  ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
  ALLOWED_ORIGINS: z.string().optional(), // comma-separated list
  DEV_AUTH_ENABLED: z.literal('true').optional(), // explicit opt-in for dev auth fallback
});

export type Env = z.infer<typeof EnvSchema> & {
  // Cloudflare bindings (optional until used)
  ORRA_ASSETS?: R2Bucket;
  ORRA_QUEUE?: Queue;
};
