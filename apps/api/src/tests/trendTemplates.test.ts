import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import trendTemplateRoutes from '../routes/trendTemplates.js';
import type { Repositories } from '../repositories/types.js';
import type { TrendTemplateRow } from '@orra/db';
import { FakeTrendTemplateRepository } from '../repositories/trendTemplateRepository.js';

const fakeVerifier = createFakeVerifier();

interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; requestId: string };
}

function makeTrendTemplateRow(overrides: Partial<TrendTemplateRow> = {}): TrendTemplateRow {
  return {
    id: 'tmpl-uuid-0001',
    title: 'Test Template',
    description: 'A test template',
    prompt: 'Create something calm and minimal.',
    category: 'Wellness',
    project_type: 'carousel',
    ratio_hint: '4:5',
    platform_hint: 'Instagram',
    asset_hints: [],
    preview_variant: 'cover',
    is_featured: true,
    tags: ['calm', 'minimal'],
    sort_index: 1,
    active: true,
    reference_r2_key: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createFakeRepositories(templates: TrendTemplateRow[] = []): Repositories {
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
    brandSystem: {} as unknown as Repositories['brandSystem'],
    trendTemplate: new FakeTrendTemplateRepository(templates),
  };
}

function buildApp(repositories?: Repositories) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(
    createAuthMiddleware(fakeVerifier, repositories ? { repositories } : undefined)
  );
  app.route('/v1/trend-templates', trendTemplateRoutes);
  app.onError(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/trend-templates
// ---------------------------------------------------------------------------

describe('GET /v1/trend-templates', () => {
  it('returns 401 without auth', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/trend-templates',
      { method: 'GET' },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe('UNAUTHENTICATED');
  });

  it('returns empty array when no active templates exist', async () => {
    const app = buildApp(createFakeRepositories([]));
    const res = await app.request(
      '/v1/trend-templates',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<unknown[]>;
    expect(json.ok).toBe(true);
    expect(json.data).toEqual([]);
  });

  it('returns only active templates', async () => {
    const templates = [
      makeTrendTemplateRow({ id: 'tmpl-1', title: 'Active', active: true, sort_index: 1 }),
      makeTrendTemplateRow({ id: 'tmpl-2', title: 'Inactive', active: false, sort_index: 2 }),
    ];
    const app = buildApp(createFakeRepositories(templates));
    const res = await app.request(
      '/v1/trend-templates',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<Array<{ title: string }>>;
    expect(json.data).toHaveLength(1);
    expect(json.data[0].title).toBe('Active');
  });

  it('returns templates ordered by sort_index ascending', async () => {
    const templates = [
      makeTrendTemplateRow({ id: 'tmpl-c', title: 'Third', sort_index: 3 }),
      makeTrendTemplateRow({ id: 'tmpl-a', title: 'First', sort_index: 1 }),
      makeTrendTemplateRow({ id: 'tmpl-b', title: 'Second', sort_index: 2 }),
    ];
    const app = buildApp(createFakeRepositories(templates));
    const res = await app.request(
      '/v1/trend-templates',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<Array<{ title: string }>>;
    expect(json.data.map((t) => t.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('returns camelCase DTO fields', async () => {
    const templates = [makeTrendTemplateRow()];
    const app = buildApp(createFakeRepositories(templates));
    const res = await app.request(
      '/v1/trend-templates',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<Array<Record<string, unknown>>>;
    const dto = json.data[0];
    expect(dto.id).toBe('tmpl-uuid-0001');
    expect(dto.title).toBe('Test Template');
    expect(dto.projectType).toBe('carousel');
    expect(dto.ratioHint).toBe('4:5');
    expect(dto.platformHint).toBe('Instagram');
    expect(dto.assetHints).toEqual([]);
    expect(dto.previewVariant).toBe('cover');
    expect(dto.isFeatured).toBe(true);
    expect(dto.sortIndex).toBe(1);
    // Confirm snake_case fields are NOT present
    expect('project_type' in dto).toBe(false);
    expect('ratio_hint' in dto).toBe(false);
    expect('is_featured' in dto).toBe(false);
  });

  it('returns multiple templates with correct shape', async () => {
    const templates = [
      makeTrendTemplateRow({ id: 'tmpl-1', title: 'First', sort_index: 1 }),
      makeTrendTemplateRow({ id: 'tmpl-2', title: 'Second', sort_index: 2, is_featured: false }),
    ];
    const app = buildApp(createFakeRepositories(templates));
    const res = await app.request(
      '/v1/trend-templates',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<Array<{ id: string; isFeatured: boolean }>>;
    expect(json.data).toHaveLength(2);
    expect(json.data[0].isFeatured).toBe(true);
    expect(json.data[1].isFeatured).toBe(false);
  });
});
