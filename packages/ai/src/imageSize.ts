// ---------------------------------------------------------------------------
// Image request size normalization
// ---------------------------------------------------------------------------
// Maps Orra canvas ratios to provider-specific image generation dimensions.
// Never passes raw ratio numbers (e.g. 4 and 5) as pixel dimensions to a
// provider. For OpenAI Image API we use a small set of well-supported presets.
// An explicit requested size (from OPENAI_IMAGE_SIZE) always wins so operators
// can tune generation speed/cost per environment.

export type ImageSizeProvider = 'openai' | 'gemini' | 'fake';

export interface ImageSizeInput {
  /** Canvas ratio as stored on ArtifactDocument.ratio. */
  ratio: { w: number; h: number };
  /** Optional explicit size override, e.g. "1024x1024". */
  requestedSize?: string;
  /** Target provider. */
  provider: ImageSizeProvider;
}

// Known Orra ratio names map to OpenAI Images API preset sizes.
// For B0.4 we intentionally avoid custom sizes like 1024x1280 and use the
// safer landscape/portrait presets plus 1:1 square.
const OPENAI_PRESETS = {
  square: '1024x1024',
  portrait: '1024x1536',
  landscape: '1536x1024',
};

function aspectRatioName(w: number, h: number): string | null {
  // Tolerances for floating point comparison of common ratios.
  const ratios = [
    { name: '1:1', value: 1 },
    { name: '4:5', value: 4 / 5 },
    { name: '5:4', value: 5 / 4 },
    { name: '3:4', value: 3 / 4 },
    { name: '4:3', value: 4 / 3 },
    { name: '9:16', value: 9 / 16 },
    { name: '16:9', value: 16 / 9 },
  ];
  const r = w / h;
  for (const candidate of ratios) {
    if (Math.abs(r - candidate.value) < 0.02) {
      return candidate.name;
    }
  }
  return null;
}

function isLandscape(w: number, h: number): boolean {
  return w >= h;
}

function resolveOpenAISize(input: ImageSizeInput): string {
  // Explicit environment override always wins.
  if (input.requestedSize) {
    return input.requestedSize;
  }

  const knownName = aspectRatioName(input.ratio.w, input.ratio.h);

  if (knownName === '1:1') {
    return OPENAI_PRESETS.square;
  }

  if (knownName === '5:4' || knownName === '4:3' || knownName === '16:9') {
    return OPENAI_PRESETS.landscape;
  }

  if (knownName === '4:5' || knownName === '3:4' || knownName === '9:16') {
    return OPENAI_PRESETS.portrait;
  }

  // Custom / unknown ratios: prefer the landscape/portrait orientation.
  if (isLandscape(input.ratio.w, input.ratio.h)) {
    return OPENAI_PRESETS.landscape;
  }
  if (input.ratio.w < input.ratio.h) {
    return OPENAI_PRESETS.portrait;
  }
  return OPENAI_PRESETS.square;
}

/**
 * Convert an Orra canvas ratio to a provider-specific image generation size.
 *
 * For OpenAI Image API this returns a preset string like "1024x1536" or an
 * explicit override like "1024x1024". For Gemini/Fake the raw numeric width/height
 * are sufficient, so the helper returns a canonical "WxH" string for
 * observability but callers may ignore it.
 */
export function resolveImageRequestSize(input: ImageSizeInput): string {
  switch (input.provider) {
    case 'openai':
      return resolveOpenAISize(input);
    case 'gemini':
    case 'fake':
    default: {
      if (input.requestedSize) return input.requestedSize;
      const knownName = aspectRatioName(input.ratio.w, input.ratio.h);
      if (knownName === '1:1') return '1024x1024';
      if (knownName === '5:4' || knownName === '4:3' || knownName === '16:9') {
        return '1536x1024';
      }
      // All portrait and unknown ratios map to portrait for Gemini/Fake observability.
      return '1024x1536';
    }
  }
}
