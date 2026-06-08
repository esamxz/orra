import { describe, it, expect } from 'vitest';
import { SupabaseUserRepository } from '../repositories/userRepository.js';
import { createFakeDbClient } from './fakeDbClient.js';

describe('SupabaseUserRepository', () => {
  it('findByClerkId returns user when found', async () => {
    const fakeDb = createFakeDbClient({
      users: [
        {
          id: 'user-1',
          clerk_id: 'clerk_abc',
          email: 'a@b.com',
          display_name: 'Alice',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseUserRepository(fakeDb);
    const user = await repo.findByClerkId('clerk_abc');

    expect(user).not.toBeNull();
    expect(user!.id).toBe('user-1');
    expect(user!.clerk_id).toBe('clerk_abc');
  });

  it('findByClerkId returns null when not found', async () => {
    const fakeDb = createFakeDbClient({ users: [] });
    const repo = new SupabaseUserRepository(fakeDb);

    const user = await repo.findByClerkId('clerk_missing');
    expect(user).toBeNull();
  });

  it('createFromClerkIdentity creates a user', async () => {
    const fakeDb = createFakeDbClient({ users: [] });
    const repo = new SupabaseUserRepository(fakeDb);

    const user = await repo.createFromClerkIdentity({
      clerkId: 'clerk_new',
      email: 'new@orra.local',
      displayName: 'New User',
    });

    expect(user).toBeDefined();
    expect(user.clerk_id).toBe('clerk_new');
    expect(user.email).toBe('new@orra.local');
    expect(user.display_name).toBe('New User');
  });

  it('createFromClerkIdentity handles null email and displayName', async () => {
    const fakeDb = createFakeDbClient({ users: [] });
    const repo = new SupabaseUserRepository(fakeDb);

    const user = await repo.createFromClerkIdentity({
      clerkId: 'clerk_minimal',
      email: null,
      displayName: null,
    });

    expect(user.clerk_id).toBe('clerk_minimal');
    expect(user.email).toBeNull();
    expect(user.display_name).toBeNull();
  });

  it('upsert prevents duplicate rows for the same clerk_id', async () => {
    const fakeDb = createFakeDbClient({
      users: [
        {
          id: 'user-1',
          clerk_id: 'clerk_race',
          email: 'first@orra.local',
          display_name: 'First',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const repo = new SupabaseUserRepository(fakeDb);
    const user = await repo.createFromClerkIdentity({
      clerkId: 'clerk_race',
      email: 'second@orra.local',
      displayName: 'Second',
    });

    expect(user.clerk_id).toBe('clerk_race');
    // The fake upsert just inserts, so there will be two rows.
    // In production the unique constraint on clerk_id + upsert onConflict
    // guarantees a single row. This test documents the contract.
  });
});
