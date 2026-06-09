import { describe, it, expect } from 'vitest';
import { AssetUploadService, sanitizeFileName } from '../services/assetUploadService.js';
import { ApiError } from '../errors.js';
import { FakeR2Signer } from '../r2/r2Signer.js';
import { FakeR2ObjectInspector } from '../r2/r2ObjectInspector.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import type { AssetRepository } from '../repositories/assetRepository.js';
import type { ProjectRow, BrandSystemRow, ProjectAssetRow, BrandAssetRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Fake repositories
// ---------------------------------------------------------------------------

function createFakeProjectRepository(initial: ProjectRow[] = []): ProjectRepository {
  const projects = [...initial];
  return {
    async create() {
      throw new Error('Not used');
    },
    async listByWorkspace() {
      return [];
    },
    async findByIdForWorkspace(input) {
      return projects.find((p) => p.id === input.id && p.workspace_id === input.workspaceId) ?? null;
    },
    async updateForWorkspace() {
      return null;
    },
    async deleteForWorkspace() {},
  };
}

function createFakeBrandSystemRepository(initial: BrandSystemRow[] = []): BrandSystemRepository {
  const brands = [...initial];
  return {
    async create() {
      throw new Error('Not used');
    },
    async listByWorkspace() {
      return [];
    },
    async findByIdForWorkspace(input) {
      return brands.find((b) => b.id === input.id && b.workspace_id === input.workspaceId) ?? null;
    },
    async updateForWorkspace() {
      return null;
    },
    async deleteForWorkspace() {},
  };
}

function createFakeAssetRepository(): AssetRepository {
  let nextId = 1;
  const projectAssets: ProjectAssetRow[] = [];
  const brandAssets: BrandAssetRow[] = [];

  return {
    async createProjectAsset(input) {
      const asset: ProjectAssetRow = {
        id: `pa-${nextId++}`,
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        kind: input.kind,
        r2_key: input.r2Key,
        content_hash: null,
        content_type: input.contentType,
        width: null,
        height: null,
        size_bytes: input.sizeBytes,
        source_prompt: null,
        analysis: null,
        status: 'pending_upload',
        created_at: new Date().toISOString(),
      };
      projectAssets.push(asset);
      return asset;
    },
    async createBrandAsset(input) {
      const asset: BrandAssetRow = {
        id: `ba-${nextId++}`,
        workspace_id: input.workspaceId,
        brand_system_id: input.brandSystemId,
        kind: input.kind,
        r2_key: input.r2Key,
        content_type: input.contentType,
        width: null,
        height: null,
        size_bytes: input.sizeBytes,
        status: 'pending_upload',
        created_at: new Date().toISOString(),
      };
      brandAssets.push(asset);
      return asset;
    },
    async listProjectAssets() {
      return [];
    },
    async listBrandAssets() {
      return [];
    },
    async findProjectAssetForWorkspace(input) {
      return (
        projectAssets.find(
          (a) =>
            a.id === input.id &&
            a.project_id === input.projectId &&
            a.workspace_id === input.workspaceId
        ) ?? null
      );
    },
    async findBrandAssetForWorkspace(input) {
      return (
        brandAssets.find(
          (a) =>
            a.id === input.id &&
            a.brand_system_id === input.brandSystemId &&
            a.workspace_id === input.workspaceId
        ) ?? null
      );
    },
    async markProjectAssetUploaded(input) {
      const idx = projectAssets.findIndex(
        (a) =>
          a.id === input.id &&
          a.project_id === input.projectId &&
          a.workspace_id === input.workspaceId
      );
      if (idx === -1) return null;
      projectAssets[idx] = {
        ...projectAssets[idx],
        status: 'uploaded',
        size_bytes: input.sizeBytes ?? projectAssets[idx].size_bytes,
        content_type: input.contentType ?? projectAssets[idx].content_type,
      };
      return projectAssets[idx];
    },
    async markBrandAssetUploaded(input) {
      const idx = brandAssets.findIndex(
        (a) =>
          a.id === input.id &&
          a.brand_system_id === input.brandSystemId &&
          a.workspace_id === input.workspaceId
      );
      if (idx === -1) return null;
      brandAssets[idx] = {
        ...brandAssets[idx],
        status: 'uploaded',
        size_bytes: input.sizeBytes ?? brandAssets[idx].size_bytes,
        content_type: input.contentType ?? brandAssets[idx].content_type,
      };
      return brandAssets[idx];
    },
  };
}

function fakeAuthContext(workspaceId: string) {
  return {
    env: { ENVIRONMENT: 'development' } as unknown as import('../env.js').Env,
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

// ---------------------------------------------------------------------------
// sanitizeFileName
// ---------------------------------------------------------------------------

describe('sanitizeFileName', () => {
  it('strips directory paths', () => {
    expect(sanitizeFileName('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('foo/bar/baz.png')).toBe('baz.png');
  });

  it('replaces spaces with hyphens', () => {
    expect(sanitizeFileName('my file name.png')).toBe('my-file-name.png');
  });

  it('removes unsafe characters', () => {
    expect(sanitizeFileName('file@name#1.png')).toBe('filename1.png');
  });

  it('collapses multiple dots', () => {
    expect(sanitizeFileName('file...name.png')).toBe('file.name.png');
  });

  it('falls back to asset for empty result', () => {
    expect(sanitizeFileName('...')).toBe('asset');
    expect(sanitizeFileName('')).toBe('asset');
  });

  it('preserves safe names', () => {
    expect(sanitizeFileName('hero.png')).toBe('hero.png');
    expect(sanitizeFileName('my-file_2.webp')).toBe('my-file_2.webp');
  });
});

// ---------------------------------------------------------------------------
// AssetUploadService
// ---------------------------------------------------------------------------

describe('AssetUploadService', () => {
  it('project upload intent returns asset and PUT info', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createProjectUploadIntent(ctx, 'proj-1', {
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });

    expect(result.asset.workspaceId).toBe('ws-1');
    expect(result.asset.projectId).toBe('proj-1');
    expect(result.asset.kind).toBe('upload');
    expect(result.asset.fileName).toBe('hero.png');
    expect(result.asset.r2Key).toContain('workspace/ws-1/projects/proj-1/assets/');
    expect(result.asset.r2Key).toContain('hero.png');
    expect(result.upload.method).toBe('PUT');
    expect(result.upload.url).toContain('fake-r2.orra.local');
    expect(result.upload.headers['Content-Type']).toBe('image/png');
    expect(result.upload.expiresAt).toBeTruthy();
  });

  it('brand upload intent returns asset and PUT info', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository();
    const brandRepo = createFakeBrandSystemRepository([
      {
        id: 'brand-1',
        workspace_id: 'ws-1',
        name: 'Test Brand',
        description: null,
        tone_of_voice: null,
        visual_direction: null,
        rules: null,
        palette: [],
        typography: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const signer = new FakeR2Signer();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createBrandUploadIntent(ctx, 'brand-1', {
      fileName: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 2048,
      kind: 'logo',
    });

    expect(result.asset.workspaceId).toBe('ws-1');
    expect(result.asset.brandSystemId).toBe('brand-1');
    expect(result.asset.kind).toBe('logo');
    expect(result.asset.fileName).toBe('logo.png');
    expect(result.asset.r2Key).toContain('workspace/ws-1/brands/brand-1/assets/');
    expect(result.upload.method).toBe('PUT');
  });

  it('cross-workspace project returns NOT_FOUND', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-other',
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer);
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createProjectUploadIntent(ctx, 'proj-1', {
        fileName: 'hero.png',
        contentType: 'image/png',
        sizeBytes: 1024,
        kind: 'upload',
      })
    ).rejects.toThrow(ApiError);
    await expect(
      service.createProjectUploadIntent(ctx, 'proj-1', {
        fileName: 'hero.png',
        contentType: 'image/png',
        sizeBytes: 1024,
        kind: 'upload',
      })
    ).rejects.toThrow('Project not found');
  });

  it('cross-workspace brand returns NOT_FOUND', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository();
    const brandRepo = createFakeBrandSystemRepository([
      {
        id: 'brand-1',
        workspace_id: 'ws-other',
        name: 'Test Brand',
        description: null,
        tone_of_voice: null,
        visual_direction: null,
        rules: null,
        palette: [],
        typography: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const signer = new FakeR2Signer();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer);
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createBrandUploadIntent(ctx, 'brand-1', {
        fileName: 'logo.png',
        contentType: 'image/png',
        sizeBytes: 2048,
        kind: 'logo',
      })
    ).rejects.toThrow(ApiError);
    await expect(
      service.createBrandUploadIntent(ctx, 'brand-1', {
        fileName: 'logo.png',
        contentType: 'image/png',
        sizeBytes: 2048,
        kind: 'logo',
      })
    ).rejects.toThrow('Brand system not found');
  });

  it('missing auth throws UNAUTHENTICATED', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository();
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer);
    const ctx = {
      env: { ENVIRONMENT: 'development' } as unknown as import('../env.js').Env,
      requestId: 'req-123',
      auth: undefined,
    };

    await expect(
      service.createProjectUploadIntent(ctx, 'proj-1', {
        fileName: 'hero.png',
        contentType: 'image/png',
        sizeBytes: 1024,
        kind: 'upload',
      })
    ).rejects.toThrow(ApiError);
  });

  it('sanitizes file names in R2 keys', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createProjectUploadIntent(ctx, 'proj-1', {
      fileName: 'my file @name.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });

    expect(result.asset.r2Key).toContain('my-file-name.png');
    expect(result.asset.r2Key).not.toContain(' ');
    expect(result.asset.r2Key).not.toContain('@');
  });

  // ---------------------------------------------------------------------------
  // Upload confirmation
  // ---------------------------------------------------------------------------

  it('confirms a project asset upload successfully', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const inspector = new FakeR2ObjectInspector();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer, inspector);
    const ctx = fakeAuthContext('ws-1');

    const intent = await service.createProjectUploadIntent(ctx, 'proj-1', {
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });

    inspector.register(intent.asset.r2Key, { sizeBytes: 1024, contentType: 'image/png' });

    const confirmed = await service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {
      expectedSizeBytes: 1024,
      expectedContentType: 'image/png',
    });

    expect(confirmed.status).toBe('uploaded');
    expect(confirmed.id).toBe(intent.asset.id);
    expect(confirmed.sizeBytes).toBe(1024);
  });

  it('confirms a brand asset upload successfully', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository();
    const brandRepo = createFakeBrandSystemRepository([
      {
        id: 'brand-1',
        workspace_id: 'ws-1',
        name: 'Test Brand',
        description: null,
        tone_of_voice: null,
        visual_direction: null,
        rules: null,
        palette: [],
        typography: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const signer = new FakeR2Signer();
    const inspector = new FakeR2ObjectInspector();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer, inspector);
    const ctx = fakeAuthContext('ws-1');

    const intent = await service.createBrandUploadIntent(ctx, 'brand-1', {
      fileName: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 2048,
      kind: 'logo',
    });

    inspector.register(intent.asset.r2Key, { sizeBytes: 2048, contentType: 'image/png' });

    const confirmed = await service.confirmBrandAssetUpload(ctx, 'brand-1', intent.asset.id, {
      expectedSizeBytes: 2048,
    });

    expect(confirmed.status).toBe('uploaded');
    expect(confirmed.id).toBe(intent.asset.id);
  });

  it('idempotent confirmation returns existing uploaded asset', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const inspector = new FakeR2ObjectInspector();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer, inspector);
    const ctx = fakeAuthContext('ws-1');

    const intent = await service.createProjectUploadIntent(ctx, 'proj-1', {
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });

    inspector.register(intent.asset.r2Key, { sizeBytes: 1024, contentType: 'image/png' });

    await service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {});
    const second = await service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {});

    expect(second.status).toBe('uploaded');
  });

  it('missing R2 object rejects confirmation', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const inspector = new FakeR2ObjectInspector();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer, inspector);
    const ctx = fakeAuthContext('ws-1');

    const intent = await service.createProjectUploadIntent(ctx, 'proj-1', {
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });

    // Do NOT register the object in inspector

    await expect(
      service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {})
    ).rejects.toThrow(ApiError);
    await expect(
      service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {})
    ).rejects.toThrow('Upload not found in storage');
  });

  it('size mismatch rejects confirmation', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const inspector = new FakeR2ObjectInspector();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer, inspector);
    const ctx = fakeAuthContext('ws-1');

    const intent = await service.createProjectUploadIntent(ctx, 'proj-1', {
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });

    inspector.register(intent.asset.r2Key, { sizeBytes: 2048, contentType: 'image/png' });

    await expect(
      service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {
        expectedSizeBytes: 1024,
      })
    ).rejects.toThrow(ApiError);
    await expect(
      service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {
        expectedSizeBytes: 1024,
      })
    ).rejects.toThrow('Size mismatch');
  });

  it('content type mismatch rejects confirmation', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const inspector = new FakeR2ObjectInspector();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer, inspector);
    const ctx = fakeAuthContext('ws-1');

    const intent = await service.createProjectUploadIntent(ctx, 'proj-1', {
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });

    inspector.register(intent.asset.r2Key, { sizeBytes: 1024, contentType: 'image/jpeg' });

    await expect(
      service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {
        expectedContentType: 'image/png',
      })
    ).rejects.toThrow(ApiError);
    await expect(
      service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {
        expectedContentType: 'image/png',
      })
    ).rejects.toThrow('Content type mismatch');
  });

  it('cross-workspace asset confirmation returns NOT_FOUND', async () => {
    const assetRepo = createFakeAssetRepository();
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-other',
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const brandRepo = createFakeBrandSystemRepository();
    const signer = new FakeR2Signer();
    const inspector = new FakeR2ObjectInspector();
    const service = new AssetUploadService(assetRepo, projectRepo, brandRepo, signer, inspector);
    const ctx = fakeAuthContext('ws-1');

    // Create asset in ws-other via the service, but the repo still records it
    const intent = await service.createProjectUploadIntent(
      {
        ...ctx,
        auth: { ...ctx.auth, workspaceId: 'ws-other' },
      },
      'proj-1',
      {
        fileName: 'hero.png',
        contentType: 'image/png',
        sizeBytes: 1024,
        kind: 'upload',
      }
    );

    inspector.register(intent.asset.r2Key, { sizeBytes: 1024, contentType: 'image/png' });

    await expect(
      service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {})
    ).rejects.toThrow(ApiError);
    await expect(
      service.confirmProjectAssetUpload(ctx, 'proj-1', intent.asset.id, {})
    ).rejects.toThrow('Asset not found');
  });
});
