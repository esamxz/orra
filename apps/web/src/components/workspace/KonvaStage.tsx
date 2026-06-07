import { useRef, useEffect } from 'react';
import Konva from 'konva';
import type { ArtifactDocument } from '@orra/shared';
import { buildCardRenderData, type RenderLayer } from '@orra/renderer';
import { shouldLayerBeDraggable } from './dragHelpers';

interface Props {
  document: ArtifactDocument;
  activeCardIndex: number;
  selectedLayerId: string | null;
  onSelectLayer: (id: string, type: string) => void;
  onBgClick: () => void;
  onDragEnd?: (layerId: string, x: number, y: number) => void;
}

function fontStyleFromWeight(weight: number): string {
  return String(weight);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildBackgroundGradient(baseColor: string): [string, string] {
  if (baseColor === '#ffffff' || baseColor === '#f1f4f4' || baseColor === '#eef1f1') {
    return ['#eef1f1', '#dbe2e4'];
  }
  if (baseColor === '#1d2a30' || baseColor === '#0f1719' || baseColor === '#111a1d') {
    return ['#243338', '#1d2a30'];
  }
  if (baseColor === '#c8d1d8' || baseColor === '#aab9bf') {
    return ['#c8d1d8', '#7d949b'];
  }
  if (baseColor === '#5e7680') {
    return ['#5e7680', '#354e53'];
  }
  return [baseColor, baseColor];
}

export default function KonvaStage({
  document,
  activeCardIndex,
  selectedLayerId,
  onSelectLayer,
  onBgClick,
  onDragEnd,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const stateRef = useRef({
    document,
    activeCardIndex,
    selectedLayerId,
    onSelectLayer,
    onBgClick,
    onDragEnd,
  });

  useEffect(() => {
    stateRef.current = {
      document,
      activeCardIndex,
      selectedLayerId,
      onSelectLayer,
      onBgClick,
      onDragEnd,
    };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
    });
    stageRef.current = stage;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (stageRef.current && width > 0 && height > 0) {
          stageRef.current.width(width);
          stageRef.current.height(height);
          draw(
            stateRef.current.document,
            stateRef.current.activeCardIndex,
            stateRef.current.selectedLayerId,
          );
        }
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    draw(document, activeCardIndex, selectedLayerId);
  }, [document, activeCardIndex, selectedLayerId]);

  function draw(doc: ArtifactDocument, cardIndex: number, selId: string | null) {
    const stage = stageRef.current;
    if (!stage) return;

    const renderData = buildCardRenderData(doc, cardIndex);
    const docW = renderData.width;
    const docH = renderData.height;
    const stageW = stage.width();
    const stageH = stage.height();

    const scale = Math.min(stageW / docW, stageH / docH);
    const scaledW = docW * scale;
    const scaledH = docH * scale;
    const offsetX = (stageW - scaledW) / 2;
    const offsetY = (stageH - scaledH) / 2;

    stage.removeChildren();

    // Background layer for hit detection (canvas outside card)
    const bgLayer = new Konva.Layer();
    stage.add(bgLayer);

    const canvasBg = new Konva.Rect({
      x: 0,
      y: 0,
      width: stageW,
      height: stageH,
      fill: 'rgba(0,0,0,0.001)',
    });
    canvasBg.on('click tap', () => {
      stateRef.current.onBgClick();
    });
    bgLayer.add(canvasBg);

    // Card base background
    const [gradStart, gradEnd] = buildBackgroundGradient(renderData.baseColor);
    const cardBg = new Konva.Rect({
      x: offsetX,
      y: offsetY,
      width: scaledW,
      height: scaledH,
      cornerRadius: 22 * scale,
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: scaledW, y: scaledH },
      fillLinearGradientColorStops: [0, gradStart, 1, gradEnd],
      shadowColor: 'rgba(29,42,48,0.10)',
      shadowBlur: 20,
      shadowOffsetY: 8,
    });
    bgLayer.add(cardBg);
    bgLayer.draw();

    // Content layer scaled to document coordinates
    const contentLayer = new Konva.Layer({
      x: offsetX,
      y: offsetY,
      scaleX: scale,
      scaleY: scale,
    });
    stage.add(contentLayer);

    // Draw each render layer
    for (const layer of renderData.layers) {
      const group = createLayerGroup(layer, selId, scale, offsetX, offsetY, docW, docH);
      if (group) {
        contentLayer.add(group);
      }
    }

    contentLayer.draw();
  }

  function createLayerGroup(
    layer: RenderLayer,
    selId: string | null,
    stageScale: number,
    offsetX: number,
    offsetY: number,
    docW: number,
    docH: number,
  ): Konva.Group | null {
    const group = new Konva.Group({
      x: layer.x,
      y: layer.y,
      rotation: layer.rotation,
      opacity: layer.opacity,
    });

    const isSelected = layer.id === selId;
    const isLocked = layer.locked;

    switch (layer.kind) {
      case 'background': {
        return null;
      }

      case 'image':
      case 'object':
      case 'logo': {
        const placeholder = new Konva.Rect({
          x: 0,
          y: 0,
          width: layer.w,
          height: layer.h,
          fill: layer.kind === 'logo' ? '#ffffff' : '#c8d1d8',
          stroke: isSelected ? '#354e53' : '#a4b7bd',
          strokeWidth: isSelected ? 2 : 1,
          dash: [4, 4],
          listening: true,
        });
        const label = new Konva.Text({
          x: 0,
          y: layer.h / 2 - 8,
          width: layer.w,
          text: layer.kind + (isLocked ? ' (locked)' : ''),
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
          listening: true,
        });
        group.add(text);
        break;
      }

      case 'shape': {
        if (layer.shapeKind === 'rect') {
          const rect = new Konva.Rect({
            x: 0,
            y: 0,
            width: layer.w,
            height: layer.h,
            fill: layer.fill || 'transparent',
            stroke: isSelected ? '#354e53' : layer.stroke?.color,
            strokeWidth: isSelected ? 2 : (layer.stroke?.width || 0),
            cornerRadius: layer.cornerRadius || 0,
            listening: true,
          });
          group.add(rect);
        } else if (layer.shapeKind === 'ellipse') {
          const ellipse = new Konva.Ellipse({
            x: layer.w / 2,
            y: layer.h / 2,
            radiusX: layer.w / 2,
            radiusY: layer.h / 2,
            fill: layer.fill || 'transparent',
            stroke: isSelected ? '#354e53' : layer.stroke?.color,
            strokeWidth: isSelected ? 2 : (layer.stroke?.width || 0),
            listening: true,
          });
          group.add(ellipse);
        } else if (layer.shapeKind === 'line') {
          const line = new Konva.Line({
            points: [0, 0, layer.w, layer.h],
            stroke: isSelected ? '#354e53' : (layer.stroke?.color || '#000000'),
            strokeWidth: isSelected ? 2 : (layer.stroke?.width || 2),
            listening: true,
          });
          group.add(line);
        }
        break;
      }

      case 'overlay': {
        if (layer.overlayKind === 'solid') {
          const color = (layer.params.color as string) || '#000000';
          const rect = new Konva.Rect({
            x: 0, y: 0, width: layer.w, height: layer.h,
            fill: color,
            listening: true,
          });
          group.add(rect);
        } else if (layer.overlayKind === 'linearGradient') {
          const stops = (layer.params.stops as Array<{ offset: number; color: string }>) || [];
          const colorStops: (string | number)[] = [];
          for (const s of stops) { colorStops.push(s.offset, s.color); }
          if (colorStops.length === 0) { colorStops.push(0, '#000000', 1, '#000000'); }
          const angle = (layer.params.angle as number) || 0;
          const rad = (angle * Math.PI) / 180;
          const rect = new Konva.Rect({
            x: 0, y: 0, width: layer.w, height: layer.h,
            fillLinearGradientStartPoint: { x: 0, y: 0 },
            fillLinearGradientEndPoint: { x: layer.w * Math.cos(rad), y: layer.h * Math.sin(rad) },
            fillLinearGradientColorStops: colorStops,
            listening: true,
          });
          group.add(rect);
        } else if (layer.overlayKind === 'radialGradient') {
          const stops = (layer.params.stops as Array<{ offset: number; color: string }>) || [];
          const colorStops: (string | number)[] = [];
          for (const s of stops) { colorStops.push(s.offset, s.color); }
          if (colorStops.length === 0) { colorStops.push(0, '#000000', 1, '#000000'); }
          const rect = new Konva.Rect({
            x: 0, y: 0, width: layer.w, height: layer.h,
            fillRadialGradientStartPoint: { x: layer.w / 2, y: layer.h / 2 },
            fillRadialGradientEndPoint: { x: layer.w / 2, y: layer.h / 2 },
            fillRadialGradientStartRadius: 0,
            fillRadialGradientEndRadius: Math.max(layer.w, layer.h) / 2,
            fillRadialGradientColorStops: colorStops,
            listening: true,
          });
          group.add(rect);
        } else {
          const rect = new Konva.Rect({
            x: 0, y: 0, width: layer.w, height: layer.h,
            fill: hexToRgba((layer.params.color as string) || '#000000', 0.2),
            listening: true,
          });
          group.add(rect);
        }
        break;
      }
    }

    // Wire click handler
    group.on('click tap', (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      stateRef.current.onSelectLayer(layer.id, layer.kind);
    });

    // Selection highlight inside the group — moves with drag automatically
    if (isSelected) {
      const padding = 4;
      const strokeWidth = 2 / stageScale;
      const highlight = new Konva.Rect({
        x: -padding,
        y: -padding,
        width: layer.w + padding * 2,
        height: layer.h + padding * 2,
        stroke: '#354e53',
        strokeWidth,
        opacity: 0.8,
        listening: false,
        dash: isLocked ? [6, 4] : undefined,
      });
      group.add(highlight);
    }

    // Locked indicator
    if (isLocked) {
      const lockSize = Math.min(18, layer.w * 0.15, layer.h * 0.15);
      if (lockSize >= 8) {
        const lockIcon = new Konva.Rect({
          x: layer.w - lockSize - 4, y: 4,
          width: lockSize, height: lockSize,
          fill: 'rgba(29,42,48,0.5)',
          cornerRadius: 3,
          listening: false,
        });
        const lockText = new Konva.Text({
          x: layer.w - lockSize - 4, y: 4,
          width: lockSize, height: lockSize,
          text: '🔒',
          fontSize: lockSize * 0.7,
          align: 'center',
          verticalAlign: 'middle',
          listening: false,
        });
        group.add(lockIcon, lockText);
      }
    }

    // Drag behavior
    const draggable = shouldLayerBeDraggable(layer.kind, layer.locked);

    if (draggable) {
      group.draggable(true);

      // Clamp drag position in stage (screen) coordinates
      group.dragBoundFunc((pos) => {
        const minX = offsetX;
        const maxX = offsetX + Math.max(0, docW - layer.w) * stageScale;
        const minY = offsetY;
        const maxY = offsetY + Math.max(0, docH - layer.h) * stageScale;
        return {
          x: Math.max(minX, Math.min(maxX, pos.x)),
          y: Math.max(minY, Math.min(maxY, pos.y)),
        };
      });

      // Track start position to detect no-movement drags
      let startX = layer.x;
      let startY = layer.y;

      group.on('dragstart', () => {
        startX = layer.x;
        startY = layer.y;
        if (stageRef.current) stageRef.current.container().style.cursor = 'grabbing';
      });

      group.on('dragend', () => {
        const newX = Math.round(group.x());
        const newY = Math.round(group.y());
        if (stageRef.current) stageRef.current.container().style.cursor = 'grab';
        if (newX !== Math.round(startX) || newY !== Math.round(startY)) {
          stateRef.current.onDragEnd?.(layer.id, newX, newY);
        }
      });

      group.on('mouseenter', () => {
        if (stageRef.current) stageRef.current.container().style.cursor = 'grab';
      });
      group.on('mouseleave', () => {
        if (stageRef.current) stageRef.current.container().style.cursor = '';
      });
    } else if (isLocked) {
      // No drag affordance for locked layers
      group.on('mouseenter', () => {
        if (stageRef.current) stageRef.current.container().style.cursor = 'not-allowed';
      });
      group.on('mouseleave', () => {
        if (stageRef.current) stageRef.current.container().style.cursor = '';
      });
    }

    return group;
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    />
  );
}
