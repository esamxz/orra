import { describe, it, expect } from 'vitest';
import { SupabaseProjectMemoryRepository } from '../repositories/projectMemoryRepository.js';
import { createFakeDbClient } from './fakeDbClient.js';

const BASE_ROW = {
  id: 'mem-1',
  workspace_id: 'ws-1',
  project_id: 'proj-1',
  summary: '',
  topic: null,
  audience: null,
  tone: null,
  platform: null,
  format: null,
  carousel_goal: null,
  slide_count: null,
  visual_direction: null,
  approved_direction: null,
  rejected_ideas: [],
  user_preferences: [],
  constraints: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('SupabaseProjectMemoryRepository', () => {
  // ---------------------------------------------------------------------------
  // getByProjectIdForWorkspace
  // ---------------------------------------------------------------------------

  it('getByProjectIdForWorkspace returns the row when it exists', async () => {
    const fakeDb = createFakeDbClient({ project_context_memories: [{ ...BASE_ROW }] });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.getByProjectIdForWorkspace({ workspaceId: 'ws-1', projectId: 'proj-1' });

    expect(row).not.toBeNull();
    expect(row!.project_id).toBe('proj-1');
    expect(row!.workspace_id).toBe('ws-1');
  });

  it('getByProjectIdForWorkspace returns null when project is in another workspace', async () => {
    const fakeDb = createFakeDbClient({ project_context_memories: [{ ...BASE_ROW }] });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.getByProjectIdForWorkspace({ workspaceId: 'ws-2', projectId: 'proj-1' });

    expect(row).toBeNull();
  });

  it('getByProjectIdForWorkspace returns null when no row exists', async () => {
    const fakeDb = createFakeDbClient({ project_context_memories: [] });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.getByProjectIdForWorkspace({ workspaceId: 'ws-1', projectId: 'proj-1' });

    expect(row).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // upsertForProject
  // ---------------------------------------------------------------------------

  it('upsertForProject creates a new row when none exists', async () => {
    const fakeDb = createFakeDbClient({ project_context_memories: [] });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.upsertForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      topic: 'self improvement',
      platform: 'LinkedIn',
      slideCount: 5,
    });

    expect(row).toBeDefined();
    expect(row.workspace_id).toBe('ws-1');
    expect(row.project_id).toBe('proj-1');
    expect(row.topic).toBe('self improvement');
    expect(row.platform).toBe('LinkedIn');
    expect(row.slide_count).toBe(5);
  });

  it('upsertForProject updates an existing row (ON CONFLICT project_id)', async () => {
    const fakeDb = createFakeDbClient({
      project_context_memories: [{ ...BASE_ROW, topic: 'old topic' }],
    });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.upsertForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      topic: 'new topic',
    });

    expect(row.topic).toBe('new topic');
  });

  it('upsertForProject sets updated_at', async () => {
    const fakeDb = createFakeDbClient({ project_context_memories: [] });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const before = new Date('2020-01-01').getTime();
    const row = await repo.upsertForProject({ workspaceId: 'ws-1', projectId: 'proj-1' });

    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(before);
  });

  it('upsertForProject stores array fields', async () => {
    const fakeDb = createFakeDbClient({ project_context_memories: [] });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.upsertForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      rejectedIdeas: ['too corporate', 'stock photos'],
      constraints: ['no red'],
    });

    expect(row.rejected_ideas).toEqual(['too corporate', 'stock photos']);
    expect(row.constraints).toEqual(['no red']);
  });

  // ---------------------------------------------------------------------------
  // patchForProject
  // ---------------------------------------------------------------------------

  it('patchForProject merges only provided fields into existing row', async () => {
    const fakeDb = createFakeDbClient({
      project_context_memories: [{ ...BASE_ROW, topic: 'fitness', tone: 'bold' }],
    });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.patchForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      platform: 'Instagram',
    });

    expect(row).not.toBeNull();
    expect(row!.topic).toBe('fitness');   // preserved
    expect(row!.tone).toBe('bold');       // preserved
    expect(row!.platform).toBe('Instagram'); // new value
  });

  it('patchForProject returns null when no row exists', async () => {
    const fakeDb = createFakeDbClient({ project_context_memories: [] });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.patchForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      platform: 'LinkedIn',
    });

    expect(row).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // ensureForProject
  // ---------------------------------------------------------------------------

  it('ensureForProject returns existing row when present', async () => {
    const fakeDb = createFakeDbClient({
      project_context_memories: [{ ...BASE_ROW, topic: 'existing' }],
    });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.ensureForProject({ workspaceId: 'ws-1', projectId: 'proj-1' });

    expect(row.topic).toBe('existing');
  });

  it('ensureForProject creates a default row when none exists', async () => {
    const fakeDb = createFakeDbClient({ project_context_memories: [] });
    const repo = new SupabaseProjectMemoryRepository(fakeDb);

    const row = await repo.ensureForProject({ workspaceId: 'ws-1', projectId: 'proj-1' });

    expect(row).toBeDefined();
    expect(row.workspace_id).toBe('ws-1');
    expect(row.project_id).toBe('proj-1');
    // Fake DB doesn't set unspecified columns to null; production DB would.
    // Both null and undefined mean "not set".
    expect(row.topic == null).toBe(true);
  });
});
