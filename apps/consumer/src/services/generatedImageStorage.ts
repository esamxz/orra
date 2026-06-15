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
}

export async function storeGeneratedImage(input: StoreGeneratedImageInput): Promise<string> {
  const { workspaceId, projectId, imageBytes, mimeType, cardIndex, r2Bucket, assetRepo } = input;

  const assetUUID = randomUUID();
  const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
  const r2Key = `ws/${workspaceId}/projects/${projectId}/assets/${assetUUID}/generated-bg-${cardIndex}.${ext}`;

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
