import type { AssetRepository } from '@orra/api/src/repositories/assetRepository.js';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Generated image storage — P1
// ---------------------------------------------------------------------------
// Stores AI-generated image bytes in R2 and creates a project asset record.
// Called by MockGenerationConsumer when IMAGE_PROVIDER is a real provider.
//
// On any failure this function throws, which lets the caller propagate the
// error to the job failure path (credits refunded, job marked failed).
// Never silently degrades.

export interface StoreGeneratedImageInput {
  workspaceId: string;
  projectId: string;
  imageBytes: Uint8Array;
  mimeType: string;
  cardIndex: number;
  r2Bucket: R2Bucket;
  assetRepo: AssetRepository;
  sourcePrompt?: string;
}

export interface StoreEditedImageInput {
  workspaceId: string;
  projectId: string;
  imageBytes: Uint8Array;
  mimeType: string;
  cardIndex: number;
  r2Bucket: R2Bucket;
  assetRepo: AssetRepository;
  /** The uploaded asset that was used as the source for this edit. */
  sourceAssetId: string;
  /** Optional source prompt that produced the edit. */
  sourcePrompt?: string;
}

function buildR2Key(
  workspaceId: string,
  projectId: string,
  assetUUID: string,
  prefix: string,
  cardIndex: number,
  ext: string
): string {
  return `ws/${workspaceId}/projects/${projectId}/assets/${assetUUID}/${prefix}-${cardIndex}.${ext}`;
}

export async function storeGeneratedImage(input: StoreGeneratedImageInput): Promise<string> {
  const { workspaceId, projectId, imageBytes, mimeType, cardIndex, r2Bucket, assetRepo, sourcePrompt } = input;

  const assetUUID = randomUUID();
  const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
  const r2Key = buildR2Key(workspaceId, projectId, assetUUID, 'generated-bg', cardIndex, ext);

  // Upload to R2 — throws on failure
  await r2Bucket.put(r2Key, imageBytes, {
    httpMetadata: { contentType: mimeType },
  });

  // Create asset record in DB
  const asset = await assetRepo.createProjectAsset({
    workspaceId,
    projectId,
    kind: 'generated_background',
    r2Key,
    contentType: mimeType,
    sizeBytes: imageBytes.byteLength,
    ...(sourcePrompt !== undefined && { sourcePrompt }),
  });

  // Mark as uploaded (status: pending_upload → uploaded)
  await assetRepo.markProjectAssetUploaded({
    id: asset.id,
    projectId,
    workspaceId,
  });

  console.info('[generated_image_storage]', { assetId: asset.id, cardIndex });

  return asset.id;
}

export async function storeEditedImage(input: StoreEditedImageInput): Promise<string> {
  const { workspaceId, projectId, imageBytes, mimeType, cardIndex, r2Bucket, assetRepo, sourceAssetId, sourcePrompt } = input;

  const assetUUID = randomUUID();
  const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
  const r2Key = buildR2Key(workspaceId, projectId, assetUUID, 'generated-edit', cardIndex, ext);

  // Upload to R2 — throws on failure
  await r2Bucket.put(r2Key, imageBytes, {
    httpMetadata: { contentType: mimeType },
  });

  // Persist source relationship in analysis so downstream code can trace the
  // edited asset back to the original uploaded image without touching it.
  const analysis = {
    generationMode: 'edit_uploaded_image',
    sourceAssetId,
  } as unknown as import('@orra/db').Json;

  // Create asset record in DB
  const asset = await assetRepo.createProjectAsset({
    workspaceId,
    projectId,
    kind: 'generated_edit',
    r2Key,
    contentType: mimeType,
    sizeBytes: imageBytes.byteLength,
    analysis,
    ...(sourcePrompt !== undefined && { sourcePrompt }),
  });

  // Mark as uploaded (status: pending_upload → uploaded)
  await assetRepo.markProjectAssetUploaded({
    id: asset.id,
    projectId,
    workspaceId,
  });

  console.info('[edited_image_storage]', { assetId: asset.id, sourceAssetId, cardIndex });

  return asset.id;
}
