import { withSentry } from '@sentry/cloudflare';
import { createApp } from './app.js';
import type { Env } from './env.js';
import { validateApiEnv } from './env.js';
import { scrubSentryEvent } from './lib/observability.js';

// ---------------------------------------------------------------------------
// Cloudflare Worker entry point
// ---------------------------------------------------------------------------

const baseHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      validateApiEnv(env);
    } catch (err) {
      // Log for operators; return generic 503 to client (no env details leaked).
      console.error('[startup] env validation failed:', err instanceof Error ? err.message : err);
      return new Response('Service unavailable', { status: 503 });
    }
    const app = createApp();
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

export default withSentry<Env>(
  (env) => ({
    dsn: env.SENTRY_DSN ?? '',
    environment: env.SENTRY_ENVIRONMENT ?? env.ENVIRONMENT ?? 'development',
    enabled: env.OBSERVABILITY_ENABLED === 'true' && !!env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeSend(event: any) {
      return scrubSentryEvent(event as Record<string, unknown>) as typeof event;
    },
  }),
  baseHandler,
);
