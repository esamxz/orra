import type { DbClient } from '../db/client.js';
import type { ProjectAssetRow, BrandAssetRow, ProjectAssetKind, BrandAssetKind } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// Asset repository
// ---------------------------------------------------------------------------
// Contract for workspace-scoped asset metadata CRUD.
// Every method scopes by workspace_id so cross-workspace access is impossible.

export interface CreateProjectAssetInput {
  workspaceId: string;
  projectId: string;
  kind: ProjectAssetKind;
  r2Key: string;
  contentType: string | null;
  sizeBytes: number | null;
}

export interface CreateBrandAssetInput {
  workspaceId: string;
  brandSystemId: string;
  kind: BrandAssetKind;
  r2Key: string;
  contentType: string | null;
  sizeBytes: number | null;
}

export interface ListProjectAssetsInput {
  projectId: string;
  workspaceId: string;
}

export interface ListBrandAssetsInput {
  brandSystemId: string;
  workspaceId: string;
}

export interface AssetRepository {
  createProjectAsset(input: CreateProjectAssetInput): Promise<ProjectAssetRow>;
  createBrandAsset(input: CreateBrandAssetInput): Promise<BrandAssetRow>;
  listProjectAssets(input: ListProjectAssetsInput): Promise<ProjectAssetRow[]>;
  listBrandAssets(input: ListBrandAssetsInput): Promise<BrandAssetRow[]>;
}

/**
 * Stub implementation that satisfies the interface but throws
 * "not implemented" for every method. Kept for testability.
 */
export class StubAssetRepository implements AssetRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_db: DbClient) {}

  async createProjectAsset(_input: CreateProjectAssetInput): Promise<ProjectAssetRow> {
    throw new Error('AssetRepository.createProjectAsset is not implemented yet.');
  }

  async createBrandAsset(_input: CreateBrandAssetInput): Promise<BrandAssetRow> {
    throw new Error('AssetRepository.createBrandAsset is not implemented yet.');
  }

  async listProjectAssets(_input: ListProjectAssetsInput): Promise<ProjectAssetRow[]> {
    throw new Error('AssetRepository.listProjectAssets is not implemented yet.');
  }

  async listBrandAssets(_input: ListBrandAssetsInput): Promise<BrandAssetRow[]> {
    throw new Error('AssetRepository.listBrandAssets is not implemented yet.');
  }
}

/**
 * Production implementation backed by Supabase.
 * All queries scope by workspace_id; no method can access another workspace's assets.
 */
export class SupabaseAssetRepository implements AssetRepository {
  constructor(private db: DbClient) {}

  async createProjectAsset(input: CreateProjectAssetInput): Promise<ProjectAssetRow> {
    const { data, error } = await this.db
      .from('project_assets')
      .insert({
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        kind: input.kind,
        r2_key: input.r2Key,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as ProjectAssetRow;
  }

  async createBrandAsset(input: CreateBrandAssetInput): Promise<BrandAssetRow> {
    const { data, error } = await this.db
      .from('brand_assets')
      .insert({
        workspace_id: input.workspaceId,
        brand_system_id: input.brandSystemId,
        kind: input.kind,
        r2_key: input.r2Key,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as BrandAssetRow;
  }

  async listProjectAssets(input: ListProjectAssetsInput): Promise<ProjectAssetRow[]> {
    const { data, error } = await this.db
      .from('project_assets')
      .select('*')
      .eq('project_id', input.projectId)
      .eq('workspace_id', input.workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      throw mapDbError(error);
    }

    return data ?? [];
  }

  async listBrandAssets(input: ListBrandAssetsInput): Promise<BrandAssetRow[]> {
    const { data, error } = await this.db
      .from('brand_assets')
      .select('*')
      .eq('brand_system_id', input.brandSystemId)
      .eq('workspace_id', input.workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      throw mapDbError(error);
    }

    return data ?? [];
  }
}
