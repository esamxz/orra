import { describe, it, expect } from 'vitest';
import { SupabaseWorkspaceRepository } from '../repositories/workspaceRepository.js';
import { createFakeDbClient } from './fakeDbClient.js';

describe('SupabaseWorkspaceRepository', () => {
  it('findPersonalWorkspaceForUser returns workspace when found', async () => {
    const fakeDb = createFakeDbClient({
      workspaces: [
        {
          id: 'ws-1',
          name: "Alice's Workspace",
          type: 'personal',
          owner_user_id: 'user-1',
          plan: 'free',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseWorkspaceRepository(fakeDb);
    const ws = await repo.findPersonalWorkspaceForUser('user-1');

    expect(ws).not.toBeNull();
    expect(ws!.id).toBe('ws-1');
    expect(ws!.type).toBe('personal');
  });

  it('findPersonalWorkspaceForUser returns null when not found', async () => {
    const fakeDb = createFakeDbClient({ workspaces: [] });
    const repo = new SupabaseWorkspaceRepository(fakeDb);

    const ws = await repo.findPersonalWorkspaceForUser('user-missing');
    expect(ws).toBeNull();
  });

  it('does not return a team workspace as personal', async () => {
    const fakeDb = createFakeDbClient({
      workspaces: [
        {
          id: 'ws-team',
          name: 'Team Workspace',
          type: 'team',
          owner_user_id: 'user-1',
          plan: 'pro',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseWorkspaceRepository(fakeDb);
    const ws = await repo.findPersonalWorkspaceForUser('user-1');
    expect(ws).toBeNull();
  });

  it('createPersonalWorkspace inserts a workspace row', async () => {
    const fakeDb = createFakeDbClient({ workspaces: [] });
    const repo = new SupabaseWorkspaceRepository(fakeDb);

    const ws = await repo.createPersonalWorkspace({
      name: "Bob's Workspace",
      type: 'personal',
      ownerUserId: 'user-2',
      plan: 'free',
    });

    expect(ws).toBeDefined();
    expect(ws.name).toBe("Bob's Workspace");
    expect(ws.type).toBe('personal');
    expect(ws.owner_user_id).toBe('user-2');
  });

  it('ensurePersonalWorkspaceForUser returns existing workspace', async () => {
    const fakeDb = createFakeDbClient({
      workspaces: [
        {
          id: 'ws-1',
          name: "Alice's Workspace",
          type: 'personal',
          owner_user_id: 'user-1',
          plan: 'free',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      workspace_members: [
        {
          id: 'wm-1',
          workspace_id: 'ws-1',
          user_id: 'user-1',
          role: 'owner',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseWorkspaceRepository(fakeDb);
    const result = await repo.ensurePersonalWorkspaceForUser({
      userId: 'user-1',
      name: "Alice's Workspace",
    });

    expect(result.workspaceId).toBe('ws-1');
    expect(result.role).toBe('owner');
    expect(result.isNew).toBe(false);
  });

  it('ensurePersonalWorkspaceForUser creates workspace and membership when missing', async () => {
    const fakeDb = createFakeDbClient({
      workspaces: [],
      workspace_members: [],
    });

    const repo = new SupabaseWorkspaceRepository(fakeDb);
    const result = await repo.ensurePersonalWorkspaceForUser({
      userId: 'user-new',
      name: "New User's Workspace",
    });

    expect(result.workspaceId).toBeTruthy();
    expect(result.role).toBe('owner');
    expect(result.isNew).toBe(true);

    // Verify the workspace was inserted
    const ws = await repo.findPersonalWorkspaceForUser('user-new');
    expect(ws).not.toBeNull();
    expect(ws!.type).toBe('personal');
    expect(ws!.plan).toBe('free');
    expect(ws!.owner_user_id).toBe('user-new');
  });

  it('ensurePersonalWorkspaceForUser recovers from race by re-querying', async () => {
    const fakeDb = createFakeDbClient({
      workspaces: [
        {
          id: 'ws-raced',
          name: "Raced Workspace",
          type: 'personal',
          owner_user_id: 'user-race',
          plan: 'free',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      workspace_members: [],
    });

    const repo = new SupabaseWorkspaceRepository(fakeDb);
    // Since the workspace already exists, ensure should find it and return it.
    const result = await repo.ensurePersonalWorkspaceForUser({
      userId: 'user-race',
      name: "Raced Workspace",
    });

    expect(result.workspaceId).toBe('ws-raced');
    expect(result.role).toBe('owner');
    expect(result.isNew).toBe(false);
  });
});
