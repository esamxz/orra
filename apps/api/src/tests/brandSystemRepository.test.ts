import { describe, it, expect } from 'vitest';
import { SupabaseBrandSystemRepository } from '../repositories/brandSystemRepository.js';
import { createFakeDbClient } from './fakeDbClient.js';

describe('SupabaseBrandSystemRepository', () => {
  it('create maps DB row to shape with correct fields', async () => {
    const fakeDb = createFakeDbClient({ brand_systems: [] });
    const repo = new SupabaseBrandSystemRepository(fakeDb);

    const row = await repo.create({
      workspaceId: 'ws-1',
      name: 'Serene Studio',
      toneOfVoice: 'Calm, reassuring',
      palette: [{ hex: '#1d2a30', role: 'primary' }],
      typography: { preset: 'editorial-calm', headingFont: 'Newsreader' },
    });

    expect(row).toBeDefined();
    expect(row.name).toBe('Serene Studio');
    expect(row.workspace_id).toBe('ws-1');
    expect(row.tone_of_voice).toBe('Calm, reassuring');
  });

  it('create stores optional description and visual direction', async () => {
    const fakeDb = createFakeDbClient({ brand_systems: [] });
    const repo = new SupabaseBrandSystemRepository(fakeDb);

    const row = await repo.create({
      workspaceId: 'ws-1',
      name: 'Momentum Fitness',
      description: 'High energy fitness',
      visualDirection: 'Bold contrasts',
      rules: 'Use red sparingly',
      palette: [],
      typography: {},
    });

    expect(row.description).toBe('High energy fitness');
    expect(row.visual_direction).toBe('Bold contrasts');
    expect(row.rules).toBe('Use red sparingly');
  });

  it('listByWorkspace scopes to workspaceId', async () => {
    const fakeDb = createFakeDbClient({
      brand_systems: [
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
          id: 'brand-2',
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
      ],
    });

    const repo = new SupabaseBrandSystemRepository(fakeDb);
    const rows = await repo.listByWorkspace({ workspaceId: 'ws-1', limit: 10 });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('11111111-1111-1111-1111-111111111111');
    expect(rows[0].workspace_id).toBe('ws-1');
  });

  it('listByWorkspace respects limit', async () => {
    const fakeDb = createFakeDbClient({
      brand_systems: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          name: 'A',
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
          id: 'brand-2',
          workspace_id: 'ws-1',
          name: 'B',
          description: null,
          tone_of_voice: null,
          visual_direction: null,
          rules: null,
          palette: [],
          typography: {},
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseBrandSystemRepository(fakeDb);
    const rows = await repo.listByWorkspace({ workspaceId: 'ws-1', limit: 1 });

    expect(rows).toHaveLength(1);
  });

  it('findByIdForWorkspace returns brand in same workspace', async () => {
    const fakeDb = createFakeDbClient({
      brand_systems: [
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
      ],
    });

    const repo = new SupabaseBrandSystemRepository(fakeDb);
    const row = await repo.findByIdForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-1' });

    expect(row).not.toBeNull();
    expect(row!.id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('findByIdForWorkspace returns null for brand in another workspace', async () => {
    const fakeDb = createFakeDbClient({
      brand_systems: [
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
      ],
    });

    const repo = new SupabaseBrandSystemRepository(fakeDb);
    const row = await repo.findByIdForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-2' });

    expect(row).toBeNull();
  });

  it('updateForWorkspace updates only brands in the same workspace', async () => {
    const fakeDb = createFakeDbClient({
      brand_systems: [
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
      ],
    });

    const repo = new SupabaseBrandSystemRepository(fakeDb);
    const row = await repo.updateForWorkspace({
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: 'ws-1',
      updates: { name: 'New Name' },
    });

    expect(row).not.toBeNull();
    expect(row!.name).toBe('New Name');
  });

  it('updateForWorkspace returns null for brand in another workspace', async () => {
    const fakeDb = createFakeDbClient({
      brand_systems: [
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
      ],
    });

    const repo = new SupabaseBrandSystemRepository(fakeDb);
    const row = await repo.updateForWorkspace({
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: 'ws-2',
      updates: { name: 'New Name' },
    });

    expect(row).toBeNull();
  });

  it('deleteForWorkspace removes brand in same workspace', async () => {
    const fakeDb = createFakeDbClient({
      brand_systems: [
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
      ],
    });

    const repo = new SupabaseBrandSystemRepository(fakeDb);
    await repo.deleteForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-1' });

    const after = await repo.findByIdForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-1' });
    expect(after).toBeNull();
  });

  it('deleteForWorkspace does not remove brand in another workspace', async () => {
    const fakeDb = createFakeDbClient({
      brand_systems: [
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
      ],
    });

    const repo = new SupabaseBrandSystemRepository(fakeDb);
    await repo.deleteForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-2' });

    const after = await repo.findByIdForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-1' });
    expect(after).not.toBeNull();
  });
});
