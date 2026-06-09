import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { Context } from 'hono';
import {
  CreateBrandSystemSchema,
  UpdateBrandSystemSchema,
  ListBrandSystemsQuerySchema,
  BrandSystemIdParamSchema,
} from '../schemas/brand.js';
import { validateJson, validateQuery, validateParam } from '../middleware/validate.js';
import { BrandSystemService } from '../services/brandSystemService.js';
import { createServiceContext, getRepositories } from '../services/service-context.js';
import { getAuth } from '../middleware/auth.js';
import { getRequestId } from '../middleware/request-id.js';
import type { Repositories } from '../repositories/types.js';

// ---------------------------------------------------------------------------
// Brand system routes — protected
// ---------------------------------------------------------------------------
// All routes require authentication. Workspace scoping is enforced by the
// service layer; routes are thin and never touch Supabase directly.

const brandRoutes = new Hono<{ Bindings: Env }>();

function buildServiceContext(c: Context<{ Bindings: Env }>): ReturnType<typeof createServiceContext> {
  const auth = getAuth(c);
  const requestId = getRequestId(c) ?? 'unknown';
  const repositories = c.get('repositories' as never) as Repositories | undefined;
  return createServiceContext(c.env, requestId, auth ?? undefined, repositories ? { repositories } : undefined);
}

// POST /v1/brand-systems — create a brand system
brandRoutes.post('/', validateJson(CreateBrandSystemSchema), async (c) => {
  const body = c.req.valid('json');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new BrandSystemService(repos.brandSystem);
  const brand = await service.createBrandSystem(ctx, body);
  return c.json({ ok: true, data: brand }, 201);
});

// GET /v1/brand-systems — list brand systems for the authenticated workspace
brandRoutes.get('/', validateQuery(ListBrandSystemsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new BrandSystemService(repos.brandSystem);
  const brands = await service.listBrandSystems(ctx, {
    limit: query.limit,
    search: query.search,
  });
  return c.json({ ok: true, data: brands });
});

// GET /v1/brand-systems/:id — get a single brand system
brandRoutes.get('/:id', validateParam(BrandSystemIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new BrandSystemService(repos.brandSystem);
  const brand = await service.getBrandSystem(ctx, id);
  return c.json({ ok: true, data: brand });
});

// PATCH /v1/brand-systems/:id — update a brand system
brandRoutes.patch('/:id', validateParam(BrandSystemIdParamSchema), validateJson(UpdateBrandSystemSchema), async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new BrandSystemService(repos.brandSystem);
  const brand = await service.updateBrandSystem(ctx, id, body);
  return c.json({ ok: true, data: brand });
});

// DELETE /v1/brand-systems/:id — delete a brand system
brandRoutes.delete('/:id', validateParam(BrandSystemIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new BrandSystemService(repos.brandSystem);
  await service.deleteBrandSystem(ctx, id);
  return c.json({ ok: true, data: { deleted: true } });
});

export default brandRoutes;
