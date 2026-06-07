export const MIN_RESIZE_W = 24;
export const MIN_RESIZE_H = 24;

/**
 * Returns true when a layer should show resize handles.
 * The `hidden` parameter defaults to false: the renderer already filters hidden
 * layers before they reach the canvas, so RenderLayer has no hidden field.
 * The parameter exists here for pure-function test coverage.
 */
export function isLayerResizable(kind: string, locked: boolean, hidden = false): boolean {
  return kind !== 'background' && !locked && !hidden;
}

/**
 * Clamps raw Transformer output (x, y, w, h in document coordinates) to enforce
 * minimum dimensions and keep the layer within the document bounds.
 */
export function clampResizeBounds(
  x: number,
  y: number,
  w: number,
  h: number,
  docW: number,
  docH: number,
): { x: number; y: number; w: number; h: number } {
  const clampedW = Math.max(MIN_RESIZE_W, Math.round(w));
  const clampedH = Math.max(MIN_RESIZE_H, Math.round(h));
  const clampedX = Math.max(0, Math.min(Math.round(x), docW - clampedW));
  const clampedY = Math.max(0, Math.min(Math.round(y), docH - clampedH));
  return { x: clampedX, y: clampedY, w: clampedW, h: clampedH };
}

/**
 * Returns true if any of x/y/w/h changed, so callers can skip no-op dispatches.
 */
export function hasResizeChanged(
  orig: { x: number; y: number; w: number; h: number },
  next: { x: number; y: number; w: number; h: number },
): boolean {
  return orig.x !== next.x || orig.y !== next.y || orig.w !== next.w || orig.h !== next.h;
}
