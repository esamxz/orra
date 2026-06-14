import { createApp } from './app.js';
import type { Env } from './env.js';
import { validateApiEnv } from './env.js';

// ---------------------------------------------------------------------------
// Cloudflare Worker entry point
// ---------------------------------------------------------------------------

export default {
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
