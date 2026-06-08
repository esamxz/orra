import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { ArtifactRepository } from '../repositories/artifactRepository.js';
import type { ArtifactDocument, Ratio } from '@orra/shared';
import { ArtifactDocumentSchema } from '@orra/shared';
import type { ArtifactRow } from '@orra/db';
import { buildInitialArtifactDocument } from '../artifact-document/factory.js';

// ---------------------------------------------------------------------------
// Artifact service
// ---------------------------------------------------------------------------
// Business logic for artifact reads and initial creation.
// All methods enforce workspace scoping via the repository layer.

export interface ArtifactResponse {
  artifactId: string;
  projectId: string;
  currentVersionId: string;
  version: number;
  document: ArtifactDocument;
  createdAt: string;
  updatedAt: string;
}

function mapArtifactWithVersion(
  artifact: ArtifactRow,
  version: { id: string; version: number; document: unknown; created_at: string }
): ArtifactResponse {
  return {
    artifactId: artifact.id,
    projectId: artifact.project_id,
    currentVersionId: version.id,
    version: version.version,
    document: version.document as ArtifactDocument,
    createdAt: artifact.created_at,
    updatedAt: artifact.updated_at,
  };
}

/**
 * Validate a document JSON blob against the shared ArtifactDocument schema.
 * Throws ApiError VALIDATION if the shape is unexpected.
 */
function validateDocument(document: unknown): ArtifactDocument {
  const result = ArtifactDocumentSchema.safeParse(document);
  if (!result.success) {
    throw new ApiError('INTERNAL', 'Stored artifact document failed schema validation.', {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

export class ArtifactService {
  constructor(private artifactRepo: ArtifactRepository) {}

  /**
   * Create the initial artifact and version for a newly created project.
   * Returns the artifact row. Does NOT require auth because this is called
   * internally from ProjectService within an already-authenticated context.
   */
  async createInitialArtifactForProject(
    workspaceId: string,
    projectId: string,
    projectType: 'post' | 'carousel' | 'from_assets',
    ratio: { name: string; w: number; h: number }
  ): Promise<ArtifactRow> {
    // 1. Create the artifact row with no current version yet.
    const artifact = await this.artifactRepo.createArtifactForProject({
      workspaceId,
      projectId,
    });

    // 2. Build and validate the initial document snapshot.
    const document = buildInitialArtifactDocument({
      artifactId: artifact.id,
      projectType,
      ratio: ratio as Ratio,
    });

    // 3. Create the first version row.
    const version = await this.artifactRepo.createVersion({
      workspaceId,
      artifactId: artifact.id,
      version: 1,
      document,
      reason: 'manual_checkpoint',
      createdBy: 'user',
    });

    // 4. Link artifact -> current_version_id.
    await this.artifactRepo.setCurrentVersion({
      workspaceId,
      artifactId: artifact.id,
      versionId: version.id,
    });

    return { ...artifact, current_version_id: version.id };
  }

  /**
   * Get the current artifact with its document.
   * Requires auth. Scopes by workspaceId.
   */
  async getCurrentArtifact(
    ctx: ServiceContext,
    artifactId: string
  ): Promise<ArtifactResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const result = await this.artifactRepo.getCurrentVersion({
      artifactId,
      workspaceId,
    });

    if (!result) {
      throw new ApiError('NOT_FOUND', 'Artifact not found.');
    }

    const document = validateDocument(result.version.document);

    return mapArtifactWithVersion(result.artifact, {
      id: result.version.id,
      version: result.version.version,
      document,
      created_at: result.version.created_at,
    });
  }

  /**
   * Get the artifact for a given project.
   * Returns the current artifact with document.
   */
  async getProjectArtifact(
    ctx: ServiceContext,
    projectId: string
  ): Promise<ArtifactResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const artifact = await this.artifactRepo.getArtifactByProjectIdForWorkspace({
      projectId,
      workspaceId,
    });

    if (!artifact) {
      throw new ApiError('NOT_FOUND', 'Artifact not found.');
    }

    return this.getCurrentArtifact(ctx, artifact.id);
  }
}
