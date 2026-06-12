import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment bindings for Cloudflare Workers
// ---------------------------------------------------------------------------
// Placeholders for later phases. Not required at runtime for health tests.

export const EnvSchema = z.object({
  // Database — optional at schema level so health routes work without them;
  // validated at DB client creation time when a service actually needs DB.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_JWKS_URL: z.string().url().optional(),
  CLERK_JWT_ISSUER: z.string().optional(),
  CLERK_AUDIENCE: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  QUEUE_NAME: z.string().optional(),
  ENVIRONMENT: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  ALLOWED_ORIGINS: z.string().optional(), // comma-separated list
  DEV_AUTH_ENABLED: z.literal('true').optional(), // explicit opt-in for dev auth fallback
  DEV_GENERATION_QUEUE_DISABLED: z.literal('true').optional(), // explicit opt-in for local dev without queue
  // Credits granted to a workspace on first creation. Absent or 0 means no grant.
  // Set to a positive integer for staging/private-alpha testing.
  INITIAL_CREDIT_GRANT: z.coerce.number().int().nonnegative().optional(),
});

export type Env = z.infer<typeof EnvSchema> & {
  // Cloudflare bindings (optional until used)
  ORRA_ASSETS?: R2Bucket;
  GENERATION_QUEUE?: Queue;
};

/**
 * Parse and validate API environment bindings. In staging/production,
 * throws if critical vars are missing. In development, passes even if
 * optional vars are absent (health routes must work without DB config).
 *
 * Logs missing vars for operators; never exposes them to HTTP clients.
 */
export function validateApiEnv(env: unknown): Env {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new Error(`API environment validation failed: ${issues}`);
  }

  const parsed = result.data;

  if (parsed.ENVIRONMENT === 'staging' || parsed.ENVIRONMENT === 'production') {
    const missing: string[] = [];
    if (!parsed.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!parsed.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!parsed.CLERK_JWKS_URL) missing.push('CLERK_JWKS_URL');
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables for ${parsed.ENVIRONMENT}: ${missing.join(', ')}`
      );
    }
  }

  return parsed as Env;
}
