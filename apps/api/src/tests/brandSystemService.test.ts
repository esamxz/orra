import { describe, it, expect } from 'vitest';
import { BrandSystemService } from '../services/brandSystemService.js';
import { ApiError } from '../errors.js';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import type { BrandSystemRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Fake brand system repository
// ---------------------------------------------------------------------------

function createFakeBrandSystemRepository(initial: BrandSystemRow[] = []): BrandSystemRepository {
  const brands = [...initial];
  let nextId = 1;

  return {
    async create(input) {
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      brands.push(brand);
      return brand;
    },

    async listByWorkspace(input) {
      return brands
        .filter((b) => b.workspace_id === input.workspaceId)
        .slice(0, input.limit);
    },

    async findByIdForWorkspace(input) {
      return brands.find((b) => b.id === input.id && b.workspace_id === input.workspaceId) ?? null;
    },

    async updateForWorkspace(input) {
      const idx = brands.findIndex(
        (b) => b.id === input.id && b.workspace_id === input.workspaceId
      );
      if (idx === -1) return null;
      brands[idx] = { ...brands[idx], ...input.updates };
      return brands[idx];
    },

    async deleteForWorkspace(input) {
      const idx = brands.findIndex(
        (b) => b.id === input.id && b.workspace_id === input.workspaceId
      );
      if (idx !== -1) brands.splice(idx, 1);
    },
  };
}

function fakeAuthContext(workspaceId: string) {
  return {
    env: {} as unknown as import('../env.js').Env,
    requestId: 'req-123',
    auth: {
      isAuthenticated: true,
      clerkUserId: 'usr_test',
      userId: 'user-1',
      workspaceId,
      role: 'owner' as const,
      authSource: 'clerk' as const,
    },
  };
}

describe('BrandSystemService', () => {
  it('createBrandSystem stores in authenticated workspace', async () => {
    const repo = createFakeBrandSystemRepository();
    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-1');

    const brand = await service.createBrandSystem(ctx, {
      name: 'Serene Studio',
    });

    expect(brand.workspaceId).toBe('ws-1');
    expect(brand.name).toBe('Serene Studio');
    expect(brand.tone).toBeNull();
    expect(brand.colors).toEqual({});
    expect(brand.typography).toEqual({});
    expect(brand.logoAssetId).toBeNull();
  });

  it('createBrandSystem stores optional tone, colors, and typography', async () => {
    const repo = createFakeBrandSystemRepository();
    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-1');

    const brand = await service.createBrandSystem(ctx, {
      name: 'Momentum Fitness',
      tone: 'Direct and motivating',
      colors: { primary: '#ff4d4d', secondary: '#1a1a1a' },
      typography: { preset: 'modern-saas', headingFont: 'Space Grotesk' },
    });

    expect(brand.tone).toBe('Direct and motivating');
    expect(brand.colors).toEqual({ primary: '#ff4d4d', secondary: '#1a1a1a' });
    expect(brand.typography).toEqual({ preset: 'modern-saas', headingFont: 'Space Grotesk' });
  });

  it('createBrandSystem requires auth', async () => {
    const repo = createFakeBrandSystemRepository();
    const service = new BrandSystemService(repo);
    const ctx = {
      env: {} as unknown as import('../env.js').Env,
      requestId: 'req-123',
      auth: undefined,
    };

    await expect(
      service.createBrandSystem(ctx, { name: 'Test Brand' })
    ).rejects.toThrow(ApiError);
  });

  it('listBrandSystems only returns brands for the authenticated workspace', async () => {
    const repo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
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
      {
        id: '22222222-2222-2222-2222-222222222222',
        workspace_id: 'ws-2',
        name: 'Brand Two',
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

    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-1');
    const brands = await service.listBrandSystems(ctx, { limit: 10 });

    expect(brands).toHaveLength(1);
    expect(brands[0].workspaceId).toBe('ws-1');
  });

  it('getBrandSystem returns brand in same workspace', async () => {
    const repo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
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

    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-1');
    const brand = await service.getBrandSystem(ctx, '11111111-1111-1111-1111-111111111111');

    expect(brand.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(brand.workspaceId).toBe('ws-1');
  });

  it('getBrandSystem throws NOT_FOUND for brand in another workspace', async () => {
    const repo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
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

    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-2');

    await expect(service.getBrandSystem(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow(ApiError);
    await expect(service.getBrandSystem(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow('Brand system not found');
  });

  it('updateBrandSystem updates brand in same workspace', async () => {
    const repo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
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

    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-1');
    const brand = await service.updateBrandSystem(ctx, '11111111-1111-1111-1111-111111111111', { name: 'New Name' });

    expect(brand.name).toBe('New Name');
  });

  it('updateBrandSystem throws NOT_FOUND for brand in another workspace', async () => {
    const repo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
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

    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-2');

    await expect(service.updateBrandSystem(ctx, '11111111-1111-1111-1111-111111111111', { name: 'New Name' })).rejects.toThrow(ApiError);
  });

  it('deleteBrandSystem removes brand in same workspace', async () => {
    const repo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
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

    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-1');
    await service.deleteBrandSystem(ctx, '11111111-1111-1111-1111-111111111111');

    await expect(service.getBrandSystem(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow(ApiError);
  });

  it('deleteBrandSystem throws NOT_FOUND for brand in another workspace', async () => {
    const repo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
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

    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-2');

    await expect(service.deleteBrandSystem(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow(ApiError);
  });

  it('no tone required', async () => {
    const repo = createFakeBrandSystemRepository();
    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-1');

    const brand = await service.createBrandSystem(ctx, {
      name: 'No Tone Brand',
    });

    expect(brand.tone).toBeNull();
  });

  it('no logo required', async () => {
    const repo = createFakeBrandSystemRepository();
    const service = new BrandSystemService(repo);
    const ctx = fakeAuthContext('ws-1');

    const brand = await service.createBrandSystem(ctx, {
      name: 'No Logo Brand',
    });

    expect(brand.logoAssetId).toBeNull();
  });
});
