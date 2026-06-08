import {
  ArtifactDocumentSchema,
  type ArtifactDocument,
  type TextLayer,
  type BackgroundLayer,
  type ImageLayer,
  type ObjectLayer,
  type LogoLayer,
  type ShapeLayer,
  type OverlayLayer,
} from '@orra/shared';
import type {
  RenderCardData,
  RenderTextLayer,
  RenderBackgroundLayer,
  RenderImageLayer,
  RenderObjectLayer,
  RenderLogoLayer,
  RenderShapeLayer,
  RenderOverlayLayer,
} from './types.js';

function assertNever(x: never): never {
  throw new Error(`Unsupported layer type: ${(x as Record<string, unknown>).type as string}`);
}

// ---------------------------------------------------------------------------
// Build render data for a single card from an ArtifactDocument
// ---------------------------------------------------------------------------

export function buildCardRenderData(
  document: ArtifactDocument,
  cardIndex: number,
): RenderCardData {
  const parsed = ArtifactDocumentSchema.safeParse(document);
  if (!parsed.success) {
    throw new Error(`Invalid document: ${parsed.error.message}`);
  }

  const card = document.cards[cardIndex];
  if (!card) {
    throw new Error(`Card index ${cardIndex} not found. Document has ${document.cards.length} cards.`);
  }

  const visibleLayers = card.layers
    .filter((l) => !l.hidden)
    .sort((a, b) => a.z - b.z);

  const layers: RenderCardData['layers'] = visibleLayers.map((layer) => {
    switch (layer.type) {
      case 'text':
        return mapTextLayer(layer);
      case 'background':
        return mapBackgroundLayer(layer, card.baseColor);
      case 'image':
        return mapImageLayer(layer);
      case 'object':
        return mapObjectLayer(layer);
      case 'logo':
        return mapLogoLayer(layer);
      case 'shape':
        return mapShapeLayer(layer);
      case 'overlay':
        return mapOverlayLayer(layer);
      default:
        return assertNever(layer);
    }
  });

  return {
    width: document.ratio.w,
    height: document.ratio.h,
    baseColor: card.baseColor,
    layers,
  };
}

// ---------------------------------------------------------------------------
// Individual layer mappers
// ---------------------------------------------------------------------------

function mapTextLayer(layer: TextLayer): RenderTextLayer {
  return {
    kind: 'text',
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    locked: layer.locked,
    content: layer.content,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    color: layer.color,
    align: layer.align,
  };
}

function mapBackgroundLayer(layer: BackgroundLayer, baseColor: string): RenderBackgroundLayer {
  return {
    kind: 'background',
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    locked: layer.locked,
    assetId: layer.assetId,
    baseColor,
  };
}

function mapImageLayer(layer: ImageLayer): RenderImageLayer {
  return {
    kind: 'image',
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    locked: layer.locked,
    assetId: layer.assetId,
  };
}

function mapObjectLayer(layer: ObjectLayer): RenderObjectLayer {
  return {
    kind: 'object',
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    locked: layer.locked,
    assetId: layer.assetId,
  };
}

function mapLogoLayer(layer: LogoLayer): RenderLogoLayer {
  return {
    kind: 'logo',
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    locked: layer.locked,
    assetId: layer.assetId,
  };
}

function mapShapeLayer(layer: ShapeLayer): RenderShapeLayer {
  return {
    kind: 'shape',
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    locked: layer.locked,
    shapeKind: layer.shapeKind,
    fill: layer.fill,
    stroke: layer.stroke,
    cornerRadius: layer.cornerRadius,
  };
}

function mapOverlayLayer(layer: OverlayLayer): RenderOverlayLayer {
  return {
    kind: 'overlay',
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    locked: layer.locked,
    overlayKind: layer.overlayKind,
    params: layer.params,
  };
}
