import type { SourceImageInput } from './types.js';

// ---------------------------------------------------------------------------
// Image provider types — Phase 16A
// ---------------------------------------------------------------------------
// These types define the image generation and editing seam. Image generation is
// text-to-image; image editing is image-to-image using one or more source
// assets. Both return the same ImageGenerationResult shape.

export type ImageGenerationKind = 'background' | 'object' | 'reference' | 'unknown';

export type ImageOutputFormat = 'png' | 'jpeg' | 'webp';

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  kind?: ImageGenerationKind;
  width: number;
  height: number;
  /** Optional explicit size override for providers that require a size string. */
  size?: string;
  format?: ImageOutputFormat;
  transparentBackground?: boolean;
  seed?: number;
  style?: string;
  quality?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageGenerationResult {
  provider: string;
  model: string;
  mimeType: string;
  width: number;
  height: number;
  data: Uint8Array;
  seed?: number;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

export interface ImageEditRequest {
  prompt: string;
  /** One or more source images to edit. The first image is the primary subject. */
  sourceImages: SourceImageInput[];
  width: number;
  height: number;
  size?: string;
  format?: ImageOutputFormat;
  quality?: string;
  /** Optional mask image for inpainting/region edits. */
  mask?: SourceImageInput | null;
  metadata?: Record<string, unknown>;
}

export interface ImageProvider {
  readonly id: string;
  /** Text-to-image generation. */
  generateFromText(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  /** Image-to-image editing using source images. */
  editImage(request: ImageEditRequest): Promise<ImageGenerationResult>;
}
