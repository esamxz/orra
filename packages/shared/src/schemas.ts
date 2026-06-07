import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const RatioNameSchema = z.enum(['1:1', '4:5', '9:16', '16:9', 'custom']);

export const RatioSchema = z.object({
  name: RatioNameSchema,
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

export const BoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

export const CropSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

// ---------------------------------------------------------------------------
// Anchor (reflow hint for ratio changes)
// ---------------------------------------------------------------------------

export const AnchorSchema = z.object({
  x: z.enum(['left', 'center', 'right']),
  y: z.enum(['top', 'center', 'bottom']),
});

// ---------------------------------------------------------------------------
// Layer base
// ---------------------------------------------------------------------------

export const BaseLayerSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  z: z.number().int(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  anchor: AnchorSchema.optional(),
});

// ---------------------------------------------------------------------------
// Text layer (the only text type)
// ---------------------------------------------------------------------------

export const TextLayerSchema = BaseLayerSchema.extend({
  type: z.literal('text'),
  content: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  fontWeight: z.number().min(100).max(900),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  align: z.enum(['left', 'center', 'right']),
  role: z.enum(['title', 'body', 'accent', 'caption', 'custom']).optional(),
});

// ---------------------------------------------------------------------------
// Image-backed layers
// ---------------------------------------------------------------------------

export const ImageBackedBaseSchema = BaseLayerSchema.extend({
  assetId: z.string().uuid(),
  fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  crop: CropSchema.optional(),
  sourcePrompt: z.string().optional(),
});

export const BackgroundLayerSchema = ImageBackedBaseSchema.extend({
  type: z.literal('background'),
});

export const ImageLayerSchema = ImageBackedBaseSchema.extend({
  type: z.literal('image'),
});

export const ObjectLayerSchema = ImageBackedBaseSchema.extend({
  type: z.literal('object'),
  aiManaged: z.literal(true).default(true),
  regionOrigin: BoxSchema.optional(),
});

export const LogoLayerSchema = ImageBackedBaseSchema.extend({
  type: z.literal('logo'),
  aiManaged: z.literal(false),
});

// ---------------------------------------------------------------------------
// Shape layer
// ---------------------------------------------------------------------------

export const ShapeLayerSchema = BaseLayerSchema.extend({
  type: z.literal('shape'),
  shapeKind: z.enum(['rect', 'ellipse', 'line']),
  fill: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  stroke: z.object({
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    width: z.number().positive(),
  }).optional(),
  cornerRadius: z.number().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// Overlay layer
// ---------------------------------------------------------------------------

export const OverlayLayerSchema = BaseLayerSchema.extend({
  type: z.literal('overlay'),
  overlayKind: z.enum(['linearGradient', 'radialGradient', 'solid', 'blur']),
  params: z.object({
    stops: z.array(z.object({
      offset: z.number().min(0).max(1),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    })).optional(),
    angle: z.number().optional(),
    blurRadius: z.number().positive().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  }),
});

// ---------------------------------------------------------------------------
// Layer union
// ---------------------------------------------------------------------------

export const LayerSchema = z.discriminatedUnion('type', [
  BackgroundLayerSchema,
  ImageLayerSchema,
  ObjectLayerSchema,
  LogoLayerSchema,
  TextLayerSchema,
  ShapeLayerSchema,
  OverlayLayerSchema,
]);

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export const CardSchema = z.object({
  id: z.string().uuid(),
  index: z.number().int().nonnegative(),
  baseColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  layers: z.array(LayerSchema),
});

// ---------------------------------------------------------------------------
// ArtifactDocument
// ---------------------------------------------------------------------------

export const ArtifactDocumentSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  artifactId: z.string().uuid(),
  type: z.enum(['post', 'carousel']),
  ratio: RatioSchema,
  cards: z.array(CardSchema).min(1),
  version: z.number().int().nonnegative().default(0),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type RatioName = z.infer<typeof RatioNameSchema>;
export type Ratio = z.infer<typeof RatioSchema>;
export type Box = z.infer<typeof BoxSchema>;
export type Crop = z.infer<typeof CropSchema>;
export type Anchor = z.infer<typeof AnchorSchema>;
export type BaseLayer = z.infer<typeof BaseLayerSchema>;
export type TextLayer = z.infer<typeof TextLayerSchema>;
export type BackgroundLayer = z.infer<typeof BackgroundLayerSchema>;
export type ImageLayer = z.infer<typeof ImageLayerSchema>;
export type ObjectLayer = z.infer<typeof ObjectLayerSchema>;
export type LogoLayer = z.infer<typeof LogoLayerSchema>;
export type ShapeLayer = z.infer<typeof ShapeLayerSchema>;
export type OverlayLayer = z.infer<typeof OverlayLayerSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type Card = z.infer<typeof CardSchema>;
export type ArtifactDocument = z.infer<typeof ArtifactDocumentSchema>;
