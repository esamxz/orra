/**
 * AI provider configuration for the generation consumer.
 *
 * AI_PROVIDER=fake (default)
 *   Uses FakeAIProvider — deterministic, no network calls.
 *   All automated tests use this default. Never requires an API key.
 *
 * AI_PROVIDER=gemini
 *   Uses GeminiTextProvider for real text planning via Google Gemini.
 *   Requires GEMINI_API_KEY to be set in consumer runtime/staging secrets only.
 *   NEVER add GEMINI_API_KEY to apps/web or apps/api environment.
 *   Run the manual smoke test: pnpm --filter @orra/ai smoke:gemini
 *
 * IMAGE_PROVIDER=fake (default)
 *   Uses FakeImageProvider — deterministic, no network calls.
 *   All automated tests use this default. Never requires an API key.
 *
 * IMAGE_PROVIDER=gemini
 *   Uses GeminiImageProvider (Gemini 2.5 Flash Image) for real image generation.
 *   Requires GEMINI_API_KEY — shared with AI_PROVIDER=gemini (one key for both).
 *   NEVER add GEMINI_API_KEY to apps/web or apps/api environment.
 *   Model is configurable via GEMINI_IMAGE_MODEL (defaults to gemini-2.5-flash-image).
 *   Generated image R2 storage and artifact integration are implemented in later phases.
 *
 * IMAGE_PROVIDER=flux is deprecated. Use IMAGE_PROVIDER=gemini.
 *
 * [provider_plan] log events show:
 *   jobId, provider, status, durationMs, cardCount (on success)
 *   jobId, provider, status, durationMs, errorCode (on failure)
 *
 * [provider_plan] log events intentionally omit:
 *   prompt text, raw AI response, API key, project memory content,
 *   chat message content, artifact JSON
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment bindings for the queue consumer Worker
// ---------------------------------------------------------------------------
// The consumer needs DB access but no Clerk auth. It receives messages
// from the generation queue and processes them idempotently.

export const ConsumerEnvSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string(),
    ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
    AI_PROVIDER: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_TEXT_MODEL: z.string().optional(),
    GEMINI_BASE_URL: z.string().optional(),
    // z.coerce.number() because Worker bindings are always strings at runtime
    AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
    IMAGE_PROVIDER: z.string().optional(),
    /** Optional Gemini image model override. Defaults to gemini-2.5-flash-image. */
    GEMINI_IMAGE_MODEL: z.string().optional(),
    // Emergency escape hatch: allows fake providers in production for debugging.
    // Must be explicitly set to 'true'. Default in production is to block fake.
    ALLOW_FAKE_PROVIDER_IN_PRODUCTION: z.literal('true').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.AI_PROVIDER === 'gemini' && !data.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GEMINI_API_KEY is required when AI_PROVIDER=gemini',
        path: ['GEMINI_API_KEY'],
      });
    }
    if (data.IMAGE_PROVIDER === 'gemini' && !data.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GEMINI_API_KEY is required when IMAGE_PROVIDER=gemini',
        path: ['GEMINI_API_KEY'],
      });
    }
    const imgProvider = (data.IMAGE_PROVIDER ?? '').trim().toLowerCase();
    if (imgProvider === 'flux') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'IMAGE_PROVIDER=flux is no longer supported. Use IMAGE_PROVIDER=gemini with GEMINI_API_KEY.',
        path: ['IMAGE_PROVIDER'],
      });
    }
    // Production must not run fake providers by accident.
    if (data.ENVIRONMENT === 'production' && data.ALLOW_FAKE_PROVIDER_IN_PRODUCTION !== 'true') {
      const ai = (data.AI_PROVIDER ?? 'fake').trim().toLowerCase();
      if (ai === 'fake' || ai === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'AI_PROVIDER=fake is not allowed in production. Set AI_PROVIDER=gemini with GEMINI_API_KEY, or set ALLOW_FAKE_PROVIDER_IN_PRODUCTION=true for emergency use only.',
          path: ['AI_PROVIDER'],
        });
      }
      const img = (data.IMAGE_PROVIDER ?? 'fake').trim().toLowerCase();
      if (img === 'fake' || img === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'IMAGE_PROVIDER=fake is not allowed in production. Set IMAGE_PROVIDER=gemini with GEMINI_API_KEY, or set ALLOW_FAKE_PROVIDER_IN_PRODUCTION=true for emergency use only.',
          path: ['IMAGE_PROVIDER'],
        });
      }
    }
  });

export type ConsumerEnv = z.infer<typeof ConsumerEnvSchema>;

/**
 * Parse and validate consumer environment bindings. Throws a clear error
 * listing all validation failures if the env is misconfigured.
 */
export function validateConsumerEnv(env: unknown): ConsumerEnv {
  const result = ConsumerEnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Consumer environment validation failed: ${issues}`);
  }
  return result.data;
}
