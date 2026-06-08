import type { DbClient } from '../db/client.js';
import type { UserRow } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// User repository
// ---------------------------------------------------------------------------
// Contract for user lookups and creation from Clerk identities.

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

/**
 * Production implementation backed by Supabase.
 * createFromClerkIdentity uses upsert on clerk_id so concurrent first
 * requests for the same user never create duplicate rows.
 */
export class SupabaseUserRepository implements UserRepository {
  constructor(private db: DbClient) {}

  async findByClerkId(clerkId: string): Promise<UserRow | null> {
    const { data, error } = await this.db
      .from('users')
      .select('*')
      .eq('clerk_id', clerkId)
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async createFromClerkIdentity(input: CreateUserInput): Promise<UserRow> {
    const { data, error } = await this.db
      .from('users')
      .upsert(
        {
          clerk_id: input.clerkId,
          email: input.email,
          display_name: input.displayName,
        },
        { onConflict: 'clerk_id' }
      )
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as UserRow;
  }
}
