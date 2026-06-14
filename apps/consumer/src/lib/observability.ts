import { captureException } from '@sentry/cloudflare';
import { PostHog } from 'posthog-node';
import type { ConsumerEnv } from '../env.js';

// ---------------------------------------------------------------------------
// Sentry event scrubbing — same rules as API
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  'prompt', 'enhancedPrompt', 'r2Key', 'apiKey', 'providerResponse', 'document',
  'GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
]);

const SIGNED_URL_RE = /^https?:\/\/[^?]+\?[^&]*X-Amz/i;
const AUTH_HEADER_RE = /^Bearer /i;

function scrubValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key)) return '[scrubbed]';
  if (typeof value === 'string' && (SIGNED_URL_RE.test(value) || AUTH_HEADER_RE.test(value))) {
    return '[scrubbed]';
  }
  return value;
}

export function scrubSentryEvent(event: Record<string, unknown>): Record<string, unknown> {
  const scrubObj = (obj: unknown): unknown => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(scrubObj);
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = scrubValue(k, typeof v === 'object' ? scrubObj(v) : v);
    }
    return result;
  };
  return scrubObj(event) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Observability gate
// ---------------------------------------------------------------------------

export function isConsumerObservabilityEnabled(
  env: Pick<ConsumerEnv, 'OBSERVABILITY_ENABLED' | 'SENTRY_DSN'>,
): boolean {
  return env.OBSERVABILITY_ENABLED === 'true' && !!env.SENTRY_DSN;
}

// ---------------------------------------------------------------------------
// Sentry — capture consumer job errors with safe tags only
// ---------------------------------------------------------------------------

export interface ConsumerErrorTags {
  provider?: string;
  generationScope?: string;
  jobId?: string;
  projectId?: string;
  errorCode?: string;
  retryable?: boolean;
}

export function captureConsumerError(err: unknown, tags: ConsumerErrorTags): void {
  try {
    captureException(err, { tags: tags as Record<string, string | number | boolean> });
  } catch {
    // fail open
  }
}

// ---------------------------------------------------------------------------
// PostHog — fire-and-forget backend event tracking
// ---------------------------------------------------------------------------

export type BackendSafeEvent =
  | 'api_error_5xx'
  | 'prompt_enhance_failed'
  | 'generation_job_created'
  | 'generation_job_started'
  | 'generation_job_succeeded'
  | 'generation_job_failed'
  | 'credit_reserved'
  | 'credit_captured'
  | 'credit_refunded';

export function trackConsumerEvent(
  env: Pick<ConsumerEnv, 'OBSERVABILITY_ENABLED' | 'POSTHOG_PROJECT_TOKEN' | 'POSTHOG_HOST'>,
  event: BackendSafeEvent,
  props?: Record<string, string | number | boolean>,
): void {
  if (env.OBSERVABILITY_ENABLED !== 'true' || !env.POSTHOG_PROJECT_TOKEN) return;
  try {
    const ph = new PostHog(env.POSTHOG_PROJECT_TOKEN, {
      host: env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
    ph.capture({ distinctId: 'consumer', event, properties: props ?? {} });
    ph.shutdown().catch(() => {}); // fire-and-forget; never block job processing
  } catch {
    // fail open
  }
}
