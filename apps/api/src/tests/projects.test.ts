import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import projectRoutes from '../routes/projects.js';
import type { Repositories } from '../repositories/types.js';
import type { ProjectRow } from '@orra/db';
import type {
  CreateProjectInput,
  ListProjectsInput,
  FindProjectInput,
  UpdateProjectInput,
  DeleteProjectInput,
} from '../repositories/projectRepository.js';

const fakeVerifier = createFakeVerifier();

interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

function createFakeRepositories(projects: ProjectRow[] = []): Repositories {
  const projectList = [...projects];
  let nextId = 1;

  return {
    user: {
      findByClerkId: async () => null,
      createFromClerkIdentity: async () => ({
        id: 'user-fake-1',
        clerk_id: 'usr_test_fake',
        email: 'test@orra.local',
        display_name: 'Test User',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
    },
    workspace: {
      findPersonalWorkspaceForUser: async () => null,
      createPersonalWorkspace: async () => ({
        id: 'ws-fake-1',
        name: "Test User's Workspace",
        type: 'personal',
        owner_user_id: 'user-fake-1',
        plan: 'free',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
      ensurePersonalWorkspaceForUser: async () => ({
        workspaceId: 'ws-fake-1',
        role: 'owner',
      }),
    },
    project: {
      async create(input: CreateProjectInput) {
        const project: ProjectRow = {
          id: `proj-${nextId++}`,
          workspace_id: input.workspaceId,
          name: input.name,
          type: input.type,
          ratio: input.ratio as ProjectRow['ratio'],
          brand_system_id: input.brandSystemId ?? null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
        projectList.push(project);
        return project;
      },
      async listByWorkspace(input: ListProjectsInput) {
        return projectList
          .filter((p) => p.workspace_id === input.workspaceId)
          .slice(0, input.limit);
      },
      async findByIdForWorkspace(input: FindProjectInput) {
        return (
          projectList.find(
            (p) => p.id === input.id && p.workspace_id === input.workspaceId
          ) ?? null
        );
      },
      async updateForWorkspace(input: UpdateProjectInput) {
        const idx = projectList.findIndex(
          (p) => p.id === input.id && p.workspace_id === input.workspaceId
        );
        if (idx === -1) return null;
        projectList[idx] = { ...projectList[idx], ...input.updates };
        return projectList[idx];
      },
      async deleteForWorkspace(input: DeleteProjectInput) {
        const idx = projectList.findIndex(
          (p) => p.id === input.id && p.workspace_id === input.workspaceId
        );
        if (idx !== -1) projectList.splice(idx, 1);
      },
    },
  } as unknown as Repositories;
}

function buildApp(repositories?: Repositories) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(
    createAuthMiddleware(fakeVerifier, repositories ? { repositories } : undefined)
  );
  app.route('/v1/projects', projectRoutes);
  app.onError(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// POST /v1/projects
// ---------------------------------------------------------------------------

describe('POST /v1/projects', () => {
  it('creates a project with valid input', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'My Post',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { name: string }).name).toBe('My Post');
    expect((json.data as { type: string }).type).toBe('post');
    expect((json.data as { workspaceId: string }).workspaceId).toBe('ws-fake-1');
    expect((json.data as { ratio: unknown }).ratio).toEqual({ name: '4:5', w: 1080, h: 1350 });
  });

  it('returns validation error for missing name', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns validation error for invalid type', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test',
          type: 'invalid_type',
          ratio: { name: '4:5', w: 1080, h: 1350 },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns validation error for non-integer ratio dimensions', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test',
          type: 'post',
          ratio: { name: '4:5', w: 1080.5, h: 1350 },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.error!.code).toBe('VALIDATION');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/projects
// ---------------------------------------------------------------------------

describe('GET /v1/projects', () => {
  it('lists projects for the authenticated workspace', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(1);
    expect((json.data as Array<{ workspaceId: string }>)[0].workspaceId).toBe('ws-fake-1');
  });

  it('requires authentication', async () => {
    const app = buildApp();
    const res = await app.request(
      '/v1/projects',
      { method: 'GET' },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });

  it('respects limit query parameter', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'A',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        workspace_id: 'ws-fake-1',
        name: 'B',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects?limit=1',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect((json.data as unknown[])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/projects/:id
// ---------------------------------------------------------------------------

describe('GET /v1/projects/:id', () => {
  it('returns project in same workspace', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { id: string }).id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('returns NOT_FOUND for project in another workspace', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-other',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });

  it('returns validation error for invalid project id', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects/not-a-uuid',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/projects/:id
// ---------------------------------------------------------------------------

describe('PATCH /v1/projects/:id', () => {
  it('updates project in same workspace', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'Old Name',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111',
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { name: string }).name).toBe('New Name');
  });

  it('returns validation error for invalid update body', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111',
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: '' }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns NOT_FOUND for project in another workspace', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-other',
        name: 'Old Name',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111',
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/projects/:id
// ---------------------------------------------------------------------------

describe('DELETE /v1/projects/:id', () => {
  it('deletes project in same workspace', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111',
      { method: 'DELETE', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { deleted: boolean }).deleted).toBe(true);
  });

  it('returns NOT_FOUND for project in another workspace', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-other',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111',
      { method: 'DELETE', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Error response quality
// ---------------------------------------------------------------------------

describe('Project route error responses', () => {
  it('includes requestId on error responses', async () => {
    const app = buildApp();
    const res = await app.request(
      '/v1/projects',
      { method: 'GET', headers: { 'x-request-id': 'req-test-456' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.error!.requestId).toBe('req-test-456');
  });

  it('does not leak stack traces or DB details', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-other',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    const text = await res.text();
    expect(text).not.toContain('stack');
    expect(text).not.toContain('Supabase');
    expect(text).not.toContain('postgres');
    expect(text).not.toContain('SQL');
  });
});
