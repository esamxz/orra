import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import projectRoutes from '../routes/projects.js';
import type { Repositories } from '../repositories/types.js';
import type { ProjectRow, ArtifactRow, ArtifactVersionRow, BrandSystemRow } from '@orra/db';
import type {
  CreateBrandSystemInput,
  ListBrandSystemsInput,
  FindBrandSystemInput,
  UpdateBrandSystemInput,
  DeleteBrandSystemInput,
} from '../repositories/brandSystemRepository.js';
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

function createFakeRepositories(
  projects: ProjectRow[] = [],
  brands: BrandSystemRow[] = []
): Repositories {
  const projectList = [...projects];
  const brandList = [...brands];
  const artifacts: ArtifactRow[] = [];
  const versions: ArtifactVersionRow[] = [];
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
    artifact: {
      async createArtifactForProject(input: { workspaceId: string; projectId: string }) {
        const artifact: ArtifactRow = {
          id: randomUUID(),
          workspace_id: input.workspaceId,
          project_id: input.projectId,
          current_version_id: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
        artifacts.push(artifact);
        return artifact;
      },
      async createVersion(input: {
        workspaceId: string;
        artifactId: string;
        version: number;
        document: unknown;
        reason: ArtifactVersionRow['reason'];
        createdBy: ArtifactVersionRow['created_by'];
      }) {
        const version: ArtifactVersionRow = {
          id: randomUUID(),
          workspace_id: input.workspaceId,
          artifact_id: input.artifactId,
          version: input.version,
          document: input.document as import('@orra/db').Json,
          reason: input.reason,
          created_by: input.createdBy,
          brand_context_snapshot: null,
          created_at: '2026-01-01T00:00:00Z',
        };
        versions.push(version);
        return version;
      },
      async setCurrentVersion(input: { workspaceId: string; artifactId: string; versionId: string }) {
        const idx = artifacts.findIndex(
          (a) => a.id === input.artifactId && a.workspace_id === input.workspaceId
        );
        if (idx === -1) {
          throw new Error('Artifact not found');
        }
        artifacts[idx] = { ...artifacts[idx], current_version_id: input.versionId };
        return artifacts[idx];
      },
      async getArtifactByIdForWorkspace(input: { id: string; workspaceId: string }) {
        return (
          artifacts.find(
            (a) => a.id === input.id && a.workspace_id === input.workspaceId
          ) ?? null
        );
      },
      async getArtifactByProjectIdForWorkspace(input: { projectId: string; workspaceId: string }) {
        return (
          artifacts.find(
            (a) => a.project_id === input.projectId && a.workspace_id === input.workspaceId
          ) ?? null
        );
      },
      async getCurrentVersion(input: { artifactId: string; workspaceId: string }) {
        const artifact = artifacts.find(
          (a) => a.id === input.artifactId && a.workspace_id === input.workspaceId
        );
        if (!artifact || !artifact.current_version_id) return null;
        const version = versions.find((v) => v.id === artifact.current_version_id);
        if (!version) return null;
        return { artifact, version };
      },
    },
    chat: {
      async ensureThreadForProject(input: { workspaceId: string; projectId: string }) {
        return {
          id: 'thread-fake-1',
          workspace_id: input.workspaceId,
          project_id: input.projectId,
          title: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
      },
      async findThreadByProjectId() {
        return null;
      },
      async listMessagesByThread() {
        return [];
      },
      async appendMessage(input: {
        workspaceId: string;
        threadId: string;
        role: import('@orra/db').ChatMessageRow['role'];
        kind: import('@orra/db').ChatMessageRow['kind'];
        content: string;
        metadata?: import('@orra/db').Json;
        seq?: number;
      }) {
        return {
          id: randomUUID(),
          workspace_id: input.workspaceId,
          thread_id: input.threadId,
          role: input.role,
          kind: input.kind,
          content: input.content,
          metadata: input.metadata ?? {},
          seq: input.seq ?? null,
          created_at: '2026-01-01T00:00:00Z',
        };
      },
    },
    brandSystem: {
      async create(input: CreateBrandSystemInput) {
        const brand: BrandSystemRow = {
          id: `brand-${nextId++}`,
          workspace_id: input.workspaceId,
          name: input.name,
          description: input.description ?? null,
          tone_of_voice: input.toneOfVoice ?? null,
          visual_direction: input.visualDirection ?? null,
          rules: input.rules ?? null,
          palette: input.palette as unknown as BrandSystemRow['palette'],
          typography: input.typography as unknown as BrandSystemRow['typography'],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
        brandList.push(brand);
        return brand;
      },
      async listByWorkspace(input: ListBrandSystemsInput) {
        return brandList
          .filter((b) => b.workspace_id === input.workspaceId)
          .slice(0, input.limit);
      },
      async findByIdForWorkspace(input: FindBrandSystemInput) {
        return (
          brandList.find(
            (b) => b.id === input.id && b.workspace_id === input.workspaceId
          ) ?? null
        );
      },
      async updateForWorkspace(input: UpdateBrandSystemInput) {
        const idx = brandList.findIndex(
          (b) => b.id === input.id && b.workspace_id === input.workspaceId
        );
        if (idx === -1) return null;
        brandList[idx] = { ...brandList[idx], ...input.updates };
        return brandList[idx];
      },
      async deleteForWorkspace(input: DeleteBrandSystemInput) {
        const idx = brandList.findIndex(
          (b) => b.id === input.id && b.workspace_id === input.workspaceId
        );
        if (idx !== -1) brandList.splice(idx, 1);
      },
    },
    asset: {} as unknown as Repositories['asset'],
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

  it('returns NOT_FOUND for invalid brandSystemId', async () => {
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
          name: 'Branded Post',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brandSystemId: '00000000-0000-0000-0000-000000000000',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
    expect(json.error!.message).toContain('Brand system not found');
  });

  it('creates project with valid brandSystemId', async () => {
    const repos = createFakeRepositories([], [
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'My Brand',
        description: null,
        tone_of_voice: null,
        visual_direction: null,
        rules: null,
        palette: [],
        typography: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Branded Post',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brandSystemId: '11111111-1111-1111-1111-111111111111',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { brandSystemId: string | null }).brandSystemId).toBe('11111111-1111-1111-1111-111111111111');
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

// ---------------------------------------------------------------------------
// POST /v1/projects/new (W1: Dashboard start endpoint)
// ---------------------------------------------------------------------------

describe('POST /v1/projects/new', () => {
  it('creates project and saves first message', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects/new',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Dashboard Post',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          prompt: 'Create a post about discipline',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as { project: { name: string; type: string }; firstMessage: { content: string; role: string; kind: string } };
    expect(data.project.name).toBe('Dashboard Post');
    expect(data.project.type).toBe('post');
    expect(data.firstMessage.content).toBe('Create a post about discipline');
    expect(data.firstMessage.role).toBe('user');
    expect(data.firstMessage.kind).toBe('text');
  });

  it('requires authentication', async () => {
    const app = buildApp();
    const res = await app.request(
      '/v1/projects/new',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          prompt: 'Hello',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });

  it('returns validation error for missing prompt', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects/new',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Missing Prompt',
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

  it('returns validation error for empty prompt', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects/new',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Empty Prompt',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          prompt: '',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('works with valid brandSystemId', async () => {
    const repos = createFakeRepositories([], [
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'My Brand',
        description: null,
        tone_of_voice: null,
        visual_direction: null,
        rules: null,
        palette: [],
        typography: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/projects/new',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Branded Dashboard Post',
          type: 'carousel',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brandSystemId: '11111111-1111-1111-1111-111111111111',
          prompt: 'Create a 5-card carousel',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as { project: { brandSystemId: string } };
    expect(data.project.brandSystemId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('rejects invalid brandSystemId', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects/new',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Bad Brand',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brandSystemId: '00000000-0000-0000-0000-000000000000',
          prompt: 'Hello',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });

  it('works without brandSystemId (no-brand)', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/projects/new',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'No Brand Post',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          prompt: 'Create something beautiful',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as { project: { brandSystemId: string | null } };
    expect(data.project.brandSystemId).toBeNull();
  });
});
