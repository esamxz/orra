import type { DbClient } from '../db/client.js';
import type { ProjectRow } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// Project repository
// ---------------------------------------------------------------------------
// Contract for workspace-scoped project CRUD.
// Every method scopes by workspace_id so cross-workspace access is impossible.

export interface CreateProjectInput {
  workspaceId: string;
  name: string;
  type: 'post' | 'carousel' | 'from_assets';
  ratio: { name: string; w: number; h: number };
  brandSystemId?: string;
}

export interface ListProjectsInput {
  workspaceId: string;
  tab?: 'recent' | 'all';
  limit: number;
}

export interface FindProjectInput {
  id: string;
  workspaceId: string;
}

export interface UpdateProjectInput {
  id: string;
  workspaceId: string;
  updates: Partial<Pick<ProjectRow, 'name' | 'type' | 'ratio' | 'brand_system_id'>>;
}

export interface DeleteProjectInput {
  id: string;
  workspaceId: string;
}

export interface ProjectRepository {
  create(input: CreateProjectInput): Promise<ProjectRow>;
  listByWorkspace(input: ListProjectsInput): Promise<ProjectRow[]>;
  findByIdForWorkspace(input: FindProjectInput): Promise<ProjectRow | null>;
  updateForWorkspace(input: UpdateProjectInput): Promise<ProjectRow | null>;
  deleteForWorkspace(input: DeleteProjectInput): Promise<void>;
}

/**
 * Stub implementation that satisfies the interface but throws
 * "not implemented" for every method. Kept for testability.
 */
export class StubProjectRepository implements ProjectRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_db: DbClient) {}

  async create(_input: CreateProjectInput): Promise<ProjectRow> {
    throw new Error('ProjectRepository.create is not implemented yet.');
  }

  async listByWorkspace(_input: ListProjectsInput): Promise<ProjectRow[]> {
    throw new Error('ProjectRepository.listByWorkspace is not implemented yet.');
  }

  async findByIdForWorkspace(_input: FindProjectInput): Promise<ProjectRow | null> {
    throw new Error('ProjectRepository.findByIdForWorkspace is not implemented yet.');
  }

  async updateForWorkspace(_input: UpdateProjectInput): Promise<ProjectRow | null> {
    throw new Error('ProjectRepository.updateForWorkspace is not implemented yet.');
  }

  async deleteForWorkspace(_input: DeleteProjectInput): Promise<void> {
    throw new Error('ProjectRepository.deleteForWorkspace is not implemented yet.');
  }
}

/**
 * Production implementation backed by Supabase.
 * All queries scope by workspace_id; no method can access another workspace's projects.
 */
export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private db: DbClient) {}

  async create(input: CreateProjectInput): Promise<ProjectRow> {
    const { data, error } = await this.db
      .from('projects')
      .insert({
        workspace_id: input.workspaceId,
        name: input.name,
        type: input.type,
        ratio: input.ratio,
        brand_system_id: input.brandSystemId ?? null,
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as ProjectRow;
  }

  async listByWorkspace(input: ListProjectsInput): Promise<ProjectRow[]> {
    let query = this.db
      .from('projects')
      .select('*')
      .eq('workspace_id', input.workspaceId)
      .limit(input.limit);

    if (input.tab === 'recent') {
      query = query.order('updated_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      throw mapDbError(error);
    }

    return data ?? [];
  }

  async findByIdForWorkspace(input: FindProjectInput): Promise<ProjectRow | null> {
    const { data, error } = await this.db
      .from('projects')
      .select('*')
      .eq('id', input.id)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async updateForWorkspace(input: UpdateProjectInput): Promise<ProjectRow | null> {
    const { data, error } = await this.db
      .from('projects')
      .update(input.updates)
      .eq('id', input.id)
      .eq('workspace_id', input.workspaceId)
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async deleteForWorkspace(input: DeleteProjectInput): Promise<void> {
    const { error } = await this.db
      .from('projects')
      .delete()
      .eq('id', input.id)
      .eq('workspace_id', input.workspaceId);

    if (error) {
      throw mapDbError(error);
    }
  }
}
