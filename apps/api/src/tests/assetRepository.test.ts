import { describe, it, expect } from 'vitest';
import { SupabaseAssetRepository, StubAssetRepository } from '../repositories/assetRepository.js';
import { createFakeDbClient } from './fakeDbClient.js';

// ---------------------------------------------------------------------------
// StubAssetRepository
// ---------------------------------------------------------------------------

describe('StubAssetRepository', () => {
  it('throws for every method', async () => {
    const stub = new StubAssetRepository(createFakeDbClient());

    await expect(
      stub.createProjectAsset({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        kind: 'upload',
        r2Key: 'key',
        contentType: 'image/png',
        sizeBytes: 1024,
      })
    ).rejects.toThrow('AssetRepository.createProjectAsset is not implemented yet.');

    await expect(
      stub.createBrandAsset({
        workspaceId: 'ws-1',
        brandSystemId: 'brand-1',
        kind: 'logo',
        r2Key: 'key',
        contentType: 'image/png',
        sizeBytes: 1024,
      })
    ).rejects.toThrow('AssetRepository.createBrandAsset is not implemented yet.');

    await expect(stub.listProjectAssets({ projectId: 'proj-1', workspaceId: 'ws-1' })).rejects.toThrow(
      'AssetRepository.listProjectAssets is not implemented yet.'
    );

    await expect(stub.listBrandAssets({ brandSystemId: 'brand-1', workspaceId: 'ws-1' })).rejects.toThrow(
      'AssetRepository.listBrandAssets is not implemented yet.'
    );
  });
});

// ---------------------------------------------------------------------------
// SupabaseAssetRepository (with fake DB client)
// ---------------------------------------------------------------------------

describe('SupabaseAssetRepository', () => {
  it('creates a project asset and returns the row', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const row = await repo.createProjectAsset({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'upload',
      r2Key: 'workspace/ws-1/projects/proj-1/assets/pa-1/hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    expect(row.workspace_id).toBe('ws-1');
    expect(row.project_id).toBe('proj-1');
    expect(row.kind).toBe('upload');
    expect(row.r2_key).toBe('workspace/ws-1/projects/proj-1/assets/pa-1/hero.png');
    expect(row.content_type).toBe('image/png');
    expect(row.size_bytes).toBe(1024);
  });

  it('creates a brand asset and returns the row', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const row = await repo.createBrandAsset({
      workspaceId: 'ws-1',
      brandSystemId: 'brand-1',
      kind: 'logo',
      r2Key: 'workspace/ws-1/brands/brand-1/assets/ba-1/logo.png',
      contentType: 'image/png',
      sizeBytes: 2048,
    });

    expect(row.workspace_id).toBe('ws-1');
    expect(row.brand_system_id).toBe('brand-1');
    expect(row.kind).toBe('logo');
    expect(row.r2_key).toBe('workspace/ws-1/brands/brand-1/assets/ba-1/logo.png');
    expect(row.content_type).toBe('image/png');
    expect(row.size_bytes).toBe(2048);
  });

  it('lists project assets scoped by project and workspace', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    // Insert two assets via the repo
    await repo.createProjectAsset({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'upload',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });
    await repo.createProjectAsset({
      workspaceId: 'ws-1',
      projectId: 'proj-2',
      kind: 'reference',
      r2Key: 'key-2',
      contentType: 'image/jpeg',
      sizeBytes: 2048,
    });

    const list = await repo.listProjectAssets({ projectId: 'proj-1', workspaceId: 'ws-1' });
    expect(list).toHaveLength(1);
    expect(list[0].project_id).toBe('proj-1');
    expect(list[0].r2_key).toBe('key-1');
  });

  it('lists brand assets scoped by brand system and workspace', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    await repo.createBrandAsset({
      workspaceId: 'ws-1',
      brandSystemId: 'brand-1',
      kind: 'logo',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });
    await repo.createBrandAsset({
      workspaceId: 'ws-1',
      brandSystemId: 'brand-2',
      kind: 'reference',
      r2Key: 'key-2',
      contentType: 'image/jpeg',
      sizeBytes: 2048,
    });

    const list = await repo.listBrandAssets({ brandSystemId: 'brand-1', workspaceId: 'ws-1' });
    expect(list).toHaveLength(1);
    expect(list[0].brand_system_id).toBe('brand-1');
    expect(list[0].r2_key).toBe('key-1');
  });

  it('r2Key is stored exactly as provided', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const customKey = 'workspace/ws-1/projects/proj-1/assets/uuid/my-image.png';
    const row = await repo.createProjectAsset({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'upload',
      r2Key: customKey,
      contentType: 'image/webp',
      sizeBytes: 512,
    });

    expect(row.r2_key).toBe(customKey);
  });

  // ---------------------------------------------------------------------------
  // Find scoped by workspace + project/brand
  // ---------------------------------------------------------------------------

  it('finds a project asset scoped by workspace and project', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const created = await repo.createProjectAsset({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'upload',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const found = await repo.findProjectAssetForWorkspace({
      id: created.id,
      projectId: 'proj-1',
      workspaceId: 'ws-1',
    });

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.status).toBe('pending_upload');
  });

  it('returns null for cross-workspace project asset', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const created = await repo.createProjectAsset({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'upload',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const found = await repo.findProjectAssetForWorkspace({
      id: created.id,
      projectId: 'proj-1',
      workspaceId: 'ws-other',
    });

    expect(found).toBeNull();
  });

  it('finds a brand asset scoped by workspace and brand system', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const created = await repo.createBrandAsset({
      workspaceId: 'ws-1',
      brandSystemId: 'brand-1',
      kind: 'logo',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const found = await repo.findBrandAssetForWorkspace({
      id: created.id,
      brandSystemId: 'brand-1',
      workspaceId: 'ws-1',
    });

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.status).toBe('pending_upload');
  });

  it('returns null for cross-workspace brand asset', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const created = await repo.createBrandAsset({
      workspaceId: 'ws-1',
      brandSystemId: 'brand-1',
      kind: 'logo',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const found = await repo.findBrandAssetForWorkspace({
      id: created.id,
      brandSystemId: 'brand-1',
      workspaceId: 'ws-other',
    });

    expect(found).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Mark uploaded
  // ---------------------------------------------------------------------------

  it('marks a project asset as uploaded', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const created = await repo.createProjectAsset({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'upload',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const updated = await repo.markProjectAssetUploaded({
      id: created.id,
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      sizeBytes: 2048,
      contentType: 'image/jpeg',
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('uploaded');
    expect(updated!.size_bytes).toBe(2048);
    expect(updated!.content_type).toBe('image/jpeg');
  });

  it('markProjectAssetUploaded returns null for cross-workscope asset', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const created = await repo.createProjectAsset({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'upload',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const updated = await repo.markProjectAssetUploaded({
      id: created.id,
      projectId: 'proj-1',
      workspaceId: 'ws-other',
    });

    expect(updated).toBeNull();
  });

  it('marks a brand asset as uploaded', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const created = await repo.createBrandAsset({
      workspaceId: 'ws-1',
      brandSystemId: 'brand-1',
      kind: 'logo',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const updated = await repo.markBrandAssetUploaded({
      id: created.id,
      brandSystemId: 'brand-1',
      workspaceId: 'ws-1',
      sizeBytes: 2048,
      contentType: 'image/webp',
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('uploaded');
    expect(updated!.size_bytes).toBe(2048);
    expect(updated!.content_type).toBe('image/webp');
  });

  it('markBrandAssetUploaded returns null for cross-workspace asset', async () => {
    const db = createFakeDbClient();
    const repo = new SupabaseAssetRepository(db);

    const created = await repo.createBrandAsset({
      workspaceId: 'ws-1',
      brandSystemId: 'brand-1',
      kind: 'logo',
      r2Key: 'key-1',
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    const updated = await repo.markBrandAssetUploaded({
      id: created.id,
      brandSystemId: 'brand-1',
      workspaceId: 'ws-other',
    });

    expect(updated).toBeNull();
  });
});
