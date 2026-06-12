import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import { getFakeR2ObjectInspector } from '../r2/r2ObjectInspector.js';
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
  FindProjectAssetInput,
  FindBrandAssetInput,
  MarkProjectAssetUploadedInput,
  MarkBrandAssetUploadedInput,
} from '../repositories/assetRepository.js';

const fakeVerifier = createFakeVerifier();

function makeAssetUUID(seq: number): string {
  return `00000000-0000-0000-0000-${seq.toString().padStart(12, '0')}`;
}

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
        role: 'owner' as const,
        isNew: false,
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
          id: makeAssetUUID(nextId++),
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
          status: 'pending_upload',
          created_at: '2026-01-01T00:00:00Z',
        };
        projectAssets.push(asset);
        return asset;
      },
      async createBrandAsset(input: CreateBrandAssetInput) {
        const asset: BrandAssetRow = {
          id: makeAssetUUID(nextId++),
          workspace_id: input.workspaceId,
          brand_system_id: input.brandSystemId,
          kind: input.kind,
          r2_key: input.r2Key,
          content_type: input.contentType,
          width: null,
          height: null,
          size_bytes: input.sizeBytes,
          status: 'pending_upload',
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
      async findProjectAssetForWorkspace(input: FindProjectAssetInput) {
        return (
          projectAssets.find(
            (a) =>
              a.id === input.id &&
              a.project_id === input.projectId &&
              a.workspace_id === input.workspaceId
          ) ?? null
        );
      },
      async findBrandAssetForWorkspace(input: FindBrandAssetInput) {
        return (
          brandAssets.find(
            (a) =>
              a.id === input.id &&
              a.brand_system_id === input.brandSystemId &&
              a.workspace_id === input.workspaceId
          ) ?? null
        );
      },
      async markProjectAssetUploaded(input: MarkProjectAssetUploadedInput) {
        const idx = projectAssets.findIndex(
          (a) =>
            a.id === input.id &&
            a.project_id === input.projectId &&
            a.workspace_id === input.workspaceId
        );
        if (idx === -1) return null;
        projectAssets[idx] = {
          ...projectAssets[idx],
          status: 'uploaded',
          size_bytes: input.sizeBytes ?? projectAssets[idx].size_bytes,
          content_type: input.contentType ?? projectAssets[idx].content_type,
        };
        return projectAssets[idx];
      },
      async markBrandAssetUploaded(input: MarkBrandAssetUploadedInput) {
        const idx = brandAssets.findIndex(
          (a) =>
            a.id === input.id &&
            a.brand_system_id === input.brandSystemId &&
            a.workspace_id === input.workspaceId
        );
        if (idx === -1) return null;
        brandAssets[idx] = {
          ...brandAssets[idx],
          status: 'uploaded',
          size_bytes: input.sizeBytes ?? brandAssets[idx].size_bytes,
          content_type: input.contentType ?? brandAssets[idx].content_type,
        };
        return brandAssets[idx];
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
      asset: { workspaceId: string; projectId: string; kind: string; fileName: string; id: string };
      upload: { method: string; url: string; headers: Record<string, string>; expiresAt: string };
    };

    expect(data.asset.workspaceId).toBe('ws-fake-1');
    expect(data.asset.projectId).toBe('11111111-1111-1111-1111-111111111111');
    expect(data.asset.kind).toBe('upload');
    expect(data.asset.fileName).toBe('hero.png');
    expect('r2Key' in data.asset).toBe(false);
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
      asset: { workspaceId: string; brandSystemId: string; kind: string; fileName: string; id: string };
      upload: { method: string; url: string; headers: Record<string, string>; expiresAt: string };
    };

    expect(data.asset.workspaceId).toBe('ws-fake-1');
    expect(data.asset.brandSystemId).toBe('11111111-1111-1111-1111-111111111111');
    expect(data.asset.kind).toBe('logo');
    expect(data.asset.fileName).toBe('logo.png');
    expect('r2Key' in data.asset).toBe(false);
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

// ---------------------------------------------------------------------------
// POST /v1/projects/:projectId/assets/:assetId/confirm
// ---------------------------------------------------------------------------

describe('POST /v1/projects/:projectId/assets/:assetId/confirm', () => {
  it('confirms a project asset upload', async () => {
    getFakeR2ObjectInspector().clear();

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

    // Step 1: get upload intent
    const intentRes = await app.request(
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

    const intentJson = (await intentRes.json()) as ApiResponse;
    const assetId = (intentJson.data as { asset: { id: string } }).asset.id;

    // Step 2: simulate browser upload — register wildcard since r2Key is server-internal
    getFakeR2ObjectInspector().registerAll({ sizeBytes: 1024, contentType: 'image/png' });

    // Step 3: confirm
    const confirmRes = await app.request(
      `/v1/projects/11111111-1111-1111-1111-111111111111/assets/${assetId}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(confirmRes.status).toBe(200);
    const confirmJson = (await confirmRes.json()) as ApiResponse;
    expect(confirmJson.ok).toBe(true);

    const data = confirmJson.data as { id: string; status: string; sizeBytes: number | null };
    expect(data.status).toBe('uploaded');
    expect(data.id).toBe(assetId);
  });

  it('rejects confirmation when R2 object is missing', async () => {
    getFakeR2ObjectInspector().clear();

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

    const intentRes = await app.request(
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

    const intentJson = (await intentRes.json()) as ApiResponse;
    const assetId = (intentJson.data as { asset: { id: string } }).asset.id;

    // Do NOT register the object

    const confirmRes = await app.request(
      `/v1/projects/11111111-1111-1111-1111-111111111111/assets/${assetId}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(confirmRes.status).toBe(400);
    const confirmJson = (await confirmRes.json()) as ApiResponse;
    expect(confirmJson.ok).toBe(false);
    expect(confirmJson.error!.code).toBe('VALIDATION');
    expect(confirmJson.error!.message).toContain('Upload not found');
  });

  it('rejects confirmation for cross-workspace asset', async () => {
    getFakeR2ObjectInspector().clear();

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

    // Create intent as ws-other (auth middleware maps test_valid to ws-fake-1, so this
    // creates in ws-other by injecting workspace context manually in the fake repos
    // — but actually the fake verifier always returns ws-fake-1. So we create the
    // asset directly in the repo to simulate it belonging to another workspace.)
    const otherAsset = await repos.asset.createProjectAsset({
      workspaceId: 'ws-other',
      projectId: '11111111-1111-1111-1111-111111111111',
      kind: 'upload',
      r2Key: 'workspace/ws-other/projects/11111111-1111-1111-1111-111111111111/assets/hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const confirmRes = await app.request(
      `/v1/projects/11111111-1111-1111-1111-111111111111/assets/${otherAsset.id}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(confirmRes.status).toBe(404);
    const confirmJson = (await confirmRes.json()) as ApiResponse;
    expect(confirmJson.ok).toBe(false);
    expect(confirmJson.error!.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/brand-systems/:brandSystemId/assets/:assetId/confirm
// ---------------------------------------------------------------------------

describe('POST /v1/brand-systems/:brandSystemId/assets/:assetId/confirm', () => {
  it('confirms a brand asset upload', async () => {
    getFakeR2ObjectInspector().clear();

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

    const intentRes = await app.request(
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

    const intentJson = (await intentRes.json()) as ApiResponse;
    const assetId = (intentJson.data as { asset: { id: string } }).asset.id;

    getFakeR2ObjectInspector().registerAll({ sizeBytes: 2048, contentType: 'image/png' });

    const confirmRes = await app.request(
      `/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets/${assetId}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(confirmRes.status).toBe(200);
    const confirmJson = (await confirmRes.json()) as ApiResponse;
    expect(confirmJson.ok).toBe(true);

    const data = confirmJson.data as { id: string; status: string };
    expect(data.status).toBe('uploaded');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/projects/:id/assets
// ---------------------------------------------------------------------------

describe('GET /v1/projects/:id/assets', () => {
  it('lists project assets for the authenticated workspace', async () => {
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

    // Seed two assets directly
    await repos.asset.createProjectAsset({
      workspaceId: 'ws-fake-1',
      projectId: '11111111-1111-1111-1111-111111111111',
      kind: 'upload',
      r2Key: 'workspace/ws-fake-1/projects/11111111-1111-1111-1111-111111111111/assets/a1/hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
    });
    await repos.asset.createProjectAsset({
      workspaceId: 'ws-fake-1',
      projectId: '11111111-1111-1111-1111-111111111111',
      kind: 'reference',
      r2Key: 'workspace/ws-fake-1/projects/11111111-1111-1111-1111-111111111111/assets/a2/ref.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 2048,
    });

    const app = buildProjectApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as Array<{ kind: string; fileName: string; status: string }>;
    expect(data).toHaveLength(2);
    expect(data[0].kind).toBe('upload');
    expect(data[1].kind).toBe('reference');
  });

  it('requires authentication', async () => {
    const app = buildProjectApp();
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets',
      { method: 'GET' },
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
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });

  it('does not include assets from other projects', async () => {
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
      {
        id: '22222222-2222-2222-2222-222222222222',
        workspace_id: 'ws-fake-1',
        name: 'Project Two',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    await repos.asset.createProjectAsset({
      workspaceId: 'ws-fake-1',
      projectId: '11111111-1111-1111-1111-111111111111',
      kind: 'upload',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });
    await repos.asset.createProjectAsset({
      workspaceId: 'ws-fake-1',
      projectId: '22222222-2222-2222-2222-222222222222',
      kind: 'upload',
      r2Key: 'key-2',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const app = buildProjectApp(repos);
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    const json = (await res.json()) as ApiResponse;
    const data = json.data as Array<{ id: string; projectId: string }>;
    expect(data).toHaveLength(1);
    expect(data[0].projectId).toBe('11111111-1111-1111-1111-111111111111');
    expect('r2Key' in data[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/projects/:projectId/assets/:assetId/preview-url
// ---------------------------------------------------------------------------

describe('GET /v1/projects/:projectId/assets/:assetId/preview-url', () => {
  it('returns a preview URL for an uploaded project asset', async () => {
    getFakeR2ObjectInspector().clear();

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

    // Create upload intent
    const intentRes = await app.request(
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

    const intentJson = (await intentRes.json()) as ApiResponse;
    const assetId = (intentJson.data as { asset: { id: string } }).asset.id;

    // Register wildcard in fake R2 and confirm (r2Key is server-internal)
    getFakeR2ObjectInspector().registerAll({ sizeBytes: 1024, contentType: 'image/png' });

    const confirmRes = await app.request(
      `/v1/projects/11111111-1111-1111-1111-111111111111/assets/${assetId}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(confirmRes.status).toBe(200);

    // Request preview URL
    const previewRes = await app.request(
      `/v1/projects/11111111-1111-1111-1111-111111111111/assets/${assetId}/preview-url`,
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(previewRes.status).toBe(200);
    const previewJson = (await previewRes.json()) as ApiResponse;
    expect(previewJson.ok).toBe(true);

    const data = previewJson.data as {
      asset: { id: string; status: string };
      preview: { method: string; url: string; expiresAt: string };
    };
    expect(data.asset.id).toBe(assetId);
    expect(data.asset.status).toBe('uploaded');
    expect(data.preview.method).toBe('GET');
    expect(data.preview.url).toContain('fake-r2.orra.local');
    expect(data.preview.url).toContain('read?');
    expect(data.preview.expiresAt).toBeTruthy();
  });

  it('denies preview URL for pending_upload asset', async () => {
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

    // Seed a pending asset directly
    const asset = await repos.asset.createProjectAsset({
      workspaceId: 'ws-fake-1',
      projectId: '11111111-1111-1111-1111-111111111111',
      kind: 'upload',
      r2Key: 'key-pending',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const app = buildProjectApp(repos);
    const res = await app.request(
      `/v1/projects/11111111-1111-1111-1111-111111111111/assets/${asset.id}/preview-url`,
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
    expect(json.error!.message).toContain('uploaded');
  });

  it('returns NOT_FOUND for cross-workspace asset preview', async () => {
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

    const asset = await repos.asset.createProjectAsset({
      workspaceId: 'ws-other',
      projectId: '11111111-1111-1111-1111-111111111111',
      kind: 'upload',
      r2Key: 'key-other',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    // Mark as uploaded directly via repo
    await repos.asset.markProjectAssetUploaded({
      id: asset.id,
      projectId: '11111111-1111-1111-1111-111111111111',
      workspaceId: 'ws-other',
      sizeBytes: 1024,
      contentType: 'image/png',
    });

    const app = buildProjectApp(repos);
    const res = await app.request(
      `/v1/projects/11111111-1111-1111-1111-111111111111/assets/${asset.id}/preview-url`,
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });

  it('requires authentication', async () => {
    const app = buildProjectApp();
    const res = await app.request(
      '/v1/projects/11111111-1111-1111-1111-111111111111/assets/00000000-0000-0000-0000-000000000001/preview-url',
      { method: 'GET' },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/brand-systems/:id/assets
// ---------------------------------------------------------------------------

describe('GET /v1/brand-systems/:id/assets', () => {
  it('lists brand assets for the authenticated workspace', async () => {
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

    await repos.asset.createBrandAsset({
      workspaceId: 'ws-fake-1',
      brandSystemId: '11111111-1111-1111-1111-111111111111',
      kind: 'logo',
      r2Key: 'key-logo',
      contentType: 'image/png',
      sizeBytes: 2048,
    });

    const app = buildBrandApp(repos);
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as Array<{ kind: string; fileName: string }>;
    expect(data).toHaveLength(1);
    expect(data[0].kind).toBe('logo');
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
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/brand-systems/:brandSystemId/assets/:assetId/preview-url
// ---------------------------------------------------------------------------

describe('GET /v1/brand-systems/:brandSystemId/assets/:assetId/preview-url', () => {
  it('returns a preview URL for an uploaded brand asset', async () => {
    getFakeR2ObjectInspector().clear();

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

    const intentRes = await app.request(
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

    const intentJson = (await intentRes.json()) as ApiResponse;
    const assetId = (intentJson.data as { asset: { id: string } }).asset.id;

    getFakeR2ObjectInspector().registerAll({ sizeBytes: 2048, contentType: 'image/png' });

    await app.request(
      `/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets/${assetId}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    const previewRes = await app.request(
      `/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets/${assetId}/preview-url`,
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(previewRes.status).toBe(200);
    const previewJson = (await previewRes.json()) as ApiResponse;
    expect(previewJson.ok).toBe(true);

    const data = previewJson.data as {
      asset: { id: string; status: string };
      preview: { method: string; url: string };
    };
    expect(data.asset.status).toBe('uploaded');
    expect(data.preview.method).toBe('GET');
    expect(data.preview.url).toContain('fake-r2.orra.local');
  });

  it('denies preview URL for pending_upload brand asset', async () => {
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

    const asset = await repos.asset.createBrandAsset({
      workspaceId: 'ws-fake-1',
      brandSystemId: '11111111-1111-1111-1111-111111111111',
      kind: 'logo',
      r2Key: 'key-pending',
      contentType: 'image/png',
      sizeBytes: 2048,
    });

    const app = buildBrandApp(repos);
    const res = await app.request(
      `/v1/brand-systems/11111111-1111-1111-1111-111111111111/assets/${asset.id}/preview-url`,
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test_valid' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
    expect(json.error!.message).toContain('uploaded');
  });
});
