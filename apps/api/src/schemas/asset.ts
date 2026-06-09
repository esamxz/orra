import { z } from 'zod';

// ---------------------------------------------------------------------------
// Asset upload route schemas
// ---------------------------------------------------------------------------
// Phase 12A: upload intent foundation.
//
// Supported MIME types: image/png, image/jpeg, image/webp.
// SVG is intentionally disallowed until sanitization exists.
// Max file size: 10 MB.

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const AllowedContentTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type AllowedContentType = (typeof AllowedContentTypes)[number];

export const ContentTypeSchema = z.enum(AllowedContentTypes, {
  message: 'Unsupported content type. Allowed: image/png, image/jpeg, image/webp.',
});

export const FileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
    {
      message: 'File name must not contain path traversal characters.',
    }
  );

// Project asset kinds align with the DB project_assets.kind check constraint.
export const ProjectAssetUploadKindSchema = z.enum(['upload', 'reference'], {
  message: "Project asset kind must be 'upload' or 'reference'.",
});

// Brand asset kinds align with the DB brand_assets.kind check constraint.
export const BrandAssetUploadKindSchema = z.enum(['logo', 'reference'], {
  message: "Brand asset kind must be 'logo' or 'reference'.",
});

export const ProjectUploadIntentBodySchema = z.object({
  fileName: FileNameSchema,
  contentType: ContentTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES, {
    message: `File size must not exceed ${MAX_UPLOAD_SIZE_BYTES} bytes (10 MB).`,
  }),
  kind: ProjectAssetUploadKindSchema,
});

export const BrandUploadIntentBodySchema = z.object({
  fileName: FileNameSchema,
  contentType: ContentTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES, {
    message: `File size must not exceed ${MAX_UPLOAD_SIZE_BYTES} bytes (10 MB).`,
  }),
  kind: BrandAssetUploadKindSchema,
});

// ---------------------------------------------------------------------------
// Upload confirmation schemas
// ---------------------------------------------------------------------------

export const ProjectAssetConfirmParamSchema = z.object({
  projectId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export const BrandAssetConfirmParamSchema = z.object({
  brandSystemId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export const AssetConfirmBodySchema = z.object({
  expectedSizeBytes: z.number().int().positive().optional(),
  expectedContentType: ContentTypeSchema.optional(),
});

export const ProjectIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const BrandSystemIdParamSchema = z.object({
  id: z.string().uuid(),
});
