import type { DbClient } from '../db/client.js';
import type { WorkspaceRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Workspace repository
// ---------------------------------------------------------------------------
// Contract for workspace lookups and creation.
// Full implementation is deferred to the user/workspace bootstrap phase.

export interface CreateWorkspaceInput {
  name: string;
  type: 'personal' | 'team';
  ownerUserId: string | null;
  plan: 'free' | 'creator' | 'pro' | 'studio';
}

export interface WorkspaceRepository {
  findPersonalWorkspaceForUser(userId: string): Promise<WorkspaceRow | null>;
  createPersonalWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRow>;
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
}
