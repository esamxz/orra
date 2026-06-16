import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import brandRoutes from '../routes/brands.js';
import type { Repositories } from '../repositories/types.js';
import type { BrandSystemRow } from '@orra/db';
import type {
  CreateBrandSystemInput,
  ListBrandSystemsInput,
  FindBrandSystemInput,
  UpdateBrandSystemInput,
  DeleteBrandSystemInput,
} from '../repositories/brandSystemRepository.js';

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

function createFakeRepositories(brands: BrandSystemRow[] = []): Repositories {
  const brandList = [...brands];
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
    project: {} as unknown as Repositories['project'],
    artifact: {} as unknown as Repositories['artifact'],
    chat: {} as unknown as Repositories['chat'],
    generationJob: {} as unknown as Repositories['generationJob'],
    credit: {} as unknown as Repositories['credit'],
    asset: {} as unknown as Repositories['asset'],
    projectMemory: {} as unknown as Repositories['projectMemory'],
    trendTemplate: {} as unknown as Repositories['trendTemplate'],
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
  };
}

function buildApp(repositories?: Repositories) {
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
// POST /v1/brand-systems
// ---------------------------------------------------------------------------

describe('POST /v1/brand-systems', () => {
  it('creates a brand system with valid input', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/brand-systems',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Serene Studio',
          tone: 'Calm and premium',
          colors: { primary: '#1d2a30', secondary: '#5e7680' },
          typography: { preset: 'editorial-calm', headingFont: 'Newsreader' },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { name: string }).name).toBe('Serene Studio');
    expect((json.data as { workspaceId: string }).workspaceId).toBe('ws-fake-1');
    expect((json.data as { tone: string }).tone).toBe('Calm and premium');
    expect((json.data as { colors: Record<string, string> }).colors).toEqual({
      primary: '#1d2a30',
      secondary: '#5e7680',
    });
  });

  it('returns validation error for missing name', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/brand-systems',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tone: 'Calm',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns validation error for invalid hex color', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/brand-systems',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Bad Color',
          colors: { primary: 'not-a-hex' },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/brand-systems
// ---------------------------------------------------------------------------

describe('GET /v1/brand-systems', () => {
  it('lists brand systems for the authenticated workspace', async () => {
    const repos = createFakeRepositories([
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

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/brand-systems',
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
      '/v1/brand-systems',
      { method: 'GET' },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/brand-systems/:id
// ---------------------------------------------------------------------------

describe('GET /v1/brand-systems/:id', () => {
  it('returns brand system in same workspace', async () => {
    const repos = createFakeRepositories([
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

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { id: string }).id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('returns NOT_FOUND for brand in another workspace', async () => {
    const repos = createFakeRepositories([
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

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/brand-systems/:id
// ---------------------------------------------------------------------------

describe('PATCH /v1/brand-systems/:id', () => {
  it('updates brand system in same workspace', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'Old Name',
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
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111',
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

  it('returns NOT_FOUND for brand in another workspace', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-other',
        name: 'Old Name',
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
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111',
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
// DELETE /v1/brand-systems/:id
// ---------------------------------------------------------------------------

describe('DELETE /v1/brand-systems/:id', () => {
  it('deletes brand system in same workspace', async () => {
    const repos = createFakeRepositories([
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

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111',
      { method: 'DELETE', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { deleted: boolean }).deleted).toBe(true);
  });

  it('returns NOT_FOUND for brand in another workspace', async () => {
    const repos = createFakeRepositories([
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

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111',
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
// Response quality
// ---------------------------------------------------------------------------

describe('Brand route response quality', () => {
  it('response has no raw DB internals', async () => {
    const repos = createFakeRepositories([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-fake-1',
        name: 'Brand One',
        description: null,
        tone_of_voice: 'Calm',
        visual_direction: null,
        rules: null,
        palette: [{ hex: '#1d2a30', role: 'primary' }],
        typography: { preset: 'editorial-calm' },
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/brand-systems/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    const text = await res.text();
    expect(text).not.toContain('workspace_id');
    expect(text).not.toContain('tone_of_voice');
    expect(text).not.toContain('visual_direction');
    expect(text).toContain('workspaceId');
    expect(text).toContain('tone');
    expect(text).toContain('visualDirection');
  });
});
