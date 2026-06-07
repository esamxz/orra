/**
 * Clamp a layer's top-left position so it stays inside the document bounds.
 * Both x and y are in document-space pixels.
 */
export function clampLayerPosition(
  x: number,
  y: number,
  layerW: number,
  layerH: number,
  docW: number,
  docH: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(docW - layerW, x)),
    y: Math.max(0, Math.min(docH - layerH, y)),
  };
}

/**
 * Returns true when a layer should be interactive-draggable on the canvas.
 * The `hidden` parameter defaults to false: the renderer already filters hidden
 * layers before they reach the canvas, so RenderLayer has no hidden field.
 * The parameter exists here for pure-function test coverage.
 */
export function shouldLayerBeDraggable(
  kind: string,
  locked: boolean,
  hidden = false,
): boolean {
  return kind !== 'background' && !locked && !hidden;
}
