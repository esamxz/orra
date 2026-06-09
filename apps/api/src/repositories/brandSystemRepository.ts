import type { DbClient } from '../db/client.js';
import type { BrandSystemRow } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// Brand system repository
// ---------------------------------------------------------------------------
// Contract for workspace-scoped brand system CRUD.
// Every method scopes by workspace_id so cross-workspace access is impossible.

export interface CreateBrandSystemInput {
  workspaceId: string;
  name: string;
  description?: string;
  toneOfVoice?: string;
  visualDirection?: string;
  rules?: string;
  palette: Array<{ hex: string; role: string }>;
  typography: Record<string, unknown>;
}

export interface ListBrandSystemsInput {
  workspaceId: string;
  limit: number;
  search?: string;
}

export interface FindBrandSystemInput {
  id: string;
  workspaceId: string;
}

export interface UpdateBrandSystemInput {
  id: string;
  workspaceId: string;
  updates: Partial<Pick<
    BrandSystemRow,
    'name' | 'description' | 'tone_of_voice' | 'visual_direction' | 'rules' | 'palette' | 'typography'
  >>;
}

export interface DeleteBrandSystemInput {
  id: string;
  workspaceId: string;
}

export interface BrandSystemRepository {
  create(input: CreateBrandSystemInput): Promise<BrandSystemRow>;
  listByWorkspace(input: ListBrandSystemsInput): Promise<BrandSystemRow[]>;
  findByIdForWorkspace(input: FindBrandSystemInput): Promise<BrandSystemRow | null>;
  updateForWorkspace(input: UpdateBrandSystemInput): Promise<BrandSystemRow | null>;
  deleteForWorkspace(input: DeleteBrandSystemInput): Promise<void>;
}

/**
 * Stub implementation that satisfies the interface but throws
 * "not implemented" for every method. Kept for testability.
 */
export class StubBrandSystemRepository implements BrandSystemRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_db: DbClient) {}

  async create(_input: CreateBrandSystemInput): Promise<BrandSystemRow> {
    throw new Error('BrandSystemRepository.create is not implemented yet.');
  }

  async listByWorkspace(_input: ListBrandSystemsInput): Promise<BrandSystemRow[]> {
    throw new Error('BrandSystemRepository.listByWorkspace is not implemented yet.');
  }

  async findByIdForWorkspace(_input: FindBrandSystemInput): Promise<BrandSystemRow | null> {
    throw new Error('BrandSystemRepository.findByIdForWorkspace is not implemented yet.');
  }

  async updateForWorkspace(_input: UpdateBrandSystemInput): Promise<BrandSystemRow | null> {
    throw new Error('BrandSystemRepository.updateForWorkspace is not implemented yet.');
  }

  async deleteForWorkspace(_input: DeleteBrandSystemInput): Promise<void> {
    throw new Error('BrandSystemRepository.deleteForWorkspace is not implemented yet.');
  }
}

/**
 * Production implementation backed by Supabase.
 * All queries scope by workspace_id; no method can access another workspace's brands.
 */
export class SupabaseBrandSystemRepository implements BrandSystemRepository {
  constructor(private db: DbClient) {}

  async create(input: CreateBrandSystemInput): Promise<BrandSystemRow> {
    const { data, error } = await this.db
      .from('brand_systems')
      .insert({
        workspace_id: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
        tone_of_voice: input.toneOfVoice ?? null,
        visual_direction: input.visualDirection ?? null,
        rules: input.rules ?? null,
        palette: input.palette as unknown as BrandSystemRow['palette'],
        typography: input.typography as unknown as BrandSystemRow['typography'],
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as BrandSystemRow;
  }

  async listByWorkspace(input: ListBrandSystemsInput): Promise<BrandSystemRow[]> {
    let query = this.db
      .from('brand_systems')
      .select('*')
      .eq('workspace_id', input.workspaceId)
      .order('updated_at', { ascending: false })
      .limit(input.limit);

    if (input.search) {
      query = query.ilike('name', `%${input.search}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw mapDbError(error);
    }

    return data ?? [];
  }

  async findByIdForWorkspace(input: FindBrandSystemInput): Promise<BrandSystemRow | null> {
    const { data, error } = await this.db
      .from('brand_systems')
      .select('*')
      .eq('id', input.id)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async updateForWorkspace(input: UpdateBrandSystemInput): Promise<BrandSystemRow | null> {
    const { data, error } = await this.db
      .from('brand_systems')
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

  async deleteForWorkspace(input: DeleteBrandSystemInput): Promise<void> {
    const { error } = await this.db
      .from('brand_systems')
      .delete()
      .eq('id', input.id)
      .eq('workspace_id', input.workspaceId);

    if (error) {
      throw mapDbError(error);
    }
  }
}
