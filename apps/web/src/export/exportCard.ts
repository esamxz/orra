import Konva from 'konva';
import JSZip from 'jszip';
import type { ArtifactDocument } from '@orra/shared';
import { buildCardRenderData, type RenderLayer } from '@orra/renderer';
import { buildExportFilename, buildZipFilename, assertCarouselExportReady } from './exportHelpers.js';

export { buildExportFilename, buildZipFilename, assertCarouselExportReady, waitForFonts } from './exportHelpers.js';

const EXPORT_PIXEL_RATIO = 2;

// ---------------------------------------------------------------------------
// Utilities copied from KonvaStage (no external deps)
// ---------------------------------------------------------------------------

function fontStyleFromWeight(weight: number): string {
  return String(weight);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Per-layer export node — no editor chrome
// ---------------------------------------------------------------------------

function buildExportNode(layer: RenderLayer): Konva.Group | null {
  const group = new Konva.Group({
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    opacity: layer.opacity,
  });

  switch (layer.kind) {
    case 'background':
      // baseColor rect already fills the canvas; skip
      return null;

    case 'image':
    case 'object':
    case 'logo': {
      const placeholder = new Konva.Rect({
        x: 0,
        y: 0,
        width: layer.w,
        height: layer.h,
        fill: layer.kind === 'logo' ? '#ffffff' : '#c8d1d8',
        stroke: '#a4b7bd',
        strokeWidth: 1,
        dash: [4, 4],
        listening: false,
      });
      const label = new Konva.Text({
        x: 0,
        y: layer.h / 2 - 8,
        width: layer.w,
        text: layer.kind,
        fontSize: 14,
        fontFamily: 'Hanken Grotesk, system-ui, sans-serif',
        fill: '#5e7680',
        align: 'center',
        listening: false,
      });
      group.add(placeholder, label);
      break;
    }

    case 'text': {
      const text = new Konva.Text({
        x: 0,
        y: 0,
        width: layer.w,
        height: layer.h,
        text: layer.content,
        fontSize: layer.fontSize,
        fontFamily: layer.fontFamily,
        fontStyle: fontStyleFromWeight(layer.fontWeight),
        fill: layer.color,
        align: layer.align,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing,
        listening: false,
      });
      group.add(text);
      break;
    }

    case 'shape': {
      if (layer.shapeKind === 'rect') {
        group.add(new Konva.Rect({
          x: 0,
          y: 0,
          width: layer.w,
          height: layer.h,
          fill: layer.fill || 'transparent',
          stroke: layer.stroke?.color,
          strokeWidth: layer.stroke?.width || 0,
          cornerRadius: layer.cornerRadius || 0,
          listening: false,
        }));
      } else if (layer.shapeKind === 'ellipse') {
        group.add(new Konva.Ellipse({
          x: layer.w / 2,
          y: layer.h / 2,
          radiusX: layer.w / 2,
          radiusY: layer.h / 2,
          fill: layer.fill || 'transparent',
          stroke: layer.stroke?.color,
          strokeWidth: layer.stroke?.width || 0,
          listening: false,
        }));
      } else if (layer.shapeKind === 'line') {
        group.add(new Konva.Line({
          points: [0, 0, layer.w, layer.h],
          stroke: layer.stroke?.color || '#000000',
          strokeWidth: layer.stroke?.width || 2,
          listening: false,
        }));
      }
      break;
    }

    case 'overlay': {
      if (layer.overlayKind === 'solid') {
        group.add(new Konva.Rect({
          x: 0, y: 0, width: layer.w, height: layer.h,
          fill: (layer.params.color as string) || '#000000',
          listening: false,
        }));
      } else if (layer.overlayKind === 'linearGradient') {
        const stops = (layer.params.stops as Array<{ offset: number; color: string }>) || [];
        const colorStops: (string | number)[] = [];
        for (const s of stops) { colorStops.push(s.offset, s.color); }
        if (colorStops.length === 0) { colorStops.push(0, '#000000', 1, '#000000'); }
        const angle = (layer.params.angle as number) || 0;
        const rad = (angle * Math.PI) / 180;
        group.add(new Konva.Rect({
          x: 0, y: 0, width: layer.w, height: layer.h,
          fillLinearGradientStartPoint: { x: 0, y: 0 },
          fillLinearGradientEndPoint: { x: layer.w * Math.cos(rad), y: layer.h * Math.sin(rad) },
          fillLinearGradientColorStops: colorStops,
          listening: false,
        }));
      } else if (layer.overlayKind === 'radialGradient') {
        const stops = (layer.params.stops as Array<{ offset: number; color: string }>) || [];
        const colorStops: (string | number)[] = [];
        for (const s of stops) { colorStops.push(s.offset, s.color); }
        if (colorStops.length === 0) { colorStops.push(0, '#000000', 1, '#000000'); }
        group.add(new Konva.Rect({
          x: 0, y: 0, width: layer.w, height: layer.h,
          fillRadialGradientStartPoint: { x: layer.w / 2, y: layer.h / 2 },
          fillRadialGradientEndPoint: { x: layer.w / 2, y: layer.h / 2 },
          fillRadialGradientStartRadius: 0,
          fillRadialGradientEndRadius: Math.max(layer.w, layer.h) / 2,
          fillRadialGradientColorStops: colorStops,
          listening: false,
        }));
      } else {
        // blur fallback — render as semi-transparent scrim
        group.add(new Konva.Rect({
          x: 0, y: 0, width: layer.w, height: layer.h,
          fill: hexToRgba((layer.params.color as string) || '#000000', 0.2),
          listening: false,
        }));
      }
      break;
    }
  }

  return group;
}

// ---------------------------------------------------------------------------
// Core export function
// ---------------------------------------------------------------------------

export async function renderCardToPng(
  doc: ArtifactDocument,
  cardIndex: number,
): Promise<Blob> {
  const renderData = buildCardRenderData(doc, cardIndex);
  const { width: docW, height: docH, baseColor, layers } = renderData;

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-99999px;top:-99999px;pointer-events:none;';
  document.body.appendChild(container);

  const stage = new Konva.Stage({ container, width: docW, height: docH });

  try {
    const konvaLayer = new Konva.Layer();
    stage.add(konvaLayer);

    // Solid base color — no gradient, no rounded corners, no shadow
    konvaLayer.add(new Konva.Rect({
      x: 0,
      y: 0,
      width: docW,
      height: docH,
      fill: baseColor,
      listening: false,
    }));

    for (const layer of layers) {
      const node = buildExportNode(layer);
      if (node) konvaLayer.add(node);
    }

    konvaLayer.draw();

    return await new Promise<Blob>((resolve, reject) => {
      stage.toBlob({
        pixelRatio: EXPORT_PIXEL_RATIO,
        callback: (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Export failed: canvas returned null'));
        },
      });
    });
  } finally {
    stage.destroy();
    document.body.removeChild(container);
  }
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function exportCardAsPng(
  doc: ArtifactDocument,
  cardIndex: number,
  opts: { projectName?: string } = {},
): Promise<void> {
  const blob = await renderCardToPng(doc, cardIndex);
  const filename = buildExportFilename(opts.projectName, cardIndex);
  downloadBlob(blob, filename);
}

export async function exportCarouselAsZip(
  doc: ArtifactDocument,
  opts: {
    projectName?: string;
    onProgress?: (current: number, total: number) => void;
  } = {},
): Promise<void> {
  assertCarouselExportReady(doc);

  const { projectName, onProgress } = opts;
  const total = doc.cards.length;
  const zip = new JSZip();

  for (let i = 0; i < total; i++) {
    const blob = await renderCardToPng(doc, i);
    const filename = buildExportFilename(projectName, i);
    zip.file(filename, blob);
    onProgress?.(i + 1, total);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, buildZipFilename(projectName));
}
