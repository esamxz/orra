import { describe, it, expect } from 'vitest';
import { SupabaseArtifactRepository } from '../repositories/artifactRepository.js';
import { createFakeDbClient } from './fakeDbClient.js';

describe('SupabaseArtifactRepository', () => {
  it('creates artifact for project', async () => {
    const fakeDb = createFakeDbClient({ artifacts: [] });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const artifact = await repo.createArtifactForProject({
      workspaceId: 'ws-1',
      projectId: '11111111-1111-1111-1111-111111111111',
    });

    expect(artifact).toBeDefined();
    expect(artifact.workspace_id).toBe('ws-1');
    expect(artifact.project_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(artifact.current_version_id).toBeNull();
  });

  it('creates version and sets current_version_id', async () => {
    const fakeDb = createFakeDbClient({ artifacts: [], artifact_versions: [] });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const artifact = await repo.createArtifactForProject({
      workspaceId: 'ws-1',
      projectId: '11111111-1111-1111-1111-111111111111',
    });

    const version = await repo.createVersion({
      workspaceId: 'ws-1',
      artifactId: artifact.id,
      version: 1,
      document: { schemaVersion: 1 },
      reason: 'manual_checkpoint',
      createdBy: 'user',
    });

    expect(version.artifact_id).toBe(artifact.id);
    expect(version.version).toBe(1);

    const updated = await repo.setCurrentVersion({
      workspaceId: 'ws-1',
      artifactId: artifact.id,
      versionId: version.id,
    });

    expect(updated.current_version_id).toBe(version.id);
  });

  it('getArtifactByIdForWorkspace returns artifact in same workspace', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const found = await repo.getArtifactByIdForWorkspace({
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: 'ws-1',
    });

    expect(found).not.toBeNull();
    expect(found!.id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('getArtifactByIdForWorkspace returns null for another workspace', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const found = await repo.getArtifactByIdForWorkspace({
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: 'ws-2',
    });

    expect(found).toBeNull();
  });

  it('getArtifactByProjectIdForWorkspace returns artifact for project', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const found = await repo.getArtifactByProjectIdForWorkspace({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
    });

    expect(found).not.toBeNull();
    expect(found!.project_id).toBe('proj-1');
  });

  it('getCurrentVersion returns artifact with version', async () => {
    const fakeDb = createFakeDbClient({
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
      artifact_versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: 'art-1',
          version: 1,
          document: { schemaVersion: 1 },
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const result = await repo.getCurrentVersion({
      artifactId: 'art-1',
      workspaceId: 'ws-1',
    });

    expect(result).not.toBeNull();
    expect(result!.artifact.id).toBe('art-1');
    expect(result!.version.id).toBe('ver-1');
    expect(result!.version.version).toBe(1);
  });

  it('getCurrentVersion returns null when artifact has no current version', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const result = await repo.getCurrentVersion({
      artifactId: 'art-1',
      workspaceId: 'ws-1',
    });

    expect(result).toBeNull();
  });

  it('setCurrentVersionGuarded succeeds when expected current_version_id matches', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-old',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const updated = await repo.setCurrentVersionGuarded({
      workspaceId: 'ws-1',
      artifactId: 'art-1',
      versionId: 'ver-new',
      expectedCurrentVersionId: 'ver-old',
    });

    expect(updated).not.toBeNull();
    expect(updated!.current_version_id).toBe('ver-new');
  });

  it('setCurrentVersionGuarded returns null when expected current_version_id mismatches', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-old',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const updated = await repo.setCurrentVersionGuarded({
      workspaceId: 'ws-1',
      artifactId: 'art-1',
      versionId: 'ver-new',
      expectedCurrentVersionId: 'ver-wrong',
    });

    expect(updated).toBeNull();
  });

  it('setCurrentVersionGuarded returns null for wrong workspace', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-old',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const updated = await repo.setCurrentVersionGuarded({
      workspaceId: 'ws-2',
      artifactId: 'art-1',
      versionId: 'ver-new',
      expectedCurrentVersionId: 'ver-old',
    });

    expect(updated).toBeNull();
  });

  it('commitVersion atomically inserts version and updates current_version_id', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-old',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      artifact_versions: [],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const version = await repo.commitVersion({
      workspaceId: 'ws-1',
      artifactId: 'art-1',
      expectedCurrentVersionId: 'ver-old',
      version: 2,
      document: { schemaVersion: 1, version: 2 },
      reason: 'manual_edit',
      createdBy: 'user',
    });

    expect(version).not.toBeNull();
    expect(version!.artifact_id).toBe('art-1');
    expect(version!.version).toBe(2);

    const current = await repo.getCurrentVersion({ artifactId: 'art-1', workspaceId: 'ws-1' });
    expect(current).not.toBeNull();
    expect(current!.version.id).toBe(version!.id);
  });

  it('commitVersion returns null when expected current_version_id mismatches', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-old',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const version = await repo.commitVersion({
      workspaceId: 'ws-1',
      artifactId: 'art-1',
      expectedCurrentVersionId: 'ver-wrong',
      version: 2,
      document: { schemaVersion: 1, version: 2 },
      reason: 'manual_edit',
      createdBy: 'user',
    });

    expect(version).toBeNull();
  });

  it('commitVersion returns null for wrong workspace', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: 'ver-old',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const version = await repo.commitVersion({
      workspaceId: 'ws-2',
      artifactId: 'art-1',
      expectedCurrentVersionId: 'ver-old',
      version: 2,
      document: { schemaVersion: 1, version: 2 },
      reason: 'manual_edit',
      createdBy: 'user',
    });

    expect(version).toBeNull();
  });

  it('creates manual_edit version', async () => {
    const fakeDb = createFakeDbClient({ artifacts: [], artifact_versions: [] });
    const repo = new SupabaseArtifactRepository(fakeDb);

    const artifact = await repo.createArtifactForProject({
      workspaceId: 'ws-1',
      projectId: '11111111-1111-1111-1111-111111111111',
    });

    const version = await repo.createVersion({
      workspaceId: 'ws-1',
      artifactId: artifact.id,
      version: 2,
      document: { schemaVersion: 1, version: 2 },
      reason: 'manual_edit',
      createdBy: 'user',
    });

    expect(version.reason).toBe('manual_edit');
    expect(version.created_by).toBe('user');
    expect(version.version).toBe(2);
  });

  it('getCurrent reflects update after setCurrentVersion', async () => {
    const fakeDb = createFakeDbClient({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          current_version_id: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      artifact_versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: 'art-1',
          version: 1,
          document: { schemaVersion: 1 },
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseArtifactRepository(fakeDb);

    await repo.setCurrentVersion({
      workspaceId: 'ws-1',
      artifactId: 'art-1',
      versionId: 'ver-1',
    });

    const current = await repo.getCurrentVersion({
      artifactId: 'art-1',
      workspaceId: 'ws-1',
    });

    expect(current).not.toBeNull();
    expect(current!.version.id).toBe('ver-1');
  });
});
