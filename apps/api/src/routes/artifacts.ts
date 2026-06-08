import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { Context } from 'hono';
import { ArtifactIdParamSchema } from '../schemas/artifact.js';
import { validateParam } from '../middleware/validate.js';
import { ArtifactService } from '../services/artifactService.js';
import { createServiceContext, getRepositories } from '../services/service-context.js';
import { getAuth } from '../middleware/auth.js';
import { getRequestId } from '../middleware/request-id.js';
import type { Repositories } from '../repositories/types.js';

// ---------------------------------------------------------------------------
// Artifact routes — protected, read-only in Phase 8B
// ---------------------------------------------------------------------------

const artifactRoutes = new Hono<{ Bindings: Env }>();

function buildServiceContext(c: Context<{ Bindings: Env }>): ReturnType<typeof createServiceContext> {
  const auth = getAuth(c);
  const requestId = getRequestId(c) ?? 'unknown';
  const repositories = c.get('repositories' as never) as Repositories | undefined;
  return createServiceContext(c.env, requestId, auth ?? undefined, repositories ? { repositories } : undefined);
}

// GET /v1/artifacts/:id — get current artifact with document
artifactRoutes.get('/:id', validateParam(ArtifactIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new ArtifactService(repos.artifact);
  const artifact = await service.getCurrentArtifact(ctx, id);
  return c.json({ ok: true, data: artifact });
});

export default artifactRoutes;
