import { describe, it, expect, vi } from 'vitest';
import { storeGeneratedImage } from '../services/generatedImageStorage.js';
import type { StoreGeneratedImageInput } from '../services/generatedImageStorage.js';
import type { AssetRepository } from '@orra/api/src/repositories/assetRepository.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IMAGE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
const MIME_TYPE = 'image/png';

function makeAssetRecord(id: string) {
  return {
    id,
    workspace_id: 'ws-1',
    project_id: 'proj-1',
    kind: 'generated_background' as const,
    r2_key: 'ws/ws-1/projects/proj-1/assets/uuid/generated-bg-0.png',
    content_type: MIME_TYPE,
    size_bytes: IMAGE_BYTES.byteLength,
    status: 'pending_upload' as const,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    original_filename: null,
  };
}

function makeInput(overrides: Partial<StoreGeneratedImageInput> = {}): StoreGeneratedImageInput {
  const r2Bucket = {
    put: vi.fn().mockResolvedValue(undefined),
  } as unknown as R2Bucket;

  const assetRecord = makeAssetRecord('asset-uuid-1');
  const assetRepo = {
    createProjectAsset: vi.fn().mockResolvedValue(assetRecord),
    markProjectAssetUploaded: vi.fn().mockResolvedValue({ ...assetRecord, status: 'uploaded' }),
  } as never;

  return {
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    imageBytes: IMAGE_BYTES,
    mimeType: MIME_TYPE,
    cardIndex: 0,
    r2Bucket,
    assetRepo,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('storeGeneratedImage', () => {
  it('calls r2Bucket.put with the correct key, bytes, and contentType', async () => {
    const input = makeInput();
    await storeGeneratedImage(input);

    expect(input.r2Bucket.put).toHaveBeenCalledOnce();
    const [key, bytes, opts] = (input.r2Bucket.put as ReturnType<typeof vi.fn>).mock.calls[0];

    // Key format: ws/{workspaceId}/projects/{projectId}/assets/{uuid}/generated-bg-{cardIndex}.png
    expect(key).toMatch(/^ws\/ws-1\/projects\/proj-1\/assets\/[0-9a-f-]+\/generated-bg-0\.png$/);
    expect(bytes).toBe(IMAGE_BYTES);
    expect(opts.httpMetadata.contentType).toBe(MIME_TYPE);
  });

  it('creates an asset record then marks it uploaded — returns the assetId', async () => {
    const input = makeInput();
    const assetId = await storeGeneratedImage(input);

    expect(input.assetRepo.createProjectAsset).toHaveBeenCalledOnce();
    const createArgs = (input.assetRepo.createProjectAsset as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArgs.workspaceId).toBe('ws-1');
    expect(createArgs.projectId).toBe('proj-1');
    expect(createArgs.kind).toBe('generated_background');
    expect(createArgs.contentType).toBe(MIME_TYPE);
    expect(createArgs.sizeBytes).toBe(IMAGE_BYTES.byteLength);
    // r2Key must not be empty and must not be logged differently
    expect(typeof createArgs.r2Key).toBe('string');
    expect(createArgs.r2Key.length).toBeGreaterThan(0);

    expect(input.assetRepo.markProjectAssetUploaded).toHaveBeenCalledOnce();
    const markArgs = (input.assetRepo.markProjectAssetUploaded as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(markArgs.id).toBe('asset-uuid-1');

    expect(assetId).toBe('asset-uuid-1');
  });

  it('uses .jpeg extension for jpeg mimeType', async () => {
    const input = makeInput({ mimeType: 'image/jpeg' });
    await storeGeneratedImage(input);

    const [key] = (input.r2Bucket.put as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(key).toMatch(/\.jpg$/);
  });

  it('throws when r2Bucket.put fails — no asset record created', async () => {
    const r2Bucket = {
      put: vi.fn().mockRejectedValue(new Error('R2 connection refused')),
    } as unknown as R2Bucket;

    const assetRepo = {
      createProjectAsset: vi.fn(),
      markProjectAssetUploaded: vi.fn(),
    } as unknown as AssetRepository;

    const input = makeInput({ r2Bucket, assetRepo });

    await expect(storeGeneratedImage(input)).rejects.toThrow('R2 connection refused');
    expect((assetRepo as unknown as { createProjectAsset: ReturnType<typeof vi.fn> }).createProjectAsset).not.toHaveBeenCalled();
  });

  it('throws when createProjectAsset fails — after r2 upload already succeeded', async () => {
    const r2Bucket = {
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as R2Bucket;

    const assetRepo = {
      createProjectAsset: vi.fn().mockRejectedValue(new Error('DB insert failed')),
      markProjectAssetUploaded: vi.fn(),
    } as unknown as AssetRepository;

    const input = makeInput({ r2Bucket, assetRepo });

    await expect(storeGeneratedImage(input)).rejects.toThrow('DB insert failed');
    // R2 was called (upload succeeded)
    expect(r2Bucket.put).toHaveBeenCalledOnce();
    // markProjectAssetUploaded never reached
    expect((assetRepo as unknown as { markProjectAssetUploaded: ReturnType<typeof vi.fn> }).markProjectAssetUploaded).not.toHaveBeenCalled();
  });
});
