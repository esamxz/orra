import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import projectRoutes from '../routes/projects.js';
import brandRoutes from '../routes/brands.js';
import type { Repositories } from '../repositories/types.js';
import type { ProjectRow, BrandSystemRow, ProjectAssetRow, BrandAssetRow } from '@orra/db';
import type {
  CreateProjectInput,
  ListProjectsInput,
  FindProjectInput,
  UpdateProjectInput,
  DeleteProjectInput,
} from '../repositories/projectRepository.js';
import type {
  CreateBrandSystemInput,
  ListBrandSystemsInput,
  FindBrandSystemInput,
  UpdateBrandSystemInput,
  DeleteBrandSystemInput,
} from '../repositories/brandSystemRepository.js';
import type {
  CreateProjectAssetInput,
  CreateBrandAssetInput,
  ListProjectAssetsInput,
  ListBrandAssetsInput,
} from '../repositories/assetRepository.js';

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
  const projectAssets: ProjectAssetRow[] = [];
  const brandAssets: BrandAssetRow[] = [];
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
    artifact: {} as unknown as Repositories['artifact'],
    chat: {} as unknown as Repositories['chat'],
    generationJob: {} as unknown as Repositories['generationJob'],
    credit: {} as unknown as Repositories['credit'],
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
    asset: {
      async createProjectAsset(input: CreateProjectAssetInput) {
        const asset: ProjectAssetRow = {
          id: `pa-${nextId++}`,
          workspace_id: input.workspaceId,
          project_id: input.projectId,
          kind: input.kind,
          r2_key: input.r2Key,
          content_hash: null,
          content_type: input.contentType,
          width: null,
          height: null,
          size_bytes: input.sizeBytes,
          source_prompt: null,
          analysis: null,
          created_at: '2026-01-01T00:00:00Z',
        };
        projectAssets.push(asset);
        return asset;
      },
      async createBrandAsset(input: CreateBrandAssetInput) {
        const asset: BrandAssetRow = {
          id: `ba-${nextId++}`,
          workspace_id: input.workspaceId,
          brand_system_id: input.brandSystemId,
          kind: input.kind,
          r2_key: input.r2Key,
          content_type: input.contentType,
          width: null,
          height: null,
          size_bytes: input.sizeBytes,
          created_at: '2026-01-01T00:00:00Z',
        };
        brandAssets.push(asset);
        return asset;
      },
      async listProjectAssets(input: ListProjectAssetsInput) {
        return projectAssets.filter(
          (a) => a.project_id === input.projectId && a.workspace_id === input.workspaceId
        );
      },
      async listBrandAssets(input: ListBrandAssetsInput) {
        return brandAssets.filter(
          (a) => a.brand_system_id === input.brandSystemId && a.workspace_id === input.workspaceId
        );
      },
    },
  } as unknown as Repositories;
}

function buildProjectApp(repositories?: Repositories) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(
    createAuthMiddleware(fakeVerifier, repositories ? { repositories } : undefined)
  );
  app.route('/v1/projects', projectRoutes);
  app.onError(errorHandler);
  return app;
}

function buildBrandApp(repositories?: Repositories) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(
    createAuthMiddleware(fakeVerifier, repositories ? { repositories } : undefined)
  );
  app.route('/v1/brand-systems', brandRoutes);
  app.onError(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// POST /v1/projects/:id/assets/upload-intent
// ---------------------------------------------------------------------------

describe('POST /v1/projects/:id/assets/upload-intent', () => {
  it('returns upload intent for a project asset', async () => {
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

    const app = buildProjectApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'hero.png',
          contentType: 'image/png',
          sizeBytes: 1024,
          kind: 'upload',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);

    const data = json.data as {
      asset: { workspaceId: string; projectId: string; kind: string; r2Key: string; fileName: string };
      upload: { method: string; url: string; headers: Record<string, string>; expiresAt: string };
    };

    expect(data.asset.workspaceId).toBe('ws-fake-1');
    expect(data.asset.projectId).toBe('11111111-1111-1111-1111-111111111111');
    expect(data.asset.kind).toBe('upload');
    expect(data.asset.fileName).toBe('hero.png');
    expect(data.asset.r2Key).toContain('workspace/ws-fake-1/projects/11111111-1111-1111-1111-111111111111/assets/');
    expect(data.asset.r2Key).toContain('hero.png');
    expect(data.upload.method).toBe('PUT');
    expect(data.upload.url).toContain('fake-r2.orra.local');
    expect(data.upload.headers['Content-Type']).toBe('image/png');
    expect(data.upload.expiresAt).toBeTruthy();
  });

  it('requires authentication', async () => {
    const app = buildProjectApp();
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'hero.png',
          contentType: 'image/png',
          sizeBytes: 1024,
          kind: 'upload',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
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

    const app = buildProjectApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'hero.png',
          contentType: 'image/png',
          sizeBytes: 1024,
          kind: 'upload',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });

  it('returns VALIDATION for unsupported content type', async () => {
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

    const app = buildProjectApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'hero.svg',
          contentType: 'image/svg+xml',
          sizeBytes: 1024,
          kind: 'upload',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns VALIDATION for oversized file', async () => {
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

    const app = buildProjectApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'hero.png',
          contentType: 'image/png',
          sizeBytes: 20 * 1024 * 1024, // 20 MB > 10 MB limit
          kind: 'upload',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns VALIDATION for invalid project kind', async () => {
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

    const app = buildProjectApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'hero.png',
          contentType: 'image/png',
          sizeBytes: 1024,
          kind: 'logo',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns VALIDATION for path traversal filename', async () => {
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

    const app = buildProjectApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: '../../../etc/passwd',
          contentType: 'image/png',
          sizeBytes: 1024,
          kind: 'upload',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('response does not expose internal R2 secrets', async () => {
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

    const app = buildProjectApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'hero.png',
          contentType: 'image/png',
          sizeBytes: 1024,
          kind: 'upload',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    const text = await res.text();
    expect(text).not.toContain('secret');
    expect(text).not.toContain('AWS4');
    expect(text).not.toContain('r2.cloudflarestorage');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/brand-systems/:id/assets/upload-intent
// ---------------------------------------------------------------------------

describe('POST /v1/brand-systems/:id/assets/upload-intent', () => {
  it('returns upload intent for a brand asset', async () => {
    const repos = createFakeRepositories([], [
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'Brand One',
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

    const app = buildBrandApp(repos);
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'logo.png',
          contentType: 'image/png',
          sizeBytes: 2048,
          kind: 'logo',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);

    const data = json.data as {
      asset: { workspaceId: string; brandSystemId: string; kind: string; r2Key: string; fileName: string };
      upload: { method: string; url: string; headers: Record<string, string>; expiresAt: string };
    };

    expect(data.asset.workspaceId).toBe('ws-fake-1');
    expect(data.asset.brandSystemId).toBe('11111111-1111-1111-1111-111111111111');
    expect(data.asset.kind).toBe('logo');
    expect(data.asset.fileName).toBe('logo.png');
    expect(data.asset.r2Key).toContain('workspace/ws-fake-1/brands/11111111-1111-1111-1111-111111111111/assets/');
    expect(data.upload.method).toBe('PUT');
  });

  it('requires authentication', async () => {
    const app = buildBrandApp();
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'logo.png',
          contentType: 'image/png',
          sizeBytes: 2048,
          kind: 'logo',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });

  it('returns NOT_FOUND for brand in another workspace', async () => {
    const repos = createFakeRepositories([], [
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-other',
        name: 'Brand One',
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

    const app = buildBrandApp(repos);
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'logo.png',
          contentType: 'image/png',
          sizeBytes: 2048,
          kind: 'logo',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });

  it('returns VALIDATION for invalid brand kind', async () => {
    const repos = createFakeRepositories([], [
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'Brand One',
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

    const app = buildBrandApp(repos);
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets/upload-intent',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'logo.png',
          contentType: 'image/png',
          sizeBytes: 2048,
          kind: 'upload',
        }),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });
});
