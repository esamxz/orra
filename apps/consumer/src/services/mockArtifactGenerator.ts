import type { ArtifactDocument, Card, Layer, TextLayer, ShapeLayer, OverlayLayer, BrandContextDto } from '@orra/shared';
import { ArtifactDocumentSchema, isSupportedFontFamily } from '@orra/shared';

// ---------------------------------------------------------------------------
// Mock artifact generator
// ---------------------------------------------------------------------------
// Phase 11C: produces a deterministic, valid ArtifactDocument using only
// text, shape, overlay, and baseColor layers. No external image assets.
//
// When brandContext is provided, brand colors and fonts are used where valid.
// Invalid brand colors fall back to the Orra default palette.
// Invalid brand fonts fall back to the Orra default catalog fonts.
//
// The output is visually simple but schema-valid:
//   - one gradient overlay (bottom scrim)
//   - one shape accent
//   - one title text layer
//   - one body text layer
//   - optional per-card index text for carousels
//
// All fonts come from the shared catalog. No AI, no R2, no provider calls.

export interface MockGenerationInput {
  /** The current artifact document to build upon. */
  currentDocument: ArtifactDocument;
  /** Number of cards to produce. For posts this is 1. For carousels it
   *  comes from the approval plan or defaults to the current card count
   *  (minimum 3 if the document has only 1 empty card). */
  targetCardCount?: number;
  /** Optional topic extracted from the approval plan for mock copy. */
  topic?: string | null;
  /** Optional brand context to influence colors and fonts. */
  brandContext?: BrandContextDto | null;
}

const ORRA_PALETTE = ['#1d2a30', '#354e53', '#5e7680', '#a4b7bd', '#c8d1d8'];

const DEFAULT_TITLE_FONT = 'Newsreader';
const DEFAULT_BODY_FONT = 'Inter';
const DEFAULT_ACCENT_FONT = 'Space Grotesk';

const DEFAULT_TITLE_COLOR = '#c8d1d8';
const DEFAULT_BODY_COLOR = '#a4b7bd';
const DEFAULT_SHAPE_COLOR = '#a4b7bd';
const DEFAULT_OVERLAY_START = '#1d2a30';
const DEFAULT_OVERLAY_END = '#354e53';

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function isValidHexColor(color: string | undefined): color is string {
  return typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color);
}

function pickBaseColor(index: number, brandContext?: BrandContextDto | null): string {
  if (brandContext?.colors?.background && isValidHexColor(brandContext.colors.background)) {
    return brandContext.colors.background;
  }
  if (brandContext?.colors?.primary && isValidHexColor(brandContext.colors.primary)) {
    return brandContext.colors.primary;
  }
  return ORRA_PALETTE[index % ORRA_PALETTE.length];
}

function pickTitleColor(brandContext?: BrandContextDto | null): string {
  if (brandContext?.colors?.text && isValidHexColor(brandContext.colors.text)) {
    return brandContext.colors.text;
  }
  return DEFAULT_TITLE_COLOR;
}

function pickBodyColor(brandContext?: BrandContextDto | null): string {
  if (brandContext?.colors?.text && isValidHexColor(brandContext.colors.text)) {
    // Slightly muted version of text color for body
    return brandContext.colors.text;
  }
  return DEFAULT_BODY_COLOR;
}

function pickShapeColor(brandContext?: BrandContextDto | null): string {
  if (brandContext?.colors?.accent && isValidHexColor(brandContext.colors.accent)) {
    return brandContext.colors.accent;
  }
  if (brandContext?.colors?.secondary && isValidHexColor(brandContext.colors.secondary)) {
    return brandContext.colors.secondary;
  }
  return DEFAULT_SHAPE_COLOR;
}

function pickOverlayStops(brandContext?: BrandContextDto | null): [string, string] {
  const start =
    brandContext?.colors?.background && isValidHexColor(brandContext.colors.background)
      ? brandContext.colors.background
      : DEFAULT_OVERLAY_START;
  const end =
    brandContext?.colors?.primary && isValidHexColor(brandContext.colors.primary)
      ? brandContext.colors.primary
      : DEFAULT_OVERLAY_END;
  return [start, end];
}

// ---------------------------------------------------------------------------
// Font helpers
// ---------------------------------------------------------------------------

function pickTitleFont(brandContext?: BrandContextDto | null): string {
  const font = brandContext?.typography?.headingFont;
  if (font && isSupportedFontFamily(font)) {
    return font;
  }
  return DEFAULT_TITLE_FONT;
}

function pickBodyFont(brandContext?: BrandContextDto | null): string {
  const font = brandContext?.typography?.bodyFont;
  if (font && isSupportedFontFamily(font)) {
    return font;
  }
  return DEFAULT_BODY_FONT;
}

function pickAccentFont(brandContext?: BrandContextDto | null): string {
  // Accent font falls back to heading font if valid, then default accent
  const font = brandContext?.typography?.headingFont;
  if (font && isSupportedFontFamily(font)) {
    return font;
  }
  return DEFAULT_ACCENT_FONT;
}

// ---------------------------------------------------------------------------
// Layer builders
// ---------------------------------------------------------------------------

function randomUUID(): string {
  return crypto.randomUUID();
}

function makeOverlayLayer(z: number, cardH: number, brandContext?: BrandContextDto | null): OverlayLayer {
  const [start, end] = pickOverlayStops(brandContext);
  return {
    id: randomUUID(),
    type: 'overlay',
    z,
    x: 0,
    y: Math.round(cardH * 0.55),
    w: 1080,
    h: Math.round(cardH * 0.45),
    rotation: 0,
    opacity: 0.35,
    locked: false,
    hidden: false,
    overlayKind: 'linearGradient',
    params: {
      stops: [
        { offset: 0, color: start },
        { offset: 1, color: end },
      ],
      angle: 180,
    },
  };
}

function makeShapeAccent(z: number, brandContext?: BrandContextDto | null): ShapeLayer {
  return {
    id: randomUUID(),
    type: 'shape',
    z,
    x: 60,
    y: 60,
    w: 80,
    h: 6,
    rotation: 0,
    opacity: 0.9,
    locked: false,
    hidden: false,
    shapeKind: 'rect',
    fill: pickShapeColor(brandContext),
    cornerRadius: 3,
  };
}

function makeTitleText(z: number, cardW: number, topic?: string | null, brandContext?: BrandContextDto | null): TextLayer {
  const content = topic ? `Mock: ${topic}` : 'Mock Generation';
  return {
    id: randomUUID(),
    type: 'text',
    z,
    x: 60,
    y: 140,
    w: cardW - 120,
    h: 200,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    content,
    fontFamily: pickTitleFont(brandContext),
    fontSize: 72,
    fontWeight: 400,
    lineHeight: 1.15,
    letterSpacing: 0,
    color: pickTitleColor(brandContext),
    align: 'left',
    role: 'title',
  };
}

function makeBodyText(z: number, cardW: number, brandContext?: BrandContextDto | null): TextLayer {
  return {
    id: randomUUID(),
    type: 'text',
    z,
    x: 60,
    y: 380,
    w: cardW - 120,
    h: 300,
    rotation: 0,
    opacity: 0.85,
    locked: false,
    hidden: false,
    content: 'This is a placeholder generated by the mock consumer. No AI or image assets were used. Text remains fully editable.',
    fontFamily: pickBodyFont(brandContext),
    fontSize: 24,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0.2,
    color: pickBodyColor(brandContext),
    align: 'left',
    role: 'body',
  };
}

function makeIndexText(z: number, cardW: number, cardH: number, index: number, total: number, brandContext?: BrandContextDto | null): TextLayer {
  return {
    id: randomUUID(),
    type: 'text',
    z,
    x: cardW - 120,
    y: cardH - 80,
    w: 100,
    h: 40,
    rotation: 0,
    opacity: 0.6,
    locked: false,
    hidden: false,
    content: `${index + 1} / ${total}`,
    fontFamily: pickAccentFont(brandContext),
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: 1,
    color: pickTitleColor(brandContext),
    align: 'right',
    role: 'caption',
  };
}

function buildMockCard(
  index: number,
  total: number,
  ratioW: number,
  ratioH: number,
  topic?: string | null,
  brandContext?: BrandContextDto | null
): Card {
  const layers: Layer[] = [];

  // z=0: gradient overlay scrim at bottom
  layers.push(makeOverlayLayer(0, ratioH, brandContext));

  // z=1: shape accent bar
  layers.push(makeShapeAccent(1, brandContext));

  // z=2: title text
  layers.push(makeTitleText(2, ratioW, topic, brandContext));

  // z=3: body text
  layers.push(makeBodyText(3, ratioW, brandContext));

  // z=4: index text only for carousel with >1 card
  if (total > 1) {
    layers.push(makeIndexText(4, ratioW, ratioH, index, total, brandContext));
  }

  return {
    id: randomUUID(),
    index,
    baseColor: pickBaseColor(index, brandContext),
    layers,
  };
}

/**
 * Produce a deterministic mock ArtifactDocument update.
 *
 * Rules:
 * - Preserves artifactId, type, ratio.
 * - Increments document.version by 1.
 * - Produces the target number of cards (default: keep current count, min 3 for carousel).
 * - Only text, shape, overlay layers. No image-backed layers.
 * - All fonts are catalog-valid.
 * - Brand context influences colors and fonts when provided and valid.
 */
export function generateMockArtifactDocument(input: MockGenerationInput): ArtifactDocument {
  const doc = input.currentDocument;

  const isCarousel = doc.type === 'carousel';
  const currentCount = doc.cards.length;

  let targetCount: number;
  if (input.targetCardCount !== undefined && input.targetCardCount > 0) {
    targetCount = input.targetCardCount;
  } else if (isCarousel) {
    targetCount = Math.max(currentCount, 3);
  } else {
    targetCount = 1;
  }

  const cards: Card[] = [];
  for (let i = 0; i < targetCount; i++) {
    cards.push(buildMockCard(i, targetCount, doc.ratio.w, doc.ratio.h, input.topic, input.brandContext));
  }

  const generated: ArtifactDocument = {
    schemaVersion: doc.schemaVersion,
    artifactId: doc.artifactId,
    type: doc.type,
    ratio: doc.ratio,
    cards,
    version: doc.version + 1,
  };

  // Defensive validation: if this fails, the generator has a bug.
  const parsed = ArtifactDocumentSchema.safeParse(generated);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Mock artifact document failed validation: ${issues}`);
  }

  return parsed.data;
}
