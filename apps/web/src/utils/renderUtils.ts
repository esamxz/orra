// Shared pure utilities used by both the preview renderer and the export renderer.
// No Konva, no DOM dependency — safe to import in either context.

export function fontStyleFromWeight(weight: number): string {
  return String(weight);
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
