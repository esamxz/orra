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
  })
  .superRefine((data, ctx) => {
    if (data.AI_PROVIDER === 'gemini' && !data.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GEMINI_API_KEY is required when AI_PROVIDER=gemini',
        path: ['GEMINI_API_KEY'],
      });
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
