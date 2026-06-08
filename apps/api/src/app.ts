import { Hono } from 'hono';
import type { Env } from './env.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { devAuthMiddleware } from './middleware/dev-auth.js';
import v1Routes from './routes/v1.js';
import healthRoutes from './routes/health.js';

// ---------------------------------------------------------------------------
// Hono app factory
// ---------------------------------------------------------------------------
// Exported for both the Worker handler and test suites.

export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Global middleware
  app.use(requestIdMiddleware);
  app.use(corsMiddleware);
  app.use(devAuthMiddleware);

  // Health at root and under /v1
  app.route('/health', healthRoutes);
  app.route('/v1', v1Routes);

  // 404 fallback for unknown routes
  app.notFound((c) => {
    const requestId = (c.get('requestId' as never) as string | undefined) || 'unknown';
    return c.json(
      {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found.',
          requestId,
        },
      },
      404
    );
  });

  // Global error handler
  app.onError(errorHandler);

  return app;
}
