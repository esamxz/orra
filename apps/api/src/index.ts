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
      // Reflect origin so CORS preflight succeeds and the browser can read the 503.
      const origin = request.headers.get('origin') || '';
      const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
      if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      if (request.method === 'OPTIONS') {
        headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-request-id';
        headers['Access-Control-Max-Age'] = '86400';
        return new Response(null, { status: 204, headers });
      }
      return new Response('Service unavailable', { status: 503, headers });
    }
    const app = createApp();
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
