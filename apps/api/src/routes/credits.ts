import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { Context } from 'hono';
import { CreditService } from '../services/creditService.js';
import { createServiceContext, getRepositories } from '../services/service-context.js';
import { getAuth } from '../middleware/auth.js';
import { getRequestId } from '../middleware/request-id.js';
import type { Repositories } from '../repositories/types.js';

// ---------------------------------------------------------------------------
// Credit routes — protected, read-only in Phase 10A
// ---------------------------------------------------------------------------
// Mounted under /v1 so full paths are:
//   GET /v1/credits           -> { ok: true, data: CreditStatusResponse }
//   GET /v1/credits/ledger    -> { ok: true, data: CreditLedgerEntryDto[] }
//
// Phase 10A: read only. No mutation routes.
// Phase 10B: generation will call CreditService internally to reserve/capture.

const creditRoutes = new Hono<{ Bindings: Env }>();

function buildServiceContext(c: Context<{ Bindings: Env }>): ReturnType<typeof createServiceContext> {
  const auth = getAuth(c);
  const requestId = getRequestId(c) ?? 'unknown';
  const repositories = c.get('repositories' as never) as Repositories | undefined;
  return createServiceContext(c.env, requestId, auth ?? undefined, repositories ? { repositories } : undefined);
}

// GET /v1/credits — current balance + recent ledger
//
// Returns the workspace-scoped credit status. No cross-workspace leakage
// because ServiceContext carries the resolved auth workspaceId.
creditRoutes.get('/', async (c) => {
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new CreditService(repos.credit);
  const result = await service.getCreditStatus(ctx);
  return c.json({ ok: true, data: result });
});

// GET /v1/credits/ledger — paginated ledger history
//
// Phase 10A: returns the most recent 50 entries. Future phases may add
// cursor-based pagination.
creditRoutes.get('/ledger', async (c) => {
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new CreditService(repos.credit);
  const result = await service.listLedger(ctx, { limit: 50 });
  return c.json({ ok: true, data: result });
});

export default creditRoutes;
