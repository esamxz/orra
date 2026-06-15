import type { ArtifactDocument, Card, Layer, TextLayer, ShapeLayer, OverlayLayer, BrandContextDto } from '@orra/shared';
import { ArtifactDocumentSchema } from '@orra/shared';
import type { TextPlanResult } from '@orra/ai';
import { resolvePlanStyle, getCardLayerGeometry } from './planStyleResolver.js';
import type { PlanStyleTokens } from './planStyleResolver.js';

// ---------------------------------------------------------------------------
// Plan-driven artifact document builder
// ---------------------------------------------------------------------------
// Produces a deterministic, valid ArtifactDocument using only
// text, shape, overlay, and baseColor layers. No external image assets.
//
// Phase 14A: refactored to accept the full TextPlanResult directly.
// Phase 14B: layout and visual direction influence geometry and decoration.
//
// All fonts come from the shared catalog. No AI, no R2, no provider calls.

export interface GenerationInput {
  plan: TextPlanResult;
  brandContext: BrandContextDto | null;
  currentDocument: ArtifactDocument;
}

/** @deprecated Use GenerationInput */
export type MockGenerationInput = GenerationInput;

// ---------------------------------------------------------------------------
// Layer builders
// ---------------------------------------------------------------------------

function randomUUID(): string {
  return crypto.randomUUID();
}

function makeOverlayLayer(
  z: number,
  cardW: number,
  overlayGeom: { y: number; h: number },
  style: PlanStyleTokens,
): OverlayLayer {
  return {
    id: randomUUID(),
    type: 'overlay',
    z,
    x: 0,
    y: overlayGeom.y,
    w: cardW,
    h: overlayGeom.h,
    rotation: 0,
    opacity: style.overlayOpacity,
    locked: false,
    hidden: false,
    overlayKind: 'linearGradient',
    params: {
      stops: [
        { offset: 0, color: style.overlayStart },
        { offset: 1, color: style.overlayEnd },
      ],
      angle: 180,
    },
  };
}

function makeShapeAccent(z: number, style: PlanStyleTokens): ShapeLayer {
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
    fill: style.accentColor,
    cornerRadius: 3,
  };
}

function makeTitleText(
  z: number,
  headline: string,
  titleGeom: { x: number; y: number; w: number; h: number; fontSize: number; fontWeight: number; align: 'left' | 'center' | 'right' },
  style: PlanStyleTokens,
): TextLayer {
  return {
    id: randomUUID(),
    type: 'text',
    z,
    x: titleGeom.x,
    y: titleGeom.y,
    w: titleGeom.w,
    h: titleGeom.h,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    content: headline,
    fontFamily: style.titleFont,
    fontSize: titleGeom.fontSize,
    fontWeight: titleGeom.fontWeight,
    lineHeight: 1.15,
    letterSpacing: 0,
    color: style.textColor,
    align: titleGeom.align,
    role: 'title',
  };
}

function makeBodyText(
  z: number,
  bodyContent: string,
  bodyGeom: { x: number; y: number; w: number; h: number; fontSize: number; align: 'left' | 'center' | 'right' },
  style: PlanStyleTokens,
): TextLayer {
  return {
    id: randomUUID(),
    type: 'text',
    z,
    x: bodyGeom.x,
    y: bodyGeom.y,
    w: bodyGeom.w,
    h: bodyGeom.h,
    rotation: 0,
    opacity: 0.85,
    locked: false,
    hidden: false,
    content: bodyContent,
    fontFamily: style.bodyFont,
    fontSize: bodyGeom.fontSize,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0.2,
    color: style.bodyColor,
    align: bodyGeom.align,
    role: 'body',
  };
}

function makeCtaText(
  z: number,
  ctaContent: string,
  ctaGeom: { x: number; y: number; w: number; h: number; align: 'left' | 'center' | 'right' },
  style: PlanStyleTokens,
): TextLayer {
  return {
    id: randomUUID(),
    type: 'text',
    z,
    x: ctaGeom.x,
    y: ctaGeom.y,
    w: ctaGeom.w,
    h: ctaGeom.h,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    content: ctaContent,
    fontFamily: style.accentFont,
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: 0.5,
    color: style.textColor,
    align: ctaGeom.align,
    role: 'accent',
  };
}

function makeIndexText(
  z: number,
  cardW: number,
  cardH: number,
  index: number,
  total: number,
  style: PlanStyleTokens,
): TextLayer {
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
    fontFamily: style.accentFont,
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: 1,
    color: style.textColor,
    align: 'right',
    role: 'caption',
  };
}

function buildCard(
  index: number,
  total: number,
  cardW: number,
  cardH: number,
  plan: TextPlanResult,
  style: PlanStyleTokens,
): Card {
  const geom = getCardLayerGeometry(style.layoutFamily, cardW, cardH);
  const layers: Layer[] = [];

  const perCard = plan.cards?.[index];
  const headline = perCard?.headline ?? plan.title;
  const bodyContent = perCard?.body ?? plan.body;
  const cta = perCard?.cta;

  layers.push(makeOverlayLayer(0, cardW, geom.overlay, style));

  let nextZ = 1;
  if (style.showAccentShape) {
    layers.push(makeShapeAccent(nextZ++, style));
  }

  layers.push(makeTitleText(nextZ++, headline, geom.title, style));
  layers.push(makeBodyText(nextZ++, bodyContent, geom.body, style));

  if (cta) {
    layers.push(makeCtaText(nextZ++, cta, geom.cta, style));
  }

  if (total > 1) {
    layers.push(makeIndexText(nextZ, cardW, cardH, index, total, style));
  }

  return {
    id: randomUUID(),
    index,
    baseColor: style.backgroundColor,
    layers,
  };
}

export interface SingleCardInput {
  cardIndex: number;
  total: number;
  plan: TextPlanResult;
  brandContext: BrandContextDto | null;
  currentDocument: ArtifactDocument;
}

/** @deprecated Use SingleCardInput */
export type MockSingleCardInput = SingleCardInput;

export function generateSingleCard(input: SingleCardInput): Card {
  const { cardIndex, total, plan, brandContext, currentDocument } = input;
  const style = resolvePlanStyle({
    layoutDirection: plan.layoutDirection,
    visualDirection: plan.visualDirection,
    brandContext,
    cardIndex,
  });
  return buildCard(cardIndex, total, currentDocument.ratio.w, currentDocument.ratio.h, plan, style);
}

/** @deprecated Use generateSingleCard */
export const generateMockSingleCard = generateSingleCard;

export function generateArtifactDocument(input: GenerationInput): ArtifactDocument {
  const doc = input.currentDocument;
  const plan = input.plan;

  const isCarousel = doc.type === 'carousel';
  const hasPlanCards = Array.isArray(plan.cards) && plan.cards.length > 0;

  let targetCount: number;
  if (hasPlanCards) {
    targetCount = plan.cardCount;
  } else if (isCarousel && plan.cardCount < 3) {
    targetCount = 3;
  } else {
    targetCount = plan.cardCount;
  }

  const cards: Card[] = [];
  for (let i = 0; i < targetCount; i++) {
    const style = resolvePlanStyle({
      layoutDirection: plan.layoutDirection,
      visualDirection: plan.visualDirection,
      brandContext: input.brandContext,
      cardIndex: i,
    });
    cards.push(buildCard(i, targetCount, doc.ratio.w, doc.ratio.h, plan, style));
  }

  const generated: ArtifactDocument = {
    schemaVersion: doc.schemaVersion,
    artifactId: doc.artifactId,
    type: doc.type,
    ratio: doc.ratio,
    cards,
    version: doc.version + 1,
  };

  const parsed = ArtifactDocumentSchema.safeParse(generated);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Artifact document failed validation: ${issues}`);
  }

  return parsed.data;
}

/** @deprecated Use generateArtifactDocument */
export const generateMockArtifactDocument = generateArtifactDocument;
