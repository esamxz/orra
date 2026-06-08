import type { DbClient } from '../db/client.js';
import type { GenerationJobRow, Json } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// Generation job repository
// ---------------------------------------------------------------------------
// Workspace-scoped generation job CRUD.
// Every method scopes by workspace_id so cross-workspace access is impossible.

export interface CreateStubJobInput {
  workspaceId: string;
  projectId: string;
  kind: GenerationJobRow['kind'];
  status: GenerationJobRow['status'];
  idempotencyKey?: string | null;
  reservedCredits?: number;
  capturedCredits?: number;
  plan?: Json;
}

export interface FindJobInput {
  id: string;
  workspaceId: string;
}

export interface ListJobsByProjectInput {
  workspaceId: string;
  projectId: string;
  limit?: number;
}

export interface GenerationJobRepository {
  createStubJob(input: CreateStubJobInput): Promise<GenerationJobRow>;
  findByIdForWorkspace(input: FindJobInput): Promise<GenerationJobRow | null>;
  listByProject(input: ListJobsByProjectInput): Promise<GenerationJobRow[]>;
}

/**
 * Stub implementation that satisfies the interface but throws
 * "not implemented" for every method. Kept for testability.
 */
export class StubGenerationJobRepository implements GenerationJobRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createStubJob(_input: CreateStubJobInput): Promise<GenerationJobRow> {
    throw new Error('GenerationJobRepository.createStubJob is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findByIdForWorkspace(_input: FindJobInput): Promise<GenerationJobRow | null> {
    throw new Error('GenerationJobRepository.findByIdForWorkspace is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async listByProject(_input: ListJobsByProjectInput): Promise<GenerationJobRow[]> {
    throw new Error('GenerationJobRepository.listByProject is not implemented yet.');
  }
}

/**
 * Production implementation backed by Supabase.
 * All queries scope by workspace_id; no method can access another workspace's jobs.
 */
export class SupabaseGenerationJobRepository implements GenerationJobRepository {
  constructor(private db: DbClient) {}

  async createStubJob(input: CreateStubJobInput): Promise<GenerationJobRow> {
    const { data, error } = await this.db
      .from('generation_jobs')
      .insert({
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        kind: input.kind,
        status: input.status,
        idempotency_key: input.idempotencyKey ?? null,
        reserved_credits: input.reservedCredits ?? 0,
        captured_credits: input.capturedCredits ?? 0,
        plan: input.plan ?? null,
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as GenerationJobRow;
  }

  async findByIdForWorkspace(input: FindJobInput): Promise<GenerationJobRow | null> {
    const { data, error } = await this.db
      .from('generation_jobs')
      .select('*')
      .eq('id', input.id)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async listByProject(input: ListJobsByProjectInput): Promise<GenerationJobRow[]> {
    const limit = input.limit ?? 50;
    const { data, error } = await this.db
      .from('generation_jobs')
      .select('*')
      .eq('project_id', input.projectId)
      .eq('workspace_id', input.workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw mapDbError(error);
    }

    return data ?? [];
  }
}
