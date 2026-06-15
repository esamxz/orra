import { describe, it, expect } from 'vitest';
import { ArtifactRepairService } from '../services/artifactRepairService.js';
import type { ArtifactRepository, ArtifactWithVersion } from '../repositories/artifactRepository.js';
import type { AssetRepository } from '../repositories/assetRepository.js';
import type { ArtifactRow, ArtifactVersionRow, ProjectAssetRow } from '@orra/db';
import type { ArtifactDocument } from '@orra/shared';
import type { ServiceContext } from '../services/service-context.js';

function makeContext(environment: 'development' | 'test' | 'staging' = 'development'): ServiceContext {
  return {
    env: { ENVIRONMENT: environment } as unknown as ServiceContext['env'],
    requestId: 'req-1',
    auth: {
      isAuthenticated: true,
      workspaceId: 'ws-1',
      userId: 'user-1',
      email: 'test@example.com',
    },
  } as unknown as ServiceContext;
}

function makeDocument(type: 'post' | 'carousel' = 'post'): ArtifactDocument {
  return {
    schemaVersion: 1,
    artifactId: '11111111-1111-1111-1111-111111111111',
    type,
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        index: 0,
        baseColor: '#1d2a30',
        layers: [],
      },
    ],
    version: 1,
  };
}

function createFakeArtifactRepo(
  artifact: ArtifactRow,
  version: ArtifactVersionRow,
): ArtifactRepository & {
  committed: ArtifactVersionRow[];
  currentVersionId: string;
} {
  const versions: ArtifactVersionRow[] = [version];
  let nextVersionId = 2;
  let currentVersionId = version.id;

  return {
    committed: [],
    currentVersionId,
    async createArtifactForProject() {
      throw new Error('not used');
    },
    async createVersion() {
      throw new Error('not used');
    },
    async setCurrentVersion() {
      throw new Error('not used');
    },
    async setCurrentVersionGuarded() {
      throw new Error('not used');
    },
    async commitVersion(input) {
      const row: ArtifactVersionRow = {
        id: `version-${nextVersionId++}`,
        workspace_id: input.workspaceId,
        artifact_id: input.artifactId,
        version: input.version,
        document: input.document as ArtifactVersionRow['document'],
        reason: input.reason,
        created_by: input.createdBy,
        brand_context_snapshot: null,
        created_at: new Date().toISOString(),
      };
      versions.push(row);
      this.committed.push(row);
      currentVersionId = row.id;
      this.currentVersionId = row.id;
      return row;
    },
    async getArtifactByIdForWorkspace() {
      throw new Error('not used');
    },
    async getArtifactByProjectIdForWorkspace(input) {
      if (input.projectId === artifact.project_id && input.workspaceId === artifact.workspace_id) {
        return { ...artifact, current_version_id: currentVersionId };
      }
      return null;
    },
    async getCurrentVersion(input) {
      if (input.artifactId !== artifact.id || input.workspaceId !== artifact.workspace_id) {
        return null;
      }
      const ver = versions.find((v) => v.id === currentVersionId);
      if (!ver) return null;
      return { artifact: { ...artifact, current_version_id: currentVersionId }, version: ver } as ArtifactWithVersion;
    },
  };
}

function createFakeAssetRepo(assets: ProjectAssetRow[]): AssetRepository {
  return {
    async createProjectAsset() {
      throw new Error('not used');
    },
    async createBrandAsset() {
      throw new Error('not used');
    },
    async listProjectAssets() {
      return assets;
    },
    async listBrandAssets() {
      throw new Error('not used');
    },
    async findProjectAssetForWorkspace() {
      throw new Error('not used');
    },
    async findBrandAssetForWorkspace() {
      throw new Error('not used');
    },
    async markProjectAssetUploaded() {
      throw new Error('not used');
    },
    async markBrandAssetUploaded() {
      throw new Error('not used');
    },
  };
}

function makeAsset(id?: string, kind: ProjectAssetRow['kind'] = 'generated_background'): ProjectAssetRow {
  const assetId = id ?? 'aaaaaaaa-0000-0000-0000-000000000001';
  return {
    id: assetId,
    workspace_id: 'ws-1',
    project_id: 'proj-1',
    kind,
    r2_key: `ws/ws-1/projects/proj-1/assets/${assetId}/generated-bg-0.png`,
    content_hash: null,
    content_type: 'image/png',
    width: null,
    height: null,
    size_bytes: 1024,
    source_prompt: null,
    analysis: null,
    status: 'uploaded',
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('ArtifactRepairService', () => {
  it('throws in non-development environments', async () => {
    const artifact: ArtifactRow = {
      id: '11111111-1111-1111-1111-111111111111',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      current_version_id: 'ver-1',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    const version: ArtifactVersionRow = {
      id: 'ver-1',
      workspace_id: 'ws-1',
      artifact_id: '11111111-1111-1111-1111-111111111111',
      version: 1,
      document: makeDocument() as unknown as ArtifactVersionRow['document'],
      reason: 'manual_checkpoint',
      created_by: 'user',
      brand_context_snapshot: null,
      created_at: '2026-01-01',
    };

    const service = new ArtifactRepairService(
      createFakeArtifactRepo(artifact, version),
      createFakeAssetRepo([makeAsset('aaaaaaaa-0000-0000-0000-000000000001')]),
    );

    await expect(service.repairArtifactFromLatestGeneratedAsset(makeContext('staging'), 'proj-1')).rejects.toThrow(
      /only available in development\/test/,
    );
  });

  it('returns null when no generated_background assets exist', async () => {
    const artifact: ArtifactRow = {
      id: '11111111-1111-1111-1111-111111111111',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      current_version_id: 'ver-1',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    const version: ArtifactVersionRow = {
      id: 'ver-1',
      workspace_id: 'ws-1',
      artifact_id: '11111111-1111-1111-1111-111111111111',
      version: 1,
      document: makeDocument() as unknown as ArtifactVersionRow['document'],
      reason: 'manual_checkpoint',
      created_by: 'user',
      brand_context_snapshot: null,
      created_at: '2026-01-01',
    };

    const service = new ArtifactRepairService(
      createFakeArtifactRepo(artifact, version),
      createFakeAssetRepo([makeAsset('aaaaaaaa-0000-0000-0000-000000000001', 'upload')]),
    );

    const result = await service.repairArtifactFromLatestGeneratedAsset(makeContext(), 'proj-1');
    expect(result).toBeNull();
  });

  it('returns null when current document already references the asset', async () => {
    const artifact: ArtifactRow = {
      id: '11111111-1111-1111-1111-111111111111',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      current_version_id: 'ver-1',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const doc = makeDocument();
    doc.cards[0].layers.push({
      id: '33333333-3333-3333-3333-333333333333',
      type: 'background',
      z: -1,
      x: 0,
      y: 0,
      w: doc.ratio.w,
      h: doc.ratio.h,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      assetId: 'aaaaaaaa-0000-0000-0000-000000000001',
      fit: 'cover',
    } as never);

    const version: ArtifactVersionRow = {
      id: 'ver-1',
      workspace_id: 'ws-1',
      artifact_id: '11111111-1111-1111-1111-111111111111',
      version: 1,
      document: doc as unknown as ArtifactVersionRow['document'],
      reason: 'manual_checkpoint',
      created_by: 'user',
      brand_context_snapshot: null,
      created_at: '2026-01-01',
    };

    const service = new ArtifactRepairService(
      createFakeArtifactRepo(artifact, version),
      createFakeAssetRepo([makeAsset('aaaaaaaa-0000-0000-0000-000000000001')]),
    );

    const result = await service.repairArtifactFromLatestGeneratedAsset(makeContext(), 'proj-1');
    expect(result).toBeNull();
  });

  it('creates a new artifact version with a background layer for the latest generated asset', async () => {
    const artifact: ArtifactRow = {
      id: '11111111-1111-1111-1111-111111111111',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      current_version_id: 'ver-1',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    const version: ArtifactVersionRow = {
      id: 'ver-1',
      workspace_id: 'ws-1',
      artifact_id: '11111111-1111-1111-1111-111111111111',
      version: 1,
      document: makeDocument() as unknown as ArtifactVersionRow['document'],
      reason: 'manual_checkpoint',
      created_by: 'user',
      brand_context_snapshot: null,
      created_at: '2026-01-01',
    };

    const repo = createFakeArtifactRepo(artifact, version);
    const service = new ArtifactRepairService(
      repo,
      createFakeAssetRepo([makeAsset('aaaaaaaa-0000-0000-0000-000000000002'), makeAsset('aaaaaaaa-0000-0000-0000-000000000001')]),
    );

    const result = await service.repairArtifactFromLatestGeneratedAsset(makeContext(), 'proj-1');
    expect(result).not.toBeNull();
    expect(result!.repairedAssetId).toBe('aaaaaaaa-0000-0000-0000-000000000002');
    expect(result!.previousVersionId).toBe('ver-1');
    expect(result!.newVersionId).not.toBe('ver-1');
    expect(repo.currentVersionId).toBe(result!.newVersionId);

    const committed = repo.committed[0];
    expect(committed).toBeDefined();
    const committedDoc = committed.document as unknown as ArtifactDocument;
    expect(committedDoc.cards).toHaveLength(1);
    const bgLayer = committedDoc.cards[0].layers.find((l) => l.type === 'background');
    expect(bgLayer).toBeDefined();
    expect((bgLayer as { assetId: string }).assetId).toBe('aaaaaaaa-0000-0000-0000-000000000002');
  });
});
