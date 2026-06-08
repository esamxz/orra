import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { ArtifactService } from '../services/artifactService.js';
import { ApiError } from '../errors.js';
import type { ArtifactRepository } from '../repositories/artifactRepository.js';
import type { ArtifactRow, ArtifactVersionRow } from '@orra/db';

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
});
