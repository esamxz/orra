import { z } from 'zod';
import {
  type ArtifactDocument,
  type Card,
  type Layer,
  type TextLayer,
  type Ratio,
  ArtifactDocumentSchema,
  LayerSchema,
  CardSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Font catalog
// ---------------------------------------------------------------------------

export const APP_FONT_CATALOG = [
  'Hanken Grotesk',
  'Newsreader',
  'Inter',
  'Geist',
  'DM Sans',
] as const;

export type AppFontFamily = (typeof APP_FONT_CATALOG)[number];

export function isValidFontFamily(font: string): font is AppFontFamily {
  return APP_FONT_CATALOG.includes(font as AppFontFamily);
}

// ---------------------------------------------------------------------------
// Kernel error taxonomy
// ---------------------------------------------------------------------------

export class KernelError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'KernelError';
  }
}

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'addCard'; card: Card }
  | { type: 'removeCard'; cardId: string }
  | { type: 'duplicateCard'; cardId: string }
  | { type: 'reorderCards'; order: string[] }
  | { type: 'setCardBase'; cardId: string; baseColor: string }
  | { type: 'addLayer'; cardId: string; layer: Layer }
  | { type: 'removeLayer'; cardId: string; layerId: string }
  | { type: 'updateLayerProps'; cardId: string; layerId: string; props: Partial<LayerGeometryAndStyle> }
  | { type: 'reorderLayers'; cardId: string; order: string[] }
  | { type: 'setTextContent'; cardId: string; layerId: string; content: string }
  | { type: 'setTextStyle'; cardId: string; layerId: string; style: Partial<TextStyleUpdate> }
  | { type: 'replaceAsset'; cardId: string; layerId: string; assetId: string }
  | { type: 'setRatio'; ratio: Ratio };

export type LayerGeometryAndStyle = Pick<
  Layer,
  'x' | 'y' | 'w' | 'h' | 'rotation' | 'opacity' | 'hidden' | 'locked'
>;

export type TextStyleUpdate = Pick<
  TextLayer,
  'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing' | 'color' | 'align'
>;

// ---------------------------------------------------------------------------
// Inverse actions (for undo support)
// ---------------------------------------------------------------------------

export type InverseAction =
  | { type: 'removeCard'; cardId: string }
  | { type: 'addCard'; card: Card }
  | { type: 'reorderCards'; order: string[] }
  | { type: 'setCardBase'; cardId: string; baseColor: string }
  | { type: 'removeLayer'; cardId: string; layerId: string }
  | { type: 'addLayer'; cardId: string; layer: Layer }
  | { type: 'reorderLayers'; cardId: string; order: string[] }
  | { type: 'updateLayerProps'; cardId: string; layerId: string; props: Partial<LayerGeometryAndStyle> }
  | { type: 'setTextContent'; cardId: string; layerId: string; content: string }
  | { type: 'setTextStyle'; cardId: string; layerId: string; style: Partial<TextStyleUpdate> }
  | { type: 'replaceAsset'; cardId: string; layerId: string; assetId: string }
  | { type: 'setRatio'; ratio: Ratio };

export type ApplyResult = {
  document: ArtifactDocument;
  version: number;
  inverse: InverseAction | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clone<T>(value: T): T {
  return structuredClone(value);
}

function findCardIndex(doc: ArtifactDocument, cardId: string): number {
  const idx = doc.cards.findIndex((c) => c.id === cardId);
  if (idx === -1) {
    throw new KernelError('CARD_NOT_FOUND', `Card ${cardId} not found`);
  }
  return idx;
}

function findLayerIndex(card: Card, layerId: string): number {
  const idx = card.layers.findIndex((l) => l.id === layerId);
  if (idx === -1) {
    throw new KernelError('LAYER_NOT_FOUND', `Layer ${layerId} not found`);
  }
  return idx;
}

function assertLayerNotLocked(layer: Layer): void {
  if (layer.locked) {
    throw new KernelError('LAYER_LOCKED', `Layer ${layer.id} is locked and cannot be modified`);
  }
}

function assertLogoImmutable(layer: Layer, props: Record<string, unknown>): void {
  if (layer.type === 'logo' && 'assetId' in props && typeof props.assetId === 'string') {
    throw new KernelError('LOGO_IMMUTABLE', 'Logo layer assetId cannot be changed');
  }
}

function normalizeZOrder(layers: Layer[]): Layer[] {
  return layers.map((layer, index) => ({ ...layer, z: index }));
}

function validateBaseColor(color: string): void {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new KernelError('VALIDATION', `Invalid base color: ${color}`);
  }
}

function validateTextLayer(layer: Layer): void {
  if (layer.type !== 'text') return;
  if (!isValidFontFamily(layer.fontFamily)) {
    throw new KernelError('INVALID_FONT', `Font "${layer.fontFamily}" is not in the app catalog`);
  }
}

// ---------------------------------------------------------------------------
// Action validators
// ---------------------------------------------------------------------------

const AddCardActionSchema = z.object({ type: z.literal('addCard'), card: CardSchema });
const RemoveCardActionSchema = z.object({ type: z.literal('removeCard'), cardId: z.string().uuid() });
const DuplicateCardActionSchema = z.object({ type: z.literal('duplicateCard'), cardId: z.string().uuid() });
const ReorderCardsActionSchema = z.object({ type: z.literal('reorderCards'), order: z.array(z.string().uuid()) });
const SetCardBaseActionSchema = z.object({ type: z.literal('setCardBase'), cardId: z.string().uuid(), baseColor: z.string() });
const AddLayerActionSchema = z.object({ type: z.literal('addLayer'), cardId: z.string().uuid(), layer: LayerSchema });
const RemoveLayerActionSchema = z.object({ type: z.literal('removeLayer'), cardId: z.string().uuid(), layerId: z.string().uuid() });

const UpdateLayerPropsActionSchema = z.object({
  type: z.literal('updateLayerProps'),
  cardId: z.string().uuid(),
  layerId: z.string().uuid(),
  props: z.record(z.any()),
});

const ReorderLayersActionSchema = z.object({ type: z.literal('reorderLayers'), cardId: z.string().uuid(), order: z.array(z.string().uuid()) });
const SetTextContentActionSchema = z.object({ type: z.literal('setTextContent'), cardId: z.string().uuid(), layerId: z.string().uuid(), content: z.string() });

const SetTextStyleActionSchema = z.object({
  type: z.literal('setTextStyle'),
  cardId: z.string().uuid(),
  layerId: z.string().uuid(),
  style: z.object({
    fontFamily: z.string().optional(),
    fontSize: z.number().positive().optional(),
    fontWeight: z.number().min(100).max(900).optional(),
    lineHeight: z.number().positive().optional(),
    letterSpacing: z.number().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
  }),
});

const ReplaceAssetActionSchema = z.object({ type: z.literal('replaceAsset'), cardId: z.string().uuid(), layerId: z.string().uuid(), assetId: z.string().uuid() });
const SetRatioActionSchema = z.object({ type: z.literal('setRatio'), ratio: z.object({ name: z.enum(['1:1', '4:5', '9:16', '16:9', 'custom']), w: z.number().int().positive(), h: z.number().int().positive() }) });

const ActionSchema = z.discriminatedUnion('type', [
  AddCardActionSchema,
  RemoveCardActionSchema,
  DuplicateCardActionSchema,
  ReorderCardsActionSchema,
  SetCardBaseActionSchema,
  AddLayerActionSchema,
  RemoveLayerActionSchema,
  UpdateLayerPropsActionSchema,
  ReorderLayersActionSchema,
  SetTextContentActionSchema,
  SetTextStyleActionSchema,
  ReplaceAssetActionSchema,
  SetRatioActionSchema,
]);

function validateAction(action: unknown): Action {
  const parsed = ActionSchema.safeParse(action);
  if (!parsed.success) {
    throw new KernelError('VALIDATION', `Invalid action: ${parsed.error.message}`);
  }
  return parsed.data as Action;
}

// ---------------------------------------------------------------------------
// Core applyAction
// ---------------------------------------------------------------------------

export function applyAction(document: ArtifactDocument, rawAction: unknown): ApplyResult {
  // Validate the document first
  const docValidation = ArtifactDocumentSchema.safeParse(document);
  if (!docValidation.success) {
    throw new KernelError('VALIDATION', `Malformed document: ${docValidation.error.message}`);
  }

  // Validate and parse the action
  const action = validateAction(rawAction);

  // Work on a clone
  const doc = clone(document);

  let inverse: InverseAction | null = null;

  switch (action.type) {
    case 'addCard': {
      validateTextLayerInCard(action.card);
      const newCard = { ...action.card, index: doc.cards.length };
      doc.cards.push(newCard);
      inverse = { type: 'removeCard', cardId: newCard.id };
      break;
    }

    case 'removeCard': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const removedCard = doc.cards[cardIdx];
      inverse = { type: 'addCard', card: clone(removedCard) };
      doc.cards.splice(cardIdx, 1);
      // Re-index remaining cards
      doc.cards.forEach((c, i) => { c.index = i; });
      break;
    }

    case 'duplicateCard': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const original = doc.cards[cardIdx];
      const newCard: Card = {
        ...clone(original),
        id: crypto.randomUUID(),
        index: doc.cards.length,
        layers: original.layers.map((l) => ({
          ...clone(l),
          id: crypto.randomUUID(),
        })),
      };
      doc.cards.push(newCard);
      inverse = { type: 'removeCard', cardId: newCard.id };
      break;
    }

    case 'reorderCards': {
      if (action.order.length !== doc.cards.length) {
        throw new KernelError('VALIDATION', 'Reorder order length must match card count');
      }
      const originalOrder = doc.cards.map((c) => c.id);
      const missing = originalOrder.filter((id) => !action.order.includes(id));
      if (missing.length > 0) {
        throw new KernelError('VALIDATION', `Missing card IDs in reorder: ${missing.join(', ')}`);
      }
      const newCards: Card[] = [];
      for (const id of action.order) {
        const card = doc.cards.find((c) => c.id === id);
        if (!card) {
          throw new KernelError('CARD_NOT_FOUND', `Card ${id} not found`);
        }
        newCards.push(card);
      }
      doc.cards = newCards;
      doc.cards.forEach((c, i) => { c.index = i; });
      inverse = { type: 'reorderCards', order: originalOrder };
      break;
    }

    case 'setCardBase': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const oldColor = doc.cards[cardIdx].baseColor;
      validateBaseColor(action.baseColor);
      doc.cards[cardIdx].baseColor = action.baseColor;
      inverse = { type: 'setCardBase', cardId: action.cardId, baseColor: oldColor };
      break;
    }

    case 'addLayer': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const card = doc.cards[cardIdx];
      validateTextLayer(action.layer);
      const layer = { ...action.layer, z: card.layers.length };
      card.layers.push(layer);
      inverse = { type: 'removeLayer', cardId: action.cardId, layerId: layer.id };
      break;
    }

    case 'removeLayer': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const card = doc.cards[cardIdx];
      const layerIdx = findLayerIndex(card, action.layerId);
      const removedLayer = card.layers[layerIdx];
      assertLayerNotLocked(removedLayer);
      inverse = { type: 'addLayer', cardId: action.cardId, layer: clone(removedLayer) };
      card.layers.splice(layerIdx, 1);
      card.layers = normalizeZOrder(card.layers);
      break;
    }

    case 'updateLayerProps': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const card = doc.cards[cardIdx];
      const layerIdx = findLayerIndex(card, action.layerId);
      const layer = card.layers[layerIdx];
      assertLayerNotLocked(layer);
      assertLogoImmutable(layer, action.props);

      const oldProps: Partial<LayerGeometryAndStyle> = {};
      const allowedKeys: (keyof LayerGeometryAndStyle)[] = ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'hidden', 'locked'];

      for (const key of allowedKeys) {
        if (key in action.props) {
          oldProps[key] = layer[key] as never;
          (layer as Record<string, unknown>)[key] = action.props[key];
        }
      }

      inverse = { type: 'updateLayerProps', cardId: action.cardId, layerId: action.layerId, props: oldProps };
      break;
    }

    case 'reorderLayers': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const card = doc.cards[cardIdx];
      if (action.order.length !== card.layers.length) {
        throw new KernelError('VALIDATION', 'Reorder order length must match layer count');
      }
      const originalOrder = card.layers.map((l) => l.id);
      const missing = originalOrder.filter((id) => !action.order.includes(id));
      if (missing.length > 0) {
        throw new KernelError('VALIDATION', `Missing layer IDs in reorder: ${missing.join(', ')}`);
      }

      const newLayers: Layer[] = [];
      for (const id of action.order) {
        const layer = card.layers.find((l) => l.id === id);
        if (!layer) {
          throw new KernelError('LAYER_NOT_FOUND', `Layer ${id} not found`);
        }
        newLayers.push(layer);
      }
      card.layers = normalizeZOrder(newLayers);
      inverse = { type: 'reorderLayers', cardId: action.cardId, order: originalOrder };
      break;
    }

    case 'setTextContent': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const card = doc.cards[cardIdx];
      const layerIdx = findLayerIndex(card, action.layerId);
      const layer = card.layers[layerIdx];
      if (layer.type !== 'text') {
        throw new KernelError('VALIDATION', 'setTextContent can only target text layers');
      }
      assertLayerNotLocked(layer);
      const oldContent = layer.content;
      layer.content = action.content;
      inverse = { type: 'setTextContent', cardId: action.cardId, layerId: action.layerId, content: oldContent };
      break;
    }

    case 'setTextStyle': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const card = doc.cards[cardIdx];
      const layerIdx = findLayerIndex(card, action.layerId);
      const layer = card.layers[layerIdx];
      if (layer.type !== 'text') {
        throw new KernelError('VALIDATION', 'setTextStyle can only target text layers');
      }
      assertLayerNotLocked(layer);

      const oldStyle: Partial<TextStyleUpdate> = {};
      const styleKeys: (keyof TextStyleUpdate)[] = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'align'];

      for (const key of styleKeys) {
        if (key in action.style) {
          oldStyle[key] = layer[key] as never;
          const value = action.style[key];
          if (key === 'fontFamily' && value !== undefined && !isValidFontFamily(value as string)) {
            throw new KernelError('INVALID_FONT', `Font "${value}" is not in the app catalog`);
          }
          (layer as Record<string, unknown>)[key] = value;
        }
      }

      inverse = { type: 'setTextStyle', cardId: action.cardId, layerId: action.layerId, style: oldStyle };
      break;
    }

    case 'replaceAsset': {
      const cardIdx = findCardIndex(doc, action.cardId);
      const card = doc.cards[cardIdx];
      const layerIdx = findLayerIndex(card, action.layerId);
      const layer = card.layers[layerIdx];
      assertLayerNotLocked(layer);
      if (layer.type === 'logo') {
        throw new KernelError('LOGO_IMMUTABLE', 'Logo layer assetId cannot be changed');
      }
      if (!('assetId' in layer)) {
        throw new KernelError('VALIDATION', 'Target layer does not have an assetId');
      }
      const oldAssetId = layer.assetId;
      layer.assetId = action.assetId;
      inverse = { type: 'replaceAsset', cardId: action.cardId, layerId: action.layerId, assetId: oldAssetId };
      break;
    }

    case 'setRatio': {
      const oldRatio = doc.ratio;
      doc.ratio = action.ratio;
      // Note: geometry remapping is NOT handled here in V1. Changing ratio
      // without remapping layer coordinates will visually distort the design.
      // A full implementation requires anchor-based remapping or AI reflow.
      // The inverse is provided but may not perfectly restore the document
      // if geometry was manually adjusted after the ratio change.
      inverse = { type: 'setRatio', ratio: oldRatio };
      break;
    }
  }

  // Bump version on successful apply
  doc.version += 1;

  return { document: doc, version: doc.version, inverse };
}

// ---------------------------------------------------------------------------
// Helpers for validation
// ---------------------------------------------------------------------------

function validateTextLayerInCard(card: Card): void {
  for (const layer of card.layers) {
    validateTextLayer(layer);
  }
}
