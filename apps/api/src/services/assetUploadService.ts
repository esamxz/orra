import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { AssetRepository } from '../repositories/assetRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import type { R2Signer } from '../r2/r2Signer.js';
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
  createdAt: string;
}

export interface UploadIntentResponse {
  asset: AssetDto;
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
    createdAt: row.created_at,
  };
}

export class AssetUploadService {
  constructor(
    private assetRepo: AssetRepository,
    private projectRepo: ProjectRepository,
    private brandSystemRepo: BrandSystemRepository,
    private r2Signer: R2Signer
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
      asset: mapProjectAssetRowToDto(row, input.fileName),
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
      asset: mapBrandAssetRowToDto(row, input.fileName),
      upload: {
        method: 'PUT',
        url: upload.url,
        headers: upload.headers,
        expiresAt: upload.expiresAt,
      },
    };
  }
}
