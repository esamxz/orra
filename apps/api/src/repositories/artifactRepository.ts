import type { DbClient } from '../db/client.js';
import type { ArtifactRow, ArtifactVersionRow } from '@orra/db';
import { mapDbError, expectSingleRow } from '../db/errors.js';
import type { Json } from '@orra/db';

// ---------------------------------------------------------------------------
// Artifact repository
// ---------------------------------------------------------------------------
// Workspace-scoped CRUD for artifacts and artifact versions.
// One artifact per project (enforced by unique(project_id)).
//
// Circular FK resolution:
//   1. Insert artifact row (current_version_id = null)
//   2. Insert version row
//   3. Update artifact.current_version_id

export interface CreateArtifactInput {
  workspaceId: string;
  projectId: string;
}

export interface CreateVersionInput {
  workspaceId: string;
  artifactId: string;
  version: number;
  document: Json;
  reason: ArtifactVersionRow['reason'];
  createdBy: ArtifactVersionRow['created_by'];
}

export interface SetCurrentVersionInput {
  workspaceId: string;
  artifactId: string;
  versionId: string;
}

export interface GetArtifactByIdInput {
  id: string;
  workspaceId: string;
}

export interface GetArtifactByProjectIdInput {
  projectId: string;
  workspaceId: string;
}

export interface GetCurrentVersionInput {
  artifactId: string;
  workspaceId: string;
}

export interface ArtifactWithVersion {
  artifact: ArtifactRow;
  version: ArtifactVersionRow;
}

export interface ArtifactRepository {
  createArtifactForProject(input: CreateArtifactInput): Promise<ArtifactRow>;
  createVersion(input: CreateVersionInput): Promise<ArtifactVersionRow>;
  setCurrentVersion(input: SetCurrentVersionInput): Promise<ArtifactRow>;
  getArtifactByIdForWorkspace(input: GetArtifactByIdInput): Promise<ArtifactRow | null>;
  getArtifactByProjectIdForWorkspace(input: GetArtifactByProjectIdInput): Promise<ArtifactRow | null>;
  getCurrentVersion(input: GetCurrentVersionInput): Promise<ArtifactWithVersion | null>;
}

/**
 * Stub implementation for testability.
 */
export class StubArtifactRepository implements ArtifactRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createArtifactForProject(_input: CreateArtifactInput): Promise<ArtifactRow> {
    throw new Error('ArtifactRepository.createArtifactForProject is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createVersion(_input: CreateVersionInput): Promise<ArtifactVersionRow> {
    throw new Error('ArtifactRepository.createVersion is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setCurrentVersion(_input: SetCurrentVersionInput): Promise<ArtifactRow> {
    throw new Error('ArtifactRepository.setCurrentVersion is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getArtifactByIdForWorkspace(_input: GetArtifactByIdInput): Promise<ArtifactRow | null> {
    throw new Error('ArtifactRepository.getArtifactByIdForWorkspace is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getArtifactByProjectIdForWorkspace(_input: GetArtifactByProjectIdInput): Promise<ArtifactRow | null> {
    throw new Error('ArtifactRepository.getArtifactByProjectIdForWorkspace is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getCurrentVersion(_input: GetCurrentVersionInput): Promise<ArtifactWithVersion | null> {
    throw new Error('ArtifactRepository.getCurrentVersion is not implemented yet.');
  }
}

/**
 * Production implementation backed by Supabase.
 */
export class SupabaseArtifactRepository implements ArtifactRepository {
  constructor(private db: DbClient) {}

  async createArtifactForProject(input: CreateArtifactInput): Promise<ArtifactRow> {
    const { data, error } = await this.db
      .from('artifacts')
      .insert({
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        current_version_id: null,
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return expectSingleRow(data, error);
  }

  async createVersion(input: CreateVersionInput): Promise<ArtifactVersionRow> {
    const { data, error } = await this.db
      .from('artifact_versions')
      .insert({
        workspace_id: input.workspaceId,
        artifact_id: input.artifactId,
        version: input.version,
        document: input.document,
        reason: input.reason,
        created_by: input.createdBy,
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return expectSingleRow(data, error);
  }

  async setCurrentVersion(input: SetCurrentVersionInput): Promise<ArtifactRow> {
    const { data, error } = await this.db
      .from('artifacts')
      .update({ current_version_id: input.versionId })
      .eq('id', input.artifactId)
      .eq('workspace_id', input.workspaceId)
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return expectSingleRow(data, error);
  }

  async getArtifactByIdForWorkspace(input: GetArtifactByIdInput): Promise<ArtifactRow | null> {
    const { data, error } = await this.db
      .from('artifacts')
      .select('*')
      .eq('id', input.id)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async getArtifactByProjectIdForWorkspace(
    input: GetArtifactByProjectIdInput
  ): Promise<ArtifactRow | null> {
    const { data, error } = await this.db
      .from('artifacts')
      .select('*')
      .eq('project_id', input.projectId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async getCurrentVersion(input: GetCurrentVersionInput): Promise<ArtifactWithVersion | null> {
    const { data: artifactData, error: artifactError } = await this.db
      .from('artifacts')
      .select('*')
      .eq('id', input.artifactId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (artifactError) {
      throw mapDbError(artifactError);
    }

    if (!artifactData) {
      return null;
    }

    const artifact = artifactData as ArtifactRow;

    if (!artifact.current_version_id) {
      return null;
    }

    const { data: versionData, error: versionError } = await this.db
      .from('artifact_versions')
      .select('*')
      .eq('id', artifact.current_version_id)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (versionError) {
      throw mapDbError(versionError);
    }

    if (!versionData) {
      return null;
    }

    return {
      artifact,
      version: versionData as ArtifactVersionRow,
    };
  }
}
