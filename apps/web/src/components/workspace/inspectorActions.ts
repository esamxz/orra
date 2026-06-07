import type { Action, Layer, LayerGeometryAndStyle, TextStyleUpdate } from '@orra/shared';

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
