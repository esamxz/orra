import { z } from 'zod';

// ---------------------------------------------------------------------------
// Brand system route schemas
// ---------------------------------------------------------------------------

const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #1d2a30)');

export const BrandColorsSchema = z.object({
  primary: HexColorSchema.optional(),
  secondary: HexColorSchema.optional(),
  accent: HexColorSchema.optional(),
  background: HexColorSchema.optional(),
  text: HexColorSchema.optional(),
}).optional();

export const BrandTypographySchema = z.object({
  preset: z.string().trim().max(60).optional(),
  headingFont: z.string().trim().max(60).optional(),
  bodyFont: z.string().trim().max(60).optional(),
  titleFont: z.string().trim().max(60).optional(),
  titleWeight: z.number().int().min(100).max(900).optional(),
  bodyWeight: z.number().int().min(100).max(900).optional(),
  accentFont: z.string().trim().max(60).optional(),
  accentWeight: z.number().int().min(100).max(900).optional(),
  captionFont: z.string().trim().max(60).optional(),
  captionWeight: z.number().int().min(100).max(900).optional(),
  notes: z.string().trim().max(500).optional(),
}).optional();

export const CreateBrandSystemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  tone: z.string().trim().max(1000).optional(),
  visualDirection: z.string().trim().max(1000).optional(),
  rules: z.string().trim().max(1000).optional(),
  colors: BrandColorsSchema,
  typography: BrandTypographySchema,
  logoAssetId: z.string().uuid().nullable().optional(),
});

export const UpdateBrandSystemSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  tone: z.string().trim().max(1000).optional(),
  visualDirection: z.string().trim().max(1000).optional(),
  rules: z.string().trim().max(1000).optional(),
  colors: BrandColorsSchema,
  typography: BrandTypographySchema,
  logoAssetId: z.string().uuid().nullable().optional(),
});

export const ListBrandSystemsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  search: z.string().trim().max(120).optional(),
});

export const BrandSystemIdParamSchema = z.object({
  id: z.string().uuid(),
});
