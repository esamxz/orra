import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { Context } from 'hono';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ListProjectsQuerySchema,
  ProjectIdParamSchema,
} from '../schemas/project.js';
import {
  ProjectUploadIntentBodySchema,
  ProjectAssetConfirmParamSchema,
  AssetConfirmBodySchema,
} from '../schemas/asset.js';
import { validateJson, validateQuery, validateParam } from '../middleware/validate.js';
import { ProjectService } from '../services/projectService.js';
import { AssetUploadService } from '../services/assetUploadService.js';
import { createServiceContext, getRepositories } from '../services/service-context.js';
import { getAuth } from '../middleware/auth.js';
import { getRequestId } from '../middleware/request-id.js';
import type { Repositories } from '../repositories/types.js';
import { createR2Signer } from '../r2/r2Signer.js';
import { createR2ObjectInspector } from '../r2/r2ObjectInspector.js';

// ---------------------------------------------------------------------------
// Project routes — protected
// ---------------------------------------------------------------------------
// All routes require authentication. Workspace scoping is enforced by the
// service layer; routes are thin and never touch Supabase directly.

const projectRoutes = new Hono<{ Bindings: Env }>();

function buildServiceContext(c: Context<{ Bindings: Env }>): ReturnType<typeof createServiceContext> {
  const auth = getAuth(c);
  const requestId = getRequestId(c) ?? 'unknown';
  const repositories = c.get('repositories' as never) as Repositories | undefined;
  return createServiceContext(c.env, requestId, auth ?? undefined, repositories ? { repositories } : undefined);
}

// POST /v1/projects — create a project
projectRoutes.post('/', validateJson(CreateProjectSchema), async (c) => {
  const body = c.req.valid('json');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new ProjectService(repos.project, repos.artifact, repos.brandSystem);
  const project = await service.createProject(ctx, body);
  return c.json({ ok: true, data: project }, 201);
});

// GET /v1/projects — list projects for the authenticated workspace
projectRoutes.get('/', validateQuery(ListProjectsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new ProjectService(repos.project, repos.artifact, repos.brandSystem);
  const projects = await service.listProjects(ctx, {
    tab: query.tab,
    limit: query.limit,
  });
  return c.json({ ok: true, data: projects });
});

// GET /v1/projects/:id — get a single project
projectRoutes.get('/:id', validateParam(ProjectIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new ProjectService(repos.project, repos.artifact, repos.brandSystem);
  const project = await service.getProject(ctx, id);
  return c.json({ ok: true, data: project });
});

// PATCH /v1/projects/:id — update a project
projectRoutes.patch('/:id', validateParam(ProjectIdParamSchema), validateJson(UpdateProjectSchema), async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new ProjectService(repos.project, repos.artifact, repos.brandSystem);
  const project = await service.updateProject(ctx, id, body);
  return c.json({ ok: true, data: project });
});

// DELETE /v1/projects/:id — delete a project
projectRoutes.delete('/:id', validateParam(ProjectIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new ProjectService(repos.project, repos.artifact, repos.brandSystem);
  await service.deleteProject(ctx, id);
  return c.json({ ok: true, data: { deleted: true } });
});

// POST /v1/projects/:id/assets/upload-intent — request an upload URL for a project asset
projectRoutes.post(
  '/:id/assets/upload-intent',
  validateParam(ProjectIdParamSchema),
  validateJson(ProjectUploadIntentBodySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const ctx = buildServiceContext(c);
    const repos = getRepositories(ctx);
    const signer = createR2Signer(c.env);
    const service = new AssetUploadService(repos.asset, repos.project, repos.brandSystem, signer);
    const result = await service.createProjectUploadIntent(ctx, id, {
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      kind: body.kind,
    });
    return c.json({ ok: true, data: result }, 201);
  }
);

// POST /v1/projects/:projectId/assets/:assetId/confirm — confirm a project asset upload
projectRoutes.post(
  '/:projectId/assets/:assetId/confirm',
  validateParam(ProjectAssetConfirmParamSchema),
  validateJson(AssetConfirmBodySchema),
  async (c) => {
    const { projectId, assetId } = c.req.valid('param');
    const body = c.req.valid('json');
    const ctx = buildServiceContext(c);
    const repos = getRepositories(ctx);
    const signer = createR2Signer(c.env);
    const inspector = createR2ObjectInspector(c.env);
    const service = new AssetUploadService(repos.asset, repos.project, repos.brandSystem, signer, inspector);
    const result = await service.confirmProjectAssetUpload(ctx, projectId, assetId, {
      expectedSizeBytes: body.expectedSizeBytes,
      expectedContentType: body.expectedContentType,
    });
    return c.json({ ok: true, data: result });
  }
);

export default projectRoutes;
