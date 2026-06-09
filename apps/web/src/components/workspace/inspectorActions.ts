import type { Action, Layer, LayerGeometryAndStyle, TextStyleUpdate } from '@orra/shared';

/**
 * Build a kernel action to insert an uploaded project asset as an image layer.
 * Centers the layer and uses a safe default size since image dimensions are not
 * known at insert time.
 */
export function buildInsertImageLayerAction(
  cardId: string,
  assetId: string,
  cardW: number,
  cardH: number,
): Action {
  const w = Math.min(400, Math.round(cardW * 0.6));
  const h = Math.min(400, Math.round(cardH * 0.6));
  const x = Math.round((cardW - w) / 2);
  const y = Math.round((cardH - h) / 2);

  const layer: Layer = {
    id: crypto.randomUUID(),
    type: 'image',
    z: 0, // kernel addLayer will reassign z to card.layers.length
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    assetId,
    fit: 'contain',
  };

  return { type: 'addLayer', cardId, layer };
}

/**
 * Build a kernel action to update text content.
 */
export function buildSetTextContentAction(cardId: string, layerId: string, content: string): Action {
  return { type: 'setTextContent', cardId, layerId, content };
}

/**
 * Build a kernel action to update text style properties.
 */
export function buildSetTextStyleAction(cardId: string, layerId: string, style: Partial<TextStyleUpdate>): Action {
  return { type: 'setTextStyle', cardId, layerId, style };
}

/**
 * Build a kernel action to update layer geometry and visibility.
 */
export function buildUpdateLayerPropsAction(
  cardId: string,
  layerId: string,
  props: Partial<LayerGeometryAndStyle>,
): Action {
  return { type: 'updateLayerProps', cardId, layerId, props };
}

/**
 * Build a kernel action to remove a layer.
 */
export function buildRemoveLayerAction(cardId: string, layerId: string): Action {
  return { type: 'removeLayer', cardId, layerId };
}

/**
 * Build a kernel action to add a duplicated layer.
 * The caller must supply a clone with a fresh ID.
 */
export function buildAddLayerAction(cardId: string, layer: Layer): Action {
  return { type: 'addLayer', cardId, layer };
}

/**
 * Build a kernel action to reorder layers within a card.
 */
export function buildReorderLayersAction(cardId: string, order: string[]): Action {
  return { type: 'reorderLayers', cardId, order };
}
