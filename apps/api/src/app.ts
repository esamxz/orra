import { Hono } from 'hono';
import type { Env } from './env.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createProductionVerifier } from './auth/verifier.js';
import v1Routes from './routes/v1.js';
import healthRoutes from './routes/health.js';

// ---------------------------------------------------------------------------
// Hono app factory
// ---------------------------------------------------------------------------
// Exported for both the Worker handler and test suites.

export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Global middleware (no auth)
  app.use(requestIdMiddleware);
  app.use(corsMiddleware);

  // Public routes — health at root and under /v1
  app.route('/health', healthRoutes);
  app.route('/v1/health', healthRoutes);

  // Protected v1 routes — auth middleware applies to everything under /v1/*
  // except /v1/health which was registered above and handles first.
  app.use('/v1/*', createAuthMiddleware(createProductionVerifier()));
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
      404 as Parameters<typeof c.json>[1]
    );
  });

  // Global error handler
  app.onError(errorHandler);

  return app;
}
