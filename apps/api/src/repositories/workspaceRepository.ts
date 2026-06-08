import type { DbClient } from '../db/client.js';
import type { WorkspaceRow } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// Workspace repository
// ---------------------------------------------------------------------------
// Contract for workspace lookups and creation.

export interface CreateWorkspaceInput {
  name: string;
  type: 'personal' | 'team';
  ownerUserId: string | null;
  plan: 'free' | 'creator' | 'pro' | 'studio';
}

export interface EnsureWorkspaceInput {
  userId: string;
  name: string;
}

export interface EnsureWorkspaceResult {
  workspaceId: string;
  role: 'owner' | 'admin' | 'member';
}

export interface WorkspaceRepository {
  findPersonalWorkspaceForUser(userId: string): Promise<WorkspaceRow | null>;
  createPersonalWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRow>;
  ensurePersonalWorkspaceForUser(input: EnsureWorkspaceInput): Promise<EnsureWorkspaceResult>;
}

/**
 * Stub implementation that satisfies the interface but throws
 * "not implemented" for every method. Used in Phase 7C to prove the
 * wiring; real queries come in the workspace bootstrap phase.
 */
export class StubWorkspaceRepository implements WorkspaceRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_db: DbClient) {}

  async findPersonalWorkspaceForUser(_userId: string): Promise<WorkspaceRow | null> {
    throw new Error('WorkspaceRepository.findPersonalWorkspaceForUser is not implemented yet.');
  }

  async createPersonalWorkspace(_input: CreateWorkspaceInput): Promise<WorkspaceRow> {
    throw new Error('WorkspaceRepository.createPersonalWorkspace is not implemented yet.');
  }

  async ensurePersonalWorkspaceForUser(_input: EnsureWorkspaceInput): Promise<EnsureWorkspaceResult> {
    throw new Error('WorkspaceRepository.ensurePersonalWorkspaceForUser is not implemented yet.');
  }
}

/**
 * Production implementation backed by Supabase.
 * ensurePersonalWorkspaceForUser queries first, then inserts workspace +
 * membership, and recovers from unique violations by re-querying.
 */
export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  constructor(private db: DbClient) {}

  async findPersonalWorkspaceForUser(userId: string): Promise<WorkspaceRow | null> {
    const { data, error } = await this.db
      .from('workspaces')
      .select('*')
      .eq('owner_user_id', userId)
      .eq('type', 'personal')
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async createPersonalWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRow> {
    const { data, error } = await this.db
      .from('workspaces')
      .insert({
        name: input.name,
        type: input.type,
        owner_user_id: input.ownerUserId,
        plan: input.plan,
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as WorkspaceRow;
  }

  async ensurePersonalWorkspaceForUser(input: EnsureWorkspaceInput): Promise<EnsureWorkspaceResult> {
    // Fast path: already exists.
    const existing = await this.findPersonalWorkspaceForUser(input.userId);
    if (existing) {
      return { workspaceId: existing.id, role: 'owner' };
    }

    // Create workspace + membership.
    try {
      const workspace = await this.createPersonalWorkspace({
        name: input.name,
        type: 'personal',
        ownerUserId: input.userId,
        plan: 'free',
      });

      // Create the owner membership. If this fails the workspace may be
      // orphaned; the next bootstrap attempt will find the workspace and
      // create the missing membership.
      const { error: memberError } = await this.db
        .from('workspace_members')
        .insert({
          workspace_id: workspace.id,
          user_id: input.userId,
          role: 'owner',
        });

      if (memberError) {
        throw mapDbError(memberError);
      }

      return { workspaceId: workspace.id, role: 'owner' };
    } catch (err) {
      // If another request raced and created the workspace, recover by
      // re-querying rather than surfacing a CONFLICT to the caller.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'CONFLICT'
      ) {
        const raced = await this.findPersonalWorkspaceForUser(input.userId);
        if (raced) {
          return { workspaceId: raced.id, role: 'owner' };
        }
      }
      throw err;
    }
  }
}
