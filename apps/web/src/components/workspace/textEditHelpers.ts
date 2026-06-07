import type { Layer } from '@orra/shared';

export function shouldEnterEditMode(layer: Layer): boolean {
  return (
    layer.type === 'text' &&
    !layer.locked &&
    !layer.hidden &&
    (layer.rotation ?? 0) === 0
  );
}

export function computeOverlayGeometry(
  layer: { x: number; y: number; w: number; h: number },
  frameW: number,
  frameH: number,
  docW: number,
  docH: number,
): { left: number; top: number; width: number; height: number; scale: number } {
  const scale = Math.min(frameW / docW, frameH / docH);
  const offsetX = (frameW - docW * scale) / 2;
  const offsetY = (frameH - docH * scale) / 2;
  return {
    left: offsetX + layer.x * scale,
    top: offsetY + layer.y * scale,
    width: layer.w * scale,
    height: layer.h * scale,
    scale,
  };
}
