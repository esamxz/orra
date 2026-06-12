import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { Context } from 'hono';
import { CreateGenerationJobBodySchema, JobIdParamSchema } from '../schemas/generation.js';
import { validateParam, validateJson } from '../middleware/validate.js';
import { GenerationService } from '../services/generationService.js';
import { CreditService } from '../services/creditService.js';
import { createServiceContext, getRepositories } from '../services/service-context.js';
import { getAuth } from '../middleware/auth.js';
import { getRequestId } from '../middleware/request-id.js';
import type { Repositories } from '../repositories/types.js';

// ---------------------------------------------------------------------------
// Generation routes — protected
// ---------------------------------------------------------------------------
// Mounted under /v1 so the full paths are:
//   POST /v1/generate  -> { ok: true, data: GenerationJobDto }
//   GET  /v1/jobs/:id   -> { ok: true, data: GenerationJobDto }
//
// Phase 9F: stub only. Creates a queued generation_jobs row without enqueueing
// to a queue, reserving credits, or invoking AI.

const generationRoutes = new Hono<{ Bindings: Env }>();

function buildServiceContext(c: Context<{ Bindings: Env }>): ReturnType<typeof createServiceContext> {
  const auth = getAuth(c);
  const requestId = getRequestId(c) ?? 'unknown';
  const repositories = c.get('repositories' as never) as Repositories | undefined;
  return createServiceContext(c.env, requestId, auth ?? undefined, repositories ? { repositories } : undefined);
}

// POST /v1/generate — create a stub generation job
//
// Requires an approved approval_summary message. Returns a queued job row.
// No queue, no credits, no AI in this phase.
generationRoutes.post(
  '/generate',
  validateJson(CreateGenerationJobBodySchema),
  async (c) => {
    const body = c.req.valid('json');
    const ctx = buildServiceContext(c);
    const repos = getRepositories(ctx);
    const creditService = new CreditService(repos.credit);
    const service = new GenerationService(
      repos.generationJob,
      repos.chat,
      repos.project,
      creditService,
      c.env,
      repos.brandSystem
    );
    const job = await service.createStubGenerationJob(ctx, {
      projectId: body.projectId,
      approvalMessageId: body.approvalMessageId,
      idempotencyKey: body.idempotencyKey,
      generationScope: body.generationScope,
      targetCardId: body.targetCardId,
    });
    return c.json({ ok: true, data: job }, 201);
  }
);

// GET /v1/jobs/:id — get generation job status
//
// Returns the durable job row scoped to the caller's workspace.
generationRoutes.get(
  '/jobs/:id',
  validateParam(JobIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const ctx = buildServiceContext(c);
    const repos = getRepositories(ctx);
    const creditService = new CreditService(repos.credit);
    const service = new GenerationService(
      repos.generationJob,
      repos.chat,
      repos.project,
      creditService,
      c.env,
      repos.brandSystem
    );
    const job = await service.getJob(ctx, id);
    return c.json({ ok: true, data: job });
  }
);

export default generationRoutes;
