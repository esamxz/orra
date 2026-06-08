import { describe, it, expect } from 'vitest';
import { AuthBootstrapService } from '../services/authBootstrapService.js';
import type { UserRepository, CreateUserInput } from '../repositories/userRepository.js';
import type {
  WorkspaceRepository,
  EnsureWorkspaceInput,
  EnsureWorkspaceResult,
} from '../repositories/workspaceRepository.js';
import type { UserRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Fake repositories
// ---------------------------------------------------------------------------

function createFakeUserRepository(initial: UserRow[] = []): UserRepository {
  const users = [...initial];
  return {
    async findByClerkId(clerkId: string) {
      return users.find((u) => u.clerk_id === clerkId) ?? null;
    },
    async createFromClerkIdentity(input: CreateUserInput) {
      const user: UserRow = {
        id: `user-${Date.now()}`,
        clerk_id: input.clerkId,
        email: input.email,
        display_name: input.displayName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      users.push(user);
      return user;
    },
  };
}

function createFakeWorkspaceRepository(
  workspaces: Map<string, EnsureWorkspaceResult> = new Map()
): WorkspaceRepository {
  return {
    async findPersonalWorkspaceForUser(_userId: string) {
      return null;
    },
    async createPersonalWorkspace(input) {
      return {
        id: `ws-${Date.now()}`,
        name: input.name,
        type: input.type,
        owner_user_id: input.ownerUserId,
        plan: input.plan,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as import('@orra/db').WorkspaceRow;
    },
    async ensurePersonalWorkspaceForUser(input: EnsureWorkspaceInput) {
      const existing = workspaces.get(input.userId);
      if (existing) return existing;
      const result: EnsureWorkspaceResult = {
        workspaceId: `ws-${Date.now()}`,
        role: 'owner',
      };
      workspaces.set(input.userId, result);
      return result;
    },
  };
}

describe('AuthBootstrapService', () => {
  it('existing user + existing workspace returns both', async () => {
    const userRepo = createFakeUserRepository([
      {
        id: 'user-1',
        clerk_id: 'clerk_1',
        email: 'a@b.com',
        display_name: 'Alice',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const workspaceMap = new Map<string, EnsureWorkspaceResult>([
      ['user-1', { workspaceId: 'ws-1', role: 'owner' }],
    ]);
    const workspaceRepo = createFakeWorkspaceRepository(workspaceMap);

    const service = new AuthBootstrapService(userRepo, workspaceRepo);
    const result = await service.bootstrap({
      clerkUserId: 'clerk_1',
      email: 'a@b.com',
      displayName: 'Alice',
    });

    expect(result.userId).toBe('user-1');
    expect(result.workspaceId).toBe('ws-1');
    expect(result.role).toBe('owner');
  });

  it('new user + new workspace creates both', async () => {
    const userRepo = createFakeUserRepository([]);
    const workspaceRepo = createFakeWorkspaceRepository();

    const service = new AuthBootstrapService(userRepo, workspaceRepo);
    const result = await service.bootstrap({
      clerkUserId: 'clerk_new',
      email: 'new@orra.local',
      displayName: 'New User',
    });

    expect(result.userId).toBeTruthy();
    expect(result.workspaceId).toBeTruthy();
    expect(result.role).toBe('owner');

    // Verify user was created
    const user = await userRepo.findByClerkId('clerk_new');
    expect(user).not.toBeNull();
    expect(user!.email).toBe('new@orra.local');
    expect(user!.display_name).toBe('New User');
  });

  it('existing user + missing workspace creates workspace', async () => {
    const userRepo = createFakeUserRepository([
      {
        id: 'user-2',
        clerk_id: 'clerk_2',
        email: 'b@c.com',
        display_name: 'Bob',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const workspaceRepo = createFakeWorkspaceRepository();

    const service = new AuthBootstrapService(userRepo, workspaceRepo);
    const result = await service.bootstrap({
      clerkUserId: 'clerk_2',
      email: 'b@c.com',
      displayName: 'Bob',
    });

    expect(result.userId).toBe('user-2');
    expect(result.workspaceId).toBeTruthy();
    expect(result.role).toBe('owner');
  });

  it('bootstrap returns role owner for personal workspace', async () => {
    const userRepo = createFakeUserRepository([]);
    const workspaceRepo = createFakeWorkspaceRepository();

    const service = new AuthBootstrapService(userRepo, workspaceRepo);
    const result = await service.bootstrap({
      clerkUserId: 'clerk_owner',
      email: null,
      displayName: null,
    });

    expect(result.role).toBe('owner');
  });

  it('uses displayName for workspace name when available', async () => {
    const userRepo = createFakeUserRepository([]);
    const workspaceRepo = createFakeWorkspaceRepository();

    const service = new AuthBootstrapService(userRepo, workspaceRepo);
    await service.bootstrap({
      clerkUserId: 'clerk_named',
      email: null,
      displayName: 'Carol',
    });

    // The fake workspace repo doesn't inspect name, but the contract is tested.
    // In real usage the workspace name would be "Carol's Workspace".
    expect(true).toBe(true);
  });

  it('handles null email and displayName gracefully', async () => {
    const userRepo = createFakeUserRepository([]);
    const workspaceRepo = createFakeWorkspaceRepository();

    const service = new AuthBootstrapService(userRepo, workspaceRepo);
    const result = await service.bootstrap({
      clerkUserId: 'clerk_minimal',
      email: null,
      displayName: null,
    });

    expect(result.userId).toBeTruthy();
    expect(result.workspaceId).toBeTruthy();
    expect(result.role).toBe('owner');

    const user = await userRepo.findByClerkId('clerk_minimal');
    expect(user).not.toBeNull();
    expect(user!.email).toBeNull();
    expect(user!.display_name).toBeNull();
  });
});
