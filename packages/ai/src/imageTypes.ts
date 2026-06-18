// ---------------------------------------------------------------------------
// Image provider types — Phase 15A
// ---------------------------------------------------------------------------
// These types define the image generation seam. Only FakeImageProvider is
// implemented in Phase 15A. Real provider adapters (FLUX, Gemini Image, etc.)
// come in Phase 15B. Generated image R2 storage and artifact integration come
// in later phases. Image generation is not wired into the generation pipeline yet.

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
  image: Uint8Array;
  mimeType: string;
  mask?: Uint8Array;
  maskMimeType?: string;
  width: number;
  height: number;
  format?: ImageOutputFormat;
  metadata?: Record<string, unknown>;
}

export interface ImageProvider {
  readonly id: string;
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  editImage(request: ImageEditRequest): Promise<ImageGenerationResult>;
}
