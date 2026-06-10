import type { ArtifactDocument, Card, Layer, TextLayer, ShapeLayer, OverlayLayer, BrandContextDto } from '@orra/shared';
import { ArtifactDocumentSchema, isSupportedFontFamily } from '@orra/shared';
import type { TextPlanResult } from '@orra/ai';

// ---------------------------------------------------------------------------
// Plan-driven artifact generator
// ---------------------------------------------------------------------------
// Phase 11C: produces a deterministic, valid ArtifactDocument using only
// text, shape, overlay, and baseColor layers. No external image assets.
//
// Phase 14A: refactored to accept the full TextPlanResult directly. The AI
// plan now drives all text content — title, body, and per-card content when
// plan.cards is present. Brand colors and fonts are still applied.
//
// When brandContext is provided, brand colors and fonts are used where valid.
// Invalid brand colors fall back to the Orra default palette.
// Invalid brand fonts fall back to the Orra default catalog fonts.
//
// The output is visually simple but schema-valid:
//   - one gradient overlay (bottom scrim)
//   - one shape accent
//   - one title text layer (headline from plan.cards[i] or plan.title)
//   - one body text layer (body from plan.cards[i] or plan.body)
//   - optional CTA text layer when plan.cards[i].cta is present
//   - optional per-card index text for carousels
//
// All fonts come from the shared catalog. No AI, no R2, no provider calls.

export interface MockGenerationInput {
  /** The full AI text plan — drives all content. */
  plan: TextPlanResult;
  /** Optional brand context to influence colors and fonts. */
  brandContext: BrandContextDto | null;
  /** The current artifact document to build upon. */
  currentDocument: ArtifactDocument;
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

function makeTitleText(z: number, cardW: number, headline: string, brandContext?: BrandContextDto | null): TextLayer {
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
    content: headline,
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

function makeBodyText(z: number, cardW: number, bodyContent: string, brandContext?: BrandContextDto | null): TextLayer {
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
    content: bodyContent,
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

function makeCtaText(z: number, cardW: number, ctaContent: string, brandContext?: BrandContextDto | null): TextLayer {
  return {
    id: randomUUID(),
    type: 'text',
    z,
    x: 60,
    y: 720,
    w: cardW - 120,
    h: 60,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    content: ctaContent,
    fontFamily: pickAccentFont(brandContext),
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: 0.5,
    color: pickTitleColor(brandContext),
    align: 'left',
    role: 'accent',
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

function buildCard(
  index: number,
  total: number,
  ratioW: number,
  ratioH: number,
  plan: TextPlanResult,
  brandContext?: BrandContextDto | null
): Card {
  const layers: Layer[] = [];

  // Per-card content from plan.cards[i], falling back to plan.title / plan.body
  const perCard = plan.cards?.[index];
  const headline = perCard?.headline ?? plan.title;
  const bodyContent = perCard?.body ?? plan.body;
  const cta = perCard?.cta;

  // z=0: gradient overlay scrim at bottom
  layers.push(makeOverlayLayer(0, ratioH, brandContext));

  // z=1: shape accent bar
  layers.push(makeShapeAccent(1, brandContext));

  // z=2: title text
  layers.push(makeTitleText(2, ratioW, headline, brandContext));

  // z=3: body text
  layers.push(makeBodyText(3, ratioW, bodyContent, brandContext));

  // z=4: CTA text (only when plan provides one for this card)
  let nextZ = 4;
  if (cta) {
    layers.push(makeCtaText(nextZ++, ratioW, cta, brandContext));
  }

  // index text only for carousels with >1 card
  if (total > 1) {
    layers.push(makeIndexText(nextZ, ratioW, ratioH, index, total, brandContext));
  }

  return {
    id: randomUUID(),
    index,
    baseColor: pickBaseColor(index, brandContext),
    layers,
  };
}

/**
 * Produce a plan-driven deterministic ArtifactDocument.
 *
 * Rules:
 * - Preserves artifactId, type, ratio.
 * - Increments document.version by 1.
 * - Card count from plan.cardCount (clamped by normalization to 1–10).
 * - When plan.cards is present, it is authoritative for card count (no carousel minimum).
 * - When plan.cards is absent, carousel minimum of 3 is preserved.
 * - Only text, shape, overlay layers. No image-backed layers.
 * - All fonts are catalog-valid.
 * - Brand context influences colors and fonts when provided and valid.
 */
export function generateMockArtifactDocument(input: MockGenerationInput): ArtifactDocument {
  const doc = input.currentDocument;
  const plan = input.plan;

  const isCarousel = doc.type === 'carousel';
  const hasPlanCards = Array.isArray(plan.cards) && plan.cards.length > 0;

  let targetCount: number;
  if (hasPlanCards) {
    // plan.cards is authoritative — no carousel minimum override
    targetCount = plan.cardCount;
  } else if (isCarousel && plan.cardCount < 3) {
    // preserve carousel minimum when no per-card content
    targetCount = 3;
  } else {
    targetCount = plan.cardCount;
  }

  const cards: Card[] = [];
  for (let i = 0; i < targetCount; i++) {
    cards.push(buildCard(i, targetCount, doc.ratio.w, doc.ratio.h, plan, input.brandContext));
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
