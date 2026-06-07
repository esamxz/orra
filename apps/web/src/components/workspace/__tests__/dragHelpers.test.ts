import { describe, it, expect } from 'vitest';
import { clampLayerPosition, shouldLayerBeDraggable } from '../dragHelpers';
import { applyAction } from '@orra/shared';
import { buildUpdateLayerPropsAction } from '../inspectorActions';
import { makeArtifactSinglePost } from '../../../data/mockArtifacts';

// ── clampLayerPosition ───────────────────────────────────────────────────────

describe('clampLayerPosition', () => {
  const docW = 1080;
  const docH = 1350;
  const layerW = 400;
  const layerH = 200;

  it('returns unchanged position when fully inside bounds', () => {
    expect(clampLayerPosition(100, 100, layerW, layerH, docW, docH)).toEqual({ x: 100, y: 100 });
  });

  it('clamps x below 0 to 0', () => {
    expect(clampLayerPosition(-50, 100, layerW, layerH, docW, docH)).toEqual({ x: 0, y: 100 });
  });

  it('clamps y below 0 to 0', () => {
    expect(clampLayerPosition(100, -30, layerW, layerH, docW, docH)).toEqual({ x: 100, y: 0 });
  });

  it('clamps x + layerW beyond docW', () => {
    const result = clampLayerPosition(800, 100, layerW, layerH, docW, docH);
    expect(result.x).toBe(docW - layerW); // 680
    expect(result.y).toBe(100);
  });

  it('clamps y + layerH beyond docH', () => {
    const result = clampLayerPosition(100, 1200, layerW, layerH, docW, docH);
    expect(result.x).toBe(100);
    expect(result.y).toBe(docH - layerH); // 1150
  });

  it('when layer is larger than document, position clamps to 0', () => {
    const bigW = 2000;
    const bigH = 3000;
    const result = clampLayerPosition(100, 100, bigW, bigH, docW, docH);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('x at exactly docW - layerW is not clamped', () => {
    const x = docW - layerW;
    expect(clampLayerPosition(x, 0, layerW, layerH, docW, docH)).toEqual({ x, y: 0 });
  });

  it('y at exactly docH - layerH is not clamped', () => {
    const y = docH - layerH;
    expect(clampLayerPosition(0, y, layerW, layerH, docW, docH)).toEqual({ x: 0, y });
  });
});

// ── shouldLayerBeDraggable ───────────────────────────────────────────────────

describe('shouldLayerBeDraggable', () => {
  it('returns false for background layer', () => {
    expect(shouldLayerBeDraggable('background', false)).toBe(false);
  });

  it('returns false for background even when unlocked and not hidden', () => {
    expect(shouldLayerBeDraggable('background', false, false)).toBe(false);
  });

  it('returns true for text layer — unlocked, not hidden', () => {
    expect(shouldLayerBeDraggable('text', false)).toBe(true);
  });

  it('returns true for image layer — unlocked, not hidden', () => {
    expect(shouldLayerBeDraggable('image', false)).toBe(true);
  });

  it('returns true for object layer — unlocked, not hidden', () => {
    expect(shouldLayerBeDraggable('object', false)).toBe(true);
  });

  it('returns true for logo layer — unlocked, not hidden', () => {
    expect(shouldLayerBeDraggable('logo', false)).toBe(true);
  });

  it('returns true for overlay layer — unlocked, not hidden', () => {
    expect(shouldLayerBeDraggable('overlay', false)).toBe(true);
  });

  it('returns true for shape layer — unlocked, not hidden', () => {
    expect(shouldLayerBeDraggable('shape', false)).toBe(true);
  });

  it('returns false when layer is locked', () => {
    expect(shouldLayerBeDraggable('text', true)).toBe(false);
  });

  it('returns false when layer is hidden', () => {
    expect(shouldLayerBeDraggable('text', false, true)).toBe(false);
  });

  it('returns false when layer is both locked and hidden', () => {
    expect(shouldLayerBeDraggable('text', true, true)).toBe(false);
  });

  it('hidden defaults to false (unlocked text without explicit hidden arg)', () => {
    expect(shouldLayerBeDraggable('text', false)).toBe(true);
  });
});

// ── drag commit via kernel ───────────────────────────────────────────────────

describe('drag commit via kernel', () => {
  function setup() {
    const doc = makeArtifactSinglePost('@test');
    const card = doc.cards[0];
    const textLayer = card.layers.find((l) => l.type === 'text');
    if (!textLayer) throw new Error('no text layer in fixture');
    return { doc, card, textLayer };
  }

  it('commits new position via updateLayerProps action', () => {
    const { doc, card, textLayer } = setup();
    const action = buildUpdateLayerPropsAction(card.id, textLayer.id, { x: 200, y: 300 });
    const result = applyAction(doc, action);
    const updated = result.document.cards[0].layers.find((l) => l.id === textLayer.id);
    expect(updated?.x).toBe(200);
    expect(updated?.y).toBe(300);
  });

  it('document version increments by 1 after drag commit', () => {
    const { doc, card, textLayer } = setup();
    const action = buildUpdateLayerPropsAction(card.id, textLayer.id, { x: 50, y: 80 });
    const result = applyAction(doc, action);
    expect(result.document.version).toBe(doc.version + 1);
  });

  it('committing same x/y still increments version (kernel does not deduplicate)', () => {
    const { doc, card, textLayer } = setup();
    const action = buildUpdateLayerPropsAction(card.id, textLayer.id, { x: textLayer.x, y: textLayer.y });
    const result = applyAction(doc, action);
    expect(result.document.version).toBe(doc.version + 1);
  });

  it('second drag commit increments version again', () => {
    const { doc, card, textLayer } = setup();
    const a1 = buildUpdateLayerPropsAction(card.id, textLayer.id, { x: 100, y: 100 });
    const r1 = applyAction(doc, a1);
    const a2 = buildUpdateLayerPropsAction(card.id, textLayer.id, { x: 200, y: 200 });
    const r2 = applyAction(r1.document, a2);
    expect(r2.document.version).toBe(doc.version + 2);
  });

  it('background kind is never dragged — shouldLayerBeDraggable returns false', () => {
    expect(shouldLayerBeDraggable('background', false)).toBe(false);
  });

  it('locked text layer — shouldLayerBeDraggable returns false (never dispatched)', () => {
    expect(shouldLayerBeDraggable('text', true)).toBe(false);
  });
});
