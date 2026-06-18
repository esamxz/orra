import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { Context } from 'hono';
import { TrendTemplateService } from '../services/trendTemplateService.js';
import { createServiceContext, getRepositories } from '../services/service-context.js';
import { getAuth } from '../middleware/auth.js';
import { getRequestId } from '../middleware/request-id.js';
import type { Repositories } from '../repositories/types.js';
import { createR2Signer } from '../r2/r2Signer.js';

// ---------------------------------------------------------------------------
// Trend template routes — protected
// ---------------------------------------------------------------------------
// Read-only catalog. Requires Clerk auth (consistent with all /v1 routes).
// Templates are platform-owned; no workspace scoping needed for reads.

const trendTemplateRoutes = new Hono<{ Bindings: Env }>();

function buildServiceContext(c: Context<{ Bindings: Env }>): ReturnType<typeof createServiceContext> {
  const auth = getAuth(c);
  const requestId = getRequestId(c) ?? 'unknown';
  const repositories = c.get('repositories' as never) as Repositories | undefined;
  return createServiceContext(c.env, requestId, auth ?? undefined, repositories ? { repositories } : undefined);
}

// GET /v1/trend-templates — list active templates ordered by sort_index
trendTemplateRoutes.get('/', async (c) => {
  const ctx = buildServiceContext(c);
  const requestId = getRequestId(c) ?? 'unknown';
  try {
    const repos = getRepositories(ctx);
    // Preview signing is optional: if R2 is not configured we still return the
    // catalog with previewUrl=null and the frontend renders a fallback visual.
    let signer: ReturnType<typeof createR2Signer> | undefined;
    try {
      signer = createR2Signer(c.env);
    } catch (signerErr) {
      console.error(
        `[trend-templates] R2 signer unavailable; returning catalog without preview URLs (requestId=${requestId}):`,
        signerErr
      );
    }
    const service = new TrendTemplateService(repos.trendTemplate, signer);
    const templates = await service.listActive(ctx);
    return c.json({ ok: true, data: templates });
  } catch (err) {
    // Log the real database / service error before the global error handler
    // turns it into a generic 500. This makes future staging failures visible
    // in `wrangler tail` without leaking internals to HTTP clients.
    console.error(`[trend-templates] listActive failed (requestId=${requestId}):`, err);
    throw err;
  }
});

export default trendTemplateRoutes;
