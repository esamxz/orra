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
  // Comma-separated email allowlist for private-alpha access control.
  // If unset, all valid Clerk users are allowed (staging-safe default).
  // Set in staging/production to restrict access to listed emails only.
  PRIVATE_ALPHA_EMAIL_ALLOWLIST: z.string().optional(),
  // P0.2: prompt enhancement via AI provider seam.
  // Default is deterministic. Set to 'ai' in staging/production with a real provider.
  PROMPT_ENHANCER_MODE: z.enum(['ai', 'deterministic']).optional(),
  AI_PROVIDER: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().optional(),
  AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // O0: Observability — all optional; omit to disable silently.
  OBSERVABILITY_ENABLED: z.literal('true').optional(),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  POSTHOG_PROJECT_TOKEN: z.string().optional(),
  POSTHOG_HOST: z.string().optional(),
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
    // Dev-only flags must never be set in staging or production.
    if (parsed.DEV_AUTH_ENABLED === 'true') {
      throw new Error(
        `DEV_AUTH_ENABLED is not allowed in ${parsed.ENVIRONMENT} environment`
      );
    }
    if (parsed.DEV_GENERATION_QUEUE_DISABLED === 'true') {
      throw new Error(
        `DEV_GENERATION_QUEUE_DISABLED is not allowed in ${parsed.ENVIRONMENT} environment`
      );
    }

    const missing: string[] = [];
    if (!parsed.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!parsed.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!parsed.CLERK_JWKS_URL) missing.push('CLERK_JWKS_URL');
    if (!parsed.CLERK_JWT_ISSUER) missing.push('CLERK_JWT_ISSUER');
    if (!parsed.ALLOWED_ORIGINS) missing.push('ALLOWED_ORIGINS');
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables for ${parsed.ENVIRONMENT}: ${missing.join(', ')}`
      );
    }

    // AI provider guards for staging/production
    const aiProvider = parsed.AI_PROVIDER ?? 'fake';
    if (parsed.PROMPT_ENHANCER_MODE === 'ai' && aiProvider === 'fake') {
      throw new Error(
        `AI_PROVIDER=fake is not allowed in ${parsed.ENVIRONMENT} when PROMPT_ENHANCER_MODE=ai`
      );
    }
  }

  // Gemini key guard applies in all environments
  if (
    parsed.PROMPT_ENHANCER_MODE === 'ai' &&
    (parsed.AI_PROVIDER ?? 'fake') === 'gemini' &&
    !parsed.GEMINI_API_KEY
  ) {
    throw new Error('GEMINI_API_KEY is required when PROMPT_ENHANCER_MODE=ai and AI_PROVIDER=gemini');
  }

  return parsed as Env;
}
