import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { AssetRepository } from '../repositories/assetRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import type { R2Signer } from '../r2/r2Signer.js';
import type { R2ObjectInspector } from '../r2/r2ObjectInspector.js';
import type { ProjectAssetKind, BrandAssetKind } from '@orra/db';

// ---------------------------------------------------------------------------
// Asset upload service
// ---------------------------------------------------------------------------
// Business logic for upload intents.
//
// Responsibilities:
//   - verify ownership of project / brand system
//   - generate a server-owned R2 object key
//   - create a pending asset metadata row
//   - request a signed upload URL from the R2 signer
//   - return the asset DTO + upload instructions
//
// Phase 12A does not confirm uploads. A future phase will add:
//   - POST /assets/:id/confirm   (client says "I uploaded it")
//   - markUploaded               (update metadata with dimensions, hash, etc.)

export interface ProjectUploadIntentRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: ProjectAssetKind;
}

export interface BrandUploadIntentRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: BrandAssetKind;
}

// Internal DTO — includes r2Key for service-layer pipeline use (signing, inspection, etc.)
// Never returned to clients directly.
export interface AssetDto {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  brandSystemId?: string | null;
  kind: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  r2Key: string;
  status: string;
  createdAt: string;
}

// Public client-facing DTO — storage internals omitted.
export interface SafeAssetDto {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  brandSystemId?: string | null;
  kind: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  status: string;
  createdAt: string;
}

export interface UploadIntentResponse {
  asset: SafeAssetDto;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
}

const UPLOAD_EXPIRY_SECONDS = 300; // 5 minutes

/**
 * Sanitize a user-provided file name so it is safe to embed in an R2 key.
 *
 * Rules:
 *   - strip path traversal segments (../, ./)
 *   - replace spaces with hyphens
 *   - keep only [a-zA-Z0-9._-]
 *   - collapse multiple dots
 *   - never return an empty string
 */
export function sanitizeFileName(fileName: string): string {
  // First, strip any directory path segments.
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? '';

  // Replace spaces with hyphens.
  let safe = base.replace(/\s+/g, '-');

  // Keep only safe characters.
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, '');

  // Collapse multiple dots to a single dot.
  safe = safe.replace(/\.{2,}/g, '.');

  // Ensure it is not empty; fall back to 'asset'.
  if (!safe || safe === '.') {
    safe = 'asset';
  }

  return safe;
}

function generateProjectAssetKey(
  workspaceId: string,
  projectId: string,
  assetId: string,
  fileName: string
): string {
  const safeName = sanitizeFileName(fileName);
  return `workspace/${workspaceId}/projects/${projectId}/assets/${assetId}/${safeName}`;
}

function generateBrandAssetKey(
  workspaceId: string,
  brandSystemId: string,
  assetId: string,
  fileName: string
): string {
  const safeName = sanitizeFileName(fileName);
  return `workspace/${workspaceId}/brands/${brandSystemId}/assets/${assetId}/${safeName}`;
}

function mapProjectAssetRowToDto(
  row: import('@orra/db').ProjectAssetRow,
  fileName: string
): AssetDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    brandSystemId: null,
    kind: row.kind,
    fileName,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    r2Key: row.r2_key,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapBrandAssetRowToDto(
  row: import('@orra/db').BrandAssetRow,
  fileName: string
): AssetDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: null,
    brandSystemId: row.brand_system_id,
    kind: row.kind,
    fileName,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    r2Key: row.r2_key,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toSafeAssetDto(dto: AssetDto): SafeAssetDto {
  const { r2Key: _r2Key, ...safe } = dto;
  return safe;
}

export interface AssetConfirmInput {
  expectedSizeBytes?: number;
  expectedContentType?: string;
}

export interface AssetPreviewInfo {
  method: 'GET';
  url: string;
  expiresAt: string;
}

export interface AssetPreviewUrlResponse {
  asset: SafeAssetDto;
  preview: AssetPreviewInfo;
}

const PREVIEW_EXPIRY_SECONDS = 300; // 5 minutes

export class AssetUploadService {
  constructor(
    private assetRepo: AssetRepository,
    private projectRepo: ProjectRepository,
    private brandSystemRepo: BrandSystemRepository,
    private r2Signer: R2Signer,
    private r2Inspector?: R2ObjectInspector
  ) {}

  async createProjectUploadIntent(
    ctx: ServiceContext,
    projectId: string,
    input: ProjectUploadIntentRequest
  ): Promise<UploadIntentResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the project exists in this workspace.
    const project = await this.projectRepo.findByIdForWorkspace({
      id: projectId,
      workspaceId,
    });

    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    const r2Key = generateProjectAssetKey(workspaceId, projectId, crypto.randomUUID(), input.fileName);

    const row = await this.assetRepo.createProjectAsset({
      workspaceId,
      projectId,
      kind: input.kind,
      r2Key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });

    const upload = await this.r2Signer.createUploadUrl(
      r2Key,
      input.contentType,
      UPLOAD_EXPIRY_SECONDS
    );

    return {
      asset: toSafeAssetDto(mapProjectAssetRowToDto(row, input.fileName)),
      upload: {
        method: 'PUT',
        url: upload.url,
        headers: upload.headers,
        expiresAt: upload.expiresAt,
      },
    };
  }

  async createBrandUploadIntent(
    ctx: ServiceContext,
    brandSystemId: string,
    input: BrandUploadIntentRequest
  ): Promise<UploadIntentResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the brand system exists in this workspace.
    const brand = await this.brandSystemRepo.findByIdForWorkspace({
      id: brandSystemId,
      workspaceId,
    });

    if (!brand) {
      throw new ApiError('NOT_FOUND', 'Brand system not found.');
    }

    const r2Key = generateBrandAssetKey(workspaceId, brandSystemId, crypto.randomUUID(), input.fileName);

    const row = await this.assetRepo.createBrandAsset({
      workspaceId,
      brandSystemId,
      kind: input.kind,
      r2Key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });

    const upload = await this.r2Signer.createUploadUrl(
      r2Key,
      input.contentType,
      UPLOAD_EXPIRY_SECONDS
    );

    return {
      asset: toSafeAssetDto(mapBrandAssetRowToDto(row, input.fileName)),
      upload: {
        method: 'PUT',
        url: upload.url,
        headers: upload.headers,
        expiresAt: upload.expiresAt,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Upload confirmation
  // ---------------------------------------------------------------------------

  async confirmProjectAssetUpload(
    ctx: ServiceContext,
    projectId: string,
    assetId: string,
    input: AssetConfirmInput
  ): Promise<SafeAssetDto> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const asset = await this.assetRepo.findProjectAssetForWorkspace({
      id: assetId,
      projectId,
      workspaceId,
    });

    if (!asset) {
      throw new ApiError('NOT_FOUND', 'Asset not found.');
    }

    // Idempotent: already uploaded
    if (asset.status === 'uploaded') {
      return toSafeAssetDto(mapProjectAssetRowToDto(asset, extractFileNameFromR2Key(asset.r2_key)));
    }

    // Verify object exists in R2
    if (this.r2Inspector) {
      const meta = await this.r2Inspector.headObject(asset.r2_key);
      if (!meta.exists) {
        throw new ApiError('VALIDATION', 'Upload not found in storage. Please upload the file first.');
      }

      if (input.expectedSizeBytes !== undefined && meta.sizeBytes !== undefined) {
        if (meta.sizeBytes !== input.expectedSizeBytes) {
          throw new ApiError(
            'VALIDATION',
            `Size mismatch: expected ${input.expectedSizeBytes} bytes, but storage reports ${meta.sizeBytes} bytes.`
          );
        }
      }

      if (input.expectedContentType !== undefined && meta.contentType !== undefined) {
        if (meta.contentType !== input.expectedContentType) {
          throw new ApiError(
            'VALIDATION',
            `Content type mismatch: expected ${input.expectedContentType}, but storage reports ${meta.contentType}.`
          );
        }
      }
    }

    const updated = await this.assetRepo.markProjectAssetUploaded({
      id: assetId,
      projectId,
      workspaceId,
      sizeBytes: input.expectedSizeBytes ?? asset.size_bytes,
      contentType: input.expectedContentType ?? asset.content_type,
    });

    if (!updated) {
      throw new ApiError('NOT_FOUND', 'Asset not found during confirmation.');
    }

    return toSafeAssetDto(mapProjectAssetRowToDto(updated, extractFileNameFromR2Key(updated.r2_key)));
  }

  async confirmBrandAssetUpload(
    ctx: ServiceContext,
    brandSystemId: string,
    assetId: string,
    input: AssetConfirmInput
  ): Promise<SafeAssetDto> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const asset = await this.assetRepo.findBrandAssetForWorkspace({
      id: assetId,
      brandSystemId,
      workspaceId,
    });

    if (!asset) {
      throw new ApiError('NOT_FOUND', 'Asset not found.');
    }

    // Idempotent: already uploaded
    if (asset.status === 'uploaded') {
      return toSafeAssetDto(mapBrandAssetRowToDto(asset, extractFileNameFromR2Key(asset.r2_key)));
    }

    // Verify object exists in R2
    if (this.r2Inspector) {
      const meta = await this.r2Inspector.headObject(asset.r2_key);
      if (!meta.exists) {
        throw new ApiError('VALIDATION', 'Upload not found in storage. Please upload the file first.');
      }

      if (input.expectedSizeBytes !== undefined && meta.sizeBytes !== undefined) {
        if (meta.sizeBytes !== input.expectedSizeBytes) {
          throw new ApiError(
            'VALIDATION',
            `Size mismatch: expected ${input.expectedSizeBytes} bytes, but storage reports ${meta.sizeBytes} bytes.`
          );
        }
      }

      if (input.expectedContentType !== undefined && meta.contentType !== undefined) {
        if (meta.contentType !== input.expectedContentType) {
          throw new ApiError(
            'VALIDATION',
            `Content type mismatch: expected ${input.expectedContentType}, but storage reports ${meta.contentType}.`
          );
        }
      }
    }

    const updated = await this.assetRepo.markBrandAssetUploaded({
      id: assetId,
      brandSystemId,
      workspaceId,
      sizeBytes: input.expectedSizeBytes ?? asset.size_bytes,
      contentType: input.expectedContentType ?? asset.content_type,
    });

    if (!updated) {
      throw new ApiError('NOT_FOUND', 'Asset not found during confirmation.');
    }

    return toSafeAssetDto(mapBrandAssetRowToDto(updated, extractFileNameFromR2Key(updated.r2_key)));
  }

  // ---------------------------------------------------------------------------
  // Asset listing
  // ---------------------------------------------------------------------------

  async listProjectAssets(
    ctx: ServiceContext,
    projectId: string
  ): Promise<SafeAssetDto[]> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify project exists in workspace
    const project = await this.projectRepo.findByIdForWorkspace({
      id: projectId,
      workspaceId,
    });
    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    const rows = await this.assetRepo.listProjectAssets({ projectId, workspaceId });
    return rows.map((row) => toSafeAssetDto(mapProjectAssetRowToDto(row, extractFileNameFromR2Key(row.r2_key))));
  }

  async listBrandAssets(
    ctx: ServiceContext,
    brandSystemId: string
  ): Promise<SafeAssetDto[]> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify brand system exists in workspace
    const brand = await this.brandSystemRepo.findByIdForWorkspace({
      id: brandSystemId,
      workspaceId,
    });
    if (!brand) {
      throw new ApiError('NOT_FOUND', 'Brand system not found.');
    }

    const rows = await this.assetRepo.listBrandAssets({ brandSystemId, workspaceId });
    return rows.map((row) => toSafeAssetDto(mapBrandAssetRowToDto(row, extractFileNameFromR2Key(row.r2_key))));
  }

  // ---------------------------------------------------------------------------
  // Preview URL generation
  // ---------------------------------------------------------------------------

  async createProjectAssetPreviewUrl(
    ctx: ServiceContext,
    projectId: string,
    assetId: string
  ): Promise<AssetPreviewUrlResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const asset = await this.assetRepo.findProjectAssetForWorkspace({
      id: assetId,
      projectId,
      workspaceId,
    });

    if (!asset) {
      throw new ApiError('NOT_FOUND', 'Asset not found.');
    }

    if (asset.status !== 'uploaded') {
      throw new ApiError(
        'VALIDATION',
        'Preview is only available for uploaded assets. Please confirm the upload first.'
      );
    }

    const readUrl = await this.r2Signer.createReadUrl(asset.r2_key, PREVIEW_EXPIRY_SECONDS);

    return {
      asset: toSafeAssetDto(mapProjectAssetRowToDto(asset, extractFileNameFromR2Key(asset.r2_key))),
      preview: {
        method: 'GET',
        url: readUrl.url,
        expiresAt: readUrl.expiresAt,
      },
    };
  }

  async createBrandAssetPreviewUrl(
    ctx: ServiceContext,
    brandSystemId: string,
    assetId: string
  ): Promise<AssetPreviewUrlResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const asset = await this.assetRepo.findBrandAssetForWorkspace({
      id: assetId,
      brandSystemId,
      workspaceId,
    });

    if (!asset) {
      throw new ApiError('NOT_FOUND', 'Asset not found.');
    }

    if (asset.status !== 'uploaded') {
      throw new ApiError(
        'VALIDATION',
        'Preview is only available for uploaded assets. Please confirm the upload first.'
      );
    }

    const readUrl = await this.r2Signer.createReadUrl(asset.r2_key, PREVIEW_EXPIRY_SECONDS);

    return {
      asset: toSafeAssetDto(mapBrandAssetRowToDto(asset, extractFileNameFromR2Key(asset.r2_key))),
      preview: {
        method: 'GET',
        url: readUrl.url,
        expiresAt: readUrl.expiresAt,
      },
    };
  }
}

function extractFileNameFromR2Key(r2Key: string): string {
  const lastSlash = r2Key.lastIndexOf('/');
  return lastSlash >= 0 ? r2Key.slice(lastSlash + 1) : r2Key;
}
