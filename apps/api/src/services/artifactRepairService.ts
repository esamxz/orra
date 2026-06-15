import type { ArtifactRepository } from '../repositories/artifactRepository.js';
import type { AssetRepository } from '../repositories/assetRepository.js';
import { requireAuth, type ServiceContext } from './service-context.js';
import { ApiError } from '../errors.js';
import { ArtifactDocumentSchema } from '@orra/shared';
import type { ArtifactDocument, BackgroundLayer } from '@orra/shared';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Artifact repair service — dev-only recovery helper
// ---------------------------------------------------------------------------
// One-time recovery for projects that have generated_background assets but no
// artifact version containing a card/layer that references them. This can
// happen after data incidents or partial generation commits.
//
// Rules:
// - Only runs in development / test environments.
// - Never mutates existing versions; appends a new artifact version.
// - Uses assetId references only; never stores signed URLs in the document.
// - Does not create relational card/layer tables.
// - Returns null when no repair was needed.

export interface RepairArtifactResult {
  artifactId: string;
  previousVersionId: string | null;
  newVersionId: string;
  repairedAssetId: string;
}

export class ArtifactRepairService {
  constructor(
    private artifactRepo: ArtifactRepository,
    private assetRepo: AssetRepository,
  ) {}

  /**
   * Repair a project's current artifact by creating a new version that
   * references the latest generated_background asset as a background layer.
   *
   * Throws if the environment is not development or if the project already
   * has a valid visual document referencing the asset.
   */
  async repairArtifactFromLatestGeneratedAsset(
    ctx: ServiceContext,
    projectId: string,
  ): Promise<RepairArtifactResult | null> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const environment = ctx.env.ENVIRONMENT ?? 'development';
    if (environment !== 'development' && environment !== 'test') {
      throw new ApiError(
        'FORBIDDEN',
        'Artifact repair is only available in development/test environments.',
      );
    }

    // 1. Load the project's artifact and current version.
    const artifact = await this.artifactRepo.getArtifactByProjectIdForWorkspace({
      projectId,
      workspaceId,
    });

    if (!artifact) {
      throw new ApiError('NOT_FOUND', 'No artifact found for this project.');
    }

    if (!artifact.current_version_id) {
      throw new ApiError('NOT_FOUND', 'Artifact has no current version.');
    }

    const current = await this.artifactRepo.getCurrentVersion({
      artifactId: artifact.id,
      workspaceId,
    });

    if (!current) {
      throw new ApiError('NOT_FOUND', 'Current artifact version not found.');
    }

    const documentValidation = ArtifactDocumentSchema.safeParse(current.version.document);
    if (!documentValidation.success) {
      throw new ApiError(
        'VALIDATION',
        'Current artifact version does not contain a valid ArtifactDocument.',
      );
    }
    const currentDocument = documentValidation.data;

    // 2. Find generated_background assets for this project.
    const assets = await this.assetRepo.listProjectAssets({ projectId, workspaceId });
    const generatedAssets = assets
      .filter((a) => a.kind === 'generated_background')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (generatedAssets.length === 0) {
      // No generated assets to repair from.
      return null;
    }

    const latestAsset = generatedAssets[0];

    // 3. If the current document already references this asset, no repair needed.
    const alreadyReferenced = currentDocument.cards.some((card) =>
      card.layers.some(
        (layer) =>
          (layer.type === 'background' || layer.type === 'image') &&
          (layer as { assetId?: string }).assetId === latestAsset.id,
      ),
    );

    if (alreadyReferenced) {
      return null;
    }

    // 4. Build a repaired document: append a background layer referencing the asset.
    const repairedCards = currentDocument.cards.map((card, index) => {
      const bgLayer: BackgroundLayer = {
        id: randomUUID(),
        type: 'background',
        z: -1,
        x: 0,
        y: 0,
        w: currentDocument.ratio.w,
        h: currentDocument.ratio.h,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        assetId: latestAsset.id,
        fit: 'cover',
      };

      const shiftedLayers = card.layers.map((l) => ({ ...l, z: l.z + 1 }));

      return {
        ...card,
        index,
        layers: [bgLayer, ...shiftedLayers],
      };
    });

    if (repairedCards.length === 0) {
      // Edge case: current document has no cards. Create a single-card repair.
      repairedCards.push({
        id: randomUUID(),
        index: 0,
        baseColor: '#1d2a30',
        layers: [
          {
            id: randomUUID(),
            type: 'background',
            z: -1,
            x: 0,
            y: 0,
            w: currentDocument.ratio.w,
            h: currentDocument.ratio.h,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            assetId: latestAsset.id,
            fit: 'cover',
          } as BackgroundLayer,
        ],
      });
    }

    const repairedDocument: ArtifactDocument = {
      ...currentDocument,
      cards: repairedCards,
      version: currentDocument.version + 1,
    };

    const parsed = ArtifactDocumentSchema.safeParse(repairedDocument);
    if (!parsed.success) {
      throw new ApiError(
        'VALIDATION',
        'Repaired artifact document failed schema validation.',
      );
    }

    // 5. Commit as a new version atomically.
    // Uses existing enum values: the DB does not have a 'repair' reason, so
    // we mark it as a manual edit performed by the system AI path.
    const nextVersionNumber = current.version.version + 1;
    const committedVersion = await this.artifactRepo.commitVersion({
      workspaceId,
      artifactId: artifact.id,
      expectedCurrentVersionId: current.version.id,
      version: nextVersionNumber,
      document: parsed.data,
      reason: 'manual_edit',
      createdBy: 'ai',
    });

    if (!committedVersion) {
      throw new ApiError('VERSION_CONFLICT', 'Repair commit conflict: the artifact changed during repair.');
    }

    return {
      artifactId: artifact.id,
      previousVersionId: current.version.id,
      newVersionId: committedVersion.id,
      repairedAssetId: latestAsset.id,
    };
  }
}
