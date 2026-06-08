import type { DbClient } from '../db/client.js';
import type { UserRow } from '@orra/db';

// ---------------------------------------------------------------------------
// User repository
// ---------------------------------------------------------------------------
// Contract for user lookups and creation from Clerk identities.
// Full implementation is deferred to the user/workspace bootstrap phase.

export interface CreateUserInput {
  clerkId: string;
  email: string | null;
  displayName: string | null;
}

export interface UserRepository {
  findByClerkId(clerkId: string): Promise<UserRow | null>;
  createFromClerkIdentity(input: CreateUserInput): Promise<UserRow>;
}

/**
 * Stub implementation that satisfies the interface but throws
 * "not implemented" for every method. Used in Phase 7C to prove the
 * wiring; real queries come in the workspace bootstrap phase.
 */
export class StubUserRepository implements UserRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_db: DbClient) {}

  async findByClerkId(_clerkId: string): Promise<UserRow | null> {
    throw new Error('UserRepository.findByClerkId is not implemented yet.');
  }

  async createFromClerkIdentity(_input: CreateUserInput): Promise<UserRow> {
    throw new Error('UserRepository.createFromClerkIdentity is not implemented yet.');
  }
}
