import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { ArtifactService } from '../services/artifactService.js';
import { ApiError } from '../errors.js';
import type { ArtifactRepository } from '../repositories/artifactRepository.js';
import type { ArtifactRow, ArtifactVersionRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function assertApiErrorCode(promise: Promise<unknown>, code: string): Promise<void> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe(code);
}

// ---------------------------------------------------------------------------
// Fake artifact repository
// ---------------------------------------------------------------------------

function createFakeArtifactRepository(initial: { artifacts?: ArtifactRow[]; versions?: ArtifactVersionRow[] } = {}): ArtifactRepository {
  const artifacts = [...(initial.artifacts ?? [])];
  const versions = [...(initial.versions ?? [])];

  return {
    async createArtifactForProject(input) {
      const artifact: ArtifactRow = {
        id: randomUUID(),
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        current_version_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      artifacts.push(artifact);
      return artifact;
    },

    async createVersion(input) {
      const version: ArtifactVersionRow = {
        id: randomUUID(),
        workspace_id: input.workspaceId,
        artifact_id: input.artifactId,
        version: input.version,
        document: input.document,
        reason: input.reason,
        created_by: input.createdBy,
        brand_context_snapshot: null,
        created_at: new Date().toISOString(),
      };
      versions.push(version);
      return version;
    },

    async setCurrentVersion(input) {
      const idx = artifacts.findIndex(
        (a) => a.id === input.artifactId && a.workspace_id === input.workspaceId
      );
      if (idx === -1) {
        throw new Error('Artifact not found');
      }
      artifacts[idx] = { ...artifacts[idx], current_version_id: input.versionId };
      return artifacts[idx];
    },

    async setCurrentVersionGuarded(input) {
      const idx = artifacts.findIndex(
        (a) =>
          a.id === input.artifactId &&
          a.workspace_id === input.workspaceId &&
          a.current_version_id === input.expectedCurrentVersionId
      );
      if (idx === -1) {
        return null;
      }
      artifacts[idx] = { ...artifacts[idx], current_version_id: input.versionId };
      return artifacts[idx];
    },

    async commitVersion(input) {
      const idx = artifacts.findIndex(
        (a) =>
          a.id === input.artifactId &&
          a.workspace_id === input.workspaceId &&
          a.current_version_id === input.expectedCurrentVersionId
      );
      if (idx === -1) {
        return null;
      }
      const version: ArtifactVersionRow = {
        id: randomUUID(),
        workspace_id: input.workspaceId,
        artifact_id: input.artifactId,
        version: input.version,
        document: input.document,
        reason: input.reason,
        created_by: input.createdBy,
        brand_context_snapshot: null,
        created_at: new Date().toISOString(),
      };
      versions.push(version);
      artifacts[idx] = { ...artifacts[idx], current_version_id: version.id, updated_at: version.created_at };
      return version;
    },

    async getArtifactByIdForWorkspace(input) {
      return (
        artifacts.find(
          (a) => a.id === input.id && a.workspace_id === input.workspaceId
        ) ?? null
      );
    },

    async getArtifactByProjectIdForWorkspace(input) {
      return (
        artifacts.find(
          (a) => a.project_id === input.projectId && a.workspace_id === input.workspaceId
        ) ?? null
      );
    },

    async getCurrentVersion(input) {
      const artifact = artifacts.find(
        (a) => a.id === input.artifactId && a.workspace_id === input.workspaceId
      );
      if (!artifact || !artifact.current_version_id) return null;
      const version = versions.find((v) => v.id === artifact.current_version_id);
      if (!version) return null;
      return { artifact, version };
    },
  };
}

function fakeAuthContext(workspaceId: string) {
  return {
    env: {} as unknown as import('../env.js').Env,
    requestId: 'req-123',
    auth: {
      isAuthenticated: true,
      clerkUserId: 'usr_test',
      userId: 'user-1',
      workspaceId,
      role: 'owner' as const,
      authSource: 'clerk' as const,
    },
  };
}

describe('ArtifactService', () => {
  it('createInitialArtifactForProject creates artifact, version, and sets current', async () => {
    const repo = createFakeArtifactRepository();
    const service = new ArtifactService(repo);

    const artifact = await service.createInitialArtifactForProject(
      'ws-1',
      'proj-1',
      'post',
      { name: '4:5', w: 1080, h: 1350 }
    );

    expect(artifact.workspace_id).toBe('ws-1');
    expect(artifact.project_id).toBe('proj-1');
    expect(artifact.current_version_id).not.toBeNull();
  });

  it('createInitialArtifactForProject produces a valid document', async () => {
    const repo = createFakeArtifactRepository();
    const service = new ArtifactService(repo);

    const artifact = await service.createInitialArtifactForProject(
      'ws-1',
      'proj-1',
      'carousel',
      { name: '1:1', w: 1080, h: 1080 }
    );

    // Verify version was stored by checking getCurrentVersion
    const current = await repo.getCurrentVersion({
      artifactId: artifact.id,
      workspaceId: 'ws-1',
    });

    expect(current).not.toBeNull();
    expect(current!.version.document).toBeDefined();
    const doc = current!.version.document as { type: string; cards: unknown[] };
    expect(doc.type).toBe('carousel');
    expect(doc.cards).toHaveLength(1);
  });

  it('getCurrentArtifact returns artifact with validated document', async () => {
    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: 'art-1',
          version: 1,
          document: {
            schemaVersion: 1,
            artifactId: '11111111-1111-1111-1111-111111111111',
            type: 'post',
            ratio: { name: '4:5', w: 1080, h: 1350 },
            cards: [
              {
                id: '11111111-1111-1111-1111-111111111112',
                index: 0,
                baseColor: '#1d2a30',
                layers: [],
              },
            ],
            version: 1,
          },
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');
    const result = await service.getCurrentArtifact(ctx, 'art-1');

    expect(result.artifactId).toBe('art-1');
    expect(result.version).toBe(1);
    expect(result.document.type).toBe('post');
  });

  it('getCurrentArtifact throws NOT_FOUND for another workspace', async () => {
    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: 'art-1',
          version: 1,
          document: {
            schemaVersion: 1,
            artifactId: '11111111-1111-1111-1111-111111111111',
            type: 'post',
            ratio: { name: '4:5', w: 1080, h: 1350 },
            cards: [
              {
                id: '11111111-1111-1111-1111-111111111112',
                index: 0,
                baseColor: '#1d2a30',
                layers: [],
              },
            ],
            version: 1,
          },
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-2');

    await expect(service.getCurrentArtifact(ctx, 'art-1')).rejects.toThrow(ApiError);
    await expect(service.getCurrentArtifact(ctx, 'art-1')).rejects.toThrow('Artifact not found');
  });

  it('getProjectArtifact returns artifact by projectId', async () => {
    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: 'art-1',
          version: 1,
          document: {
            schemaVersion: 1,
            artifactId: '11111111-1111-1111-1111-111111111111',
            type: 'post',
            ratio: { name: '4:5', w: 1080, h: 1350 },
            cards: [
              {
                id: '11111111-1111-1111-1111-111111111112',
                index: 0,
                baseColor: '#1d2a30',
                layers: [],
              },
            ],
            version: 1,
          },
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');
    const result = await service.getProjectArtifact(ctx, 'proj-1');

    expect(result.artifactId).toBe('art-1');
    expect(result.projectId).toBe('proj-1');
  });

  it('getProjectArtifact throws NOT_FOUND when project has no artifact', async () => {
    const repo = createFakeArtifactRepository();
    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    await expect(service.getProjectArtifact(ctx, 'proj-missing')).rejects.toThrow(ApiError);
  });

  // -------------------------------------------------------------------------
  // applyAction
  // -------------------------------------------------------------------------

  function makeDocumentWithTextLayer(artifactId: string, version: number) {
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    return {
      schemaVersion: 1,
      artifactId,
      type: 'post' as const,
      ratio: { name: '4:5' as const, w: 1080, h: 1350 },
      cards: [
        {
          id: cardId,
          index: 0,
          baseColor: '#1d2a30',
          layers: [
            {
              id: layerId,
              type: 'text',
              z: 0,
              x: 100,
              y: 100,
              w: 400,
              h: 200,
              rotation: 0,
              opacity: 1,
              locked: false,
              hidden: false,
              content: 'Hello',
              fontFamily: 'Inter',
              fontSize: 32,
              fontWeight: 400,
              lineHeight: 1.2,
              letterSpacing: 0,
              color: '#ffffff',
              align: 'center',
            },
          ],
        },
      ],
      version,
    };
  }

  it('applyAction applies a valid setTextContent action', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    const document = makeDocumentWithTextLayer(artifactId, 1);

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.applyAction(ctx, artifactId, {
      baseVersion: 1,
      action: {
        type: 'setTextContent',
        cardId,
        layerId,
        content: 'Updated text',
      },
    });

    expect((result.document.cards[0].layers[0] as { content: string }).content).toBe('Updated text');
    expect(result.version).toBe(2);
    expect(result.artifactVersionNumber).toBe(2);
  });

  it('applyAction creates a new artifact_version snapshot', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    const document = makeDocumentWithTextLayer(artifactId, 1);

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.applyAction(ctx, artifactId, {
      baseVersion: 1,
      action: {
        type: 'setTextContent',
        cardId,
        layerId,
        content: 'New',
      },
    });

    // The repo should now have two versions.
    const current = await repo.getCurrentVersion({ artifactId, workspaceId: 'ws-1' });
    expect(current).not.toBeNull();
    expect(current!.version.id).toBe(result.currentVersionId);
    expect(current!.version.version).toBe(2);
    expect(current!.version.reason).toBe('manual_edit');
  });

  it('applyAction updates current_version_id', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    const document = makeDocumentWithTextLayer(artifactId, 1);

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.applyAction(ctx, artifactId, {
      baseVersion: 1,
      action: {
        type: 'setTextContent',
        cardId,
        layerId,
        content: 'New',
      },
    });

    const artifact = await repo.getArtifactByIdForWorkspace({ id: artifactId, workspaceId: 'ws-1' });
    expect(artifact!.current_version_id).toBe(result.currentVersionId);
  });

  it('applyAction increments document.version through kernel', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    const document = makeDocumentWithTextLayer(artifactId, 1);

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.applyAction(ctx, artifactId, {
      baseVersion: 1,
      action: { type: 'setTextContent', cardId, layerId, content: 'V2' },
    });

    expect(result.version).toBe(2);
    expect(result.document.version).toBe(2);
  });

  it('applyAction increments artifact_versions.version by 1', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    const document = makeDocumentWithTextLayer(artifactId, 5);

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-prev',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-prev',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 5,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.applyAction(ctx, artifactId, {
      baseVersion: 5,
      action: { type: 'setTextContent', cardId, layerId, content: 'V6' },
    });

    expect(result.artifactVersionNumber).toBe(6);
  });

  it('applyAction throws VERSION_CONFLICT on stale baseVersion', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    const document = makeDocumentWithTextLayer(artifactId, 3);

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    // Client thinks the base version is 2, but server has version 3.
    await assertApiErrorCode(
      service.applyAction(ctx, artifactId, {
        baseVersion: 2,
        action: { type: 'setTextContent', cardId, layerId, content: 'X' },
      }),
      'VERSION_CONFLICT'
    );
  });

  it('applyAction throws NOT_FOUND for cross-workspace artifact', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    const document = makeDocumentWithTextLayer(artifactId, 1);

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-other');

    await assertApiErrorCode(
      service.applyAction(ctx, artifactId, {
        baseVersion: 1,
        action: { type: 'setTextContent', cardId, layerId, content: 'X' },
      }),
      'NOT_FOUND'
    );
  });

  it('applyAction throws VALIDATION for invalid kernel action', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const document = makeDocumentWithTextLayer(artifactId, 1);

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    // Missing cardId — should fail kernel validation.
    await assertApiErrorCode(
      service.applyAction(ctx, artifactId, {
        baseVersion: 1,
        action: { type: 'setTextContent', layerId: '11111111-1111-1111-1111-111111111113', content: 'X' },
      }),
      'VALIDATION'
    );
  });

  it('applyAction rejects locked layer mutation', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    const document = makeDocumentWithTextLayer(artifactId, 1);
    (document.cards[0].layers[0] as { locked: boolean }).locked = true;

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    await assertApiErrorCode(
      service.applyAction(ctx, artifactId, {
        baseVersion: 1,
        action: { type: 'setTextContent', cardId, layerId, content: 'X' },
      }),
      'VALIDATION'
    );
  });

  it('applyAction rejects unsupported font mutation', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const cardId = '11111111-1111-1111-1111-111111111112';
    const layerId = '11111111-1111-1111-1111-111111111113';
    const document = makeDocumentWithTextLayer(artifactId, 1);

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    await assertApiErrorCode(
      service.applyAction(ctx, artifactId, {
        baseVersion: 1,
        action: {
          type: 'setTextStyle',
          cardId,
          layerId,
          style: { fontFamily: 'NotARealFont' },
        },
      }),
      'VALIDATION'
    );
  });

  it('applyAction validates current document from DB before applying', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document: { invalid: true },
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    await assertApiErrorCode(
      service.applyAction(ctx, artifactId, {
        baseVersion: 0, // mismatched anyway, but validation should happen first
        action: { type: 'setTextContent', cardId: '11111111-1111-1111-1111-111111111112', layerId: '11111111-1111-1111-1111-111111111113', content: 'X' },
      }),
      'INTERNAL'
    );
  });

  // -------------------------------------------------------------------------
  // D2 regression: commit_artifact_version ambiguous "id" column fix
  // The original Postgres function used RETURNING artifact_versions.id INTO
  // v_new_version_id, which was ambiguous with the implicit RETURNS TABLE OUT
  // variable also named "id". The fix pre-generates the UUID with
  // gen_random_uuid() and supplies it explicitly in the INSERT.
  // This test ensures addCard commits a new version without that failure.
  // -------------------------------------------------------------------------

  it('regression: addCard action commits without ambiguous id column (D2 fix)', async () => {
    const artifactId = '11111111-1111-1111-1111-111111111111';
    const existingCardId = '22222222-2222-2222-2222-222222222221';
    const newCardId = randomUUID();

    const carouselDocument = {
      schemaVersion: 1,
      artifactId,
      type: 'carousel' as const,
      ratio: { name: '1:1' as const, w: 1080, h: 1080 },
      cards: [
        {
          id: existingCardId,
          index: 0,
          baseColor: '#1d2a30',
          layers: [],
        },
      ],
      version: 1,
    };

    const repo = createFakeArtifactRepository({
      artifacts: [
        {
          id: artifactId,
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: artifactId,
          version: 1,
          document: carouselDocument,
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const service = new ArtifactService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.applyAction(ctx, artifactId, {
      baseVersion: 1,
      action: {
        type: 'addCard',
        card: { id: newCardId, index: 1, baseColor: '#354e53', layers: [] },
      },
    });

    // Commit must succeed and return a new version (null would indicate the
    // Postgres RPC failed due to ambiguous column reference).
    expect(result.currentVersionId).toBeTruthy();
    expect(result.currentVersionId).not.toBe('ver-1');
    expect(result.document.cards).toHaveLength(2);
    expect(result.document.cards[1].id).toBe(newCardId);
    expect(result.artifactVersionNumber).toBe(2);

    // Confirm the artifact pointer was updated.
    const updated = await repo.getCurrentVersion({ artifactId, workspaceId: 'ws-1' });
    expect(updated!.version.id).toBe(result.currentVersionId);
  });
});
