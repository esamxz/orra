import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { Context } from 'hono';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ListProjectsQuerySchema,
  ProjectIdParamSchema,
} from '../schemas/project.js';
import { validateJson, validateQuery, validateParam } from '../middleware/validate.js';
import { ProjectService } from '../services/projectService.js';
import { createServiceContext, getRepositories } from '../services/service-context.js';
import { getAuth } from '../middleware/auth.js';
import { getRequestId } from '../middleware/request-id.js';
import type { Repositories } from '../repositories/types.js';

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
  const service = new ProjectService(repos.project);
  const project = await service.createProject(ctx, body);
  return c.json({ ok: true, data: project }, 201);
});

// GET /v1/projects — list projects for the authenticated workspace
projectRoutes.get('/', validateQuery(ListProjectsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new ProjectService(repos.project);
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
  const service = new ProjectService(repos.project);
  const project = await service.getProject(ctx, id);
  return c.json({ ok: true, data: project });
});

// PATCH /v1/projects/:id — update a project
projectRoutes.patch('/:id', validateParam(ProjectIdParamSchema), validateJson(UpdateProjectSchema), async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new ProjectService(repos.project);
  const project = await service.updateProject(ctx, id, body);
  return c.json({ ok: true, data: project });
});

// DELETE /v1/projects/:id — delete a project
projectRoutes.delete('/:id', validateParam(ProjectIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const ctx = buildServiceContext(c);
  const repos = getRepositories(ctx);
  const service = new ProjectService(repos.project);
  await service.deleteProject(ctx, id);
  return c.json({ ok: true, data: { deleted: true } });
});

export default projectRoutes;
