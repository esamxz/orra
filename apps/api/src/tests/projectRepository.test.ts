import { describe, it, expect } from 'vitest';
import { SupabaseProjectRepository } from '../repositories/projectRepository.js';
import { createFakeDbClient } from './fakeDbClient.js';

describe('SupabaseProjectRepository', () => {
  it('create maps DB row to shape with correct fields', async () => {
    const fakeDb = createFakeDbClient({ projects: [] });
    const repo = new SupabaseProjectRepository(fakeDb);

    const row = await repo.create({
      workspaceId: 'ws-1',
      name: 'Test Project',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
    });

    expect(row).toBeDefined();
    expect(row.name).toBe('Test Project');
    expect(row.type).toBe('post');
    expect(row.workspace_id).toBe('ws-1');
    expect(row.ratio).toEqual({ name: '4:5', w: 1080, h: 1350 });
  });

  it('create includes brandSystemId when provided', async () => {
    const fakeDb = createFakeDbClient({ projects: [] });
    const repo = new SupabaseProjectRepository(fakeDb);

    const row = await repo.create({
      workspaceId: 'ws-1',
      name: 'Branded Project',
      type: 'carousel',
      ratio: { name: '1:1', w: 1080, h: 1080 },
      brandSystemId: 'brand-123',
    });

    expect(row.brand_system_id).toBe('brand-123');
  });

  it('listByWorkspace scopes to workspaceId', async () => {
    const fakeDb = createFakeDbClient({
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
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
          id: 'proj-2',
          workspace_id: 'ws-2',
          name: 'Project Two',
          type: 'carousel',
          ratio: { name: '1:1', w: 1080, h: 1080 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseProjectRepository(fakeDb);
    const rows = await repo.listByWorkspace({ workspaceId: 'ws-1', limit: 10 });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('11111111-1111-1111-1111-111111111111');
    expect(rows[0].workspace_id).toBe('ws-1');
  });

  it('listByWorkspace respects limit', async () => {
    const fakeDb = createFakeDbClient({
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
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
          id: 'proj-2',
          workspace_id: 'ws-1',
          name: 'B',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseProjectRepository(fakeDb);
    const rows = await repo.listByWorkspace({ workspaceId: 'ws-1', limit: 1 });

    expect(rows).toHaveLength(1);
  });

  it('findByIdForWorkspace returns project in same workspace', async () => {
    const fakeDb = createFakeDbClient({
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          name: 'Project One',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseProjectRepository(fakeDb);
    const row = await repo.findByIdForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-1' });

    expect(row).not.toBeNull();
    expect(row!.id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('findByIdForWorkspace returns null for project in another workspace', async () => {
    const fakeDb = createFakeDbClient({
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          name: 'Project One',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseProjectRepository(fakeDb);
    const row = await repo.findByIdForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-2' });

    expect(row).toBeNull();
  });

  it('updateForWorkspace updates only projects in the same workspace', async () => {
    const fakeDb = createFakeDbClient({
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          name: 'Old Name',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseProjectRepository(fakeDb);
    const row = await repo.updateForWorkspace({
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: 'ws-1',
      updates: { name: 'New Name' },
    });

    expect(row).not.toBeNull();
    expect(row!.name).toBe('New Name');
  });

  it('updateForWorkspace returns null for project in another workspace', async () => {
    const fakeDb = createFakeDbClient({
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          name: 'Old Name',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseProjectRepository(fakeDb);
    const row = await repo.updateForWorkspace({
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: 'ws-2',
      updates: { name: 'New Name' },
    });

    expect(row).toBeNull();
  });

  it('deleteForWorkspace removes project in same workspace', async () => {
    const fakeDb = createFakeDbClient({
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          name: 'Project One',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseProjectRepository(fakeDb);
    await repo.deleteForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-1' });

    const after = await repo.findByIdForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-1' });
    expect(after).toBeNull();
  });

  it('deleteForWorkspace does not remove project in another workspace', async () => {
    const fakeDb = createFakeDbClient({
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          name: 'Project One',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseProjectRepository(fakeDb);
    await repo.deleteForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-2' });

    const after = await repo.findByIdForWorkspace({ id: '11111111-1111-1111-1111-111111111111', workspaceId: 'ws-1' });
    expect(after).not.toBeNull();
  });
});
