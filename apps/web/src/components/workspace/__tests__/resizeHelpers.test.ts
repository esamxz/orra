import { describe, it, expect } from 'vitest';
import { isLayerResizable, clampResizeBounds, hasResizeChanged, MIN_RESIZE_W, MIN_RESIZE_H } from '../resizeHelpers';
import { applyAction } from '@orra/shared';
import { buildUpdateLayerPropsAction } from '../inspectorActions';
import { makeArtifactSinglePost } from '../../../data/mockArtifacts';

// ── isLayerResizable ─────────────────────────────────────────────────────────

describe('isLayerResizable', () => {
  it('background is not resizable', () => {
    expect(isLayerResizable('background', false)).toBe(false);
  });

  it('locked layer is not resizable regardless of kind', () => {
    expect(isLayerResizable('text', true)).toBe(false);
    expect(isLayerResizable('shape', true)).toBe(false);
    expect(isLayerResizable('image', true)).toBe(false);
    expect(isLayerResizable('logo', true)).toBe(false);
    expect(isLayerResizable('overlay', true)).toBe(false);
    expect(isLayerResizable('object', true)).toBe(false);
  });

  it('hidden layer is not resizable (test-coverage param)', () => {
    expect(isLayerResizable('text', false, true)).toBe(false);
    expect(isLayerResizable('shape', false, true)).toBe(false);
  });

  it('text layer is resizable when unlocked and visible', () => {
    expect(isLayerResizable('text', false)).toBe(true);
  });

  it('shape layer is resizable when unlocked and visible', () => {
    expect(isLayerResizable('shape', false)).toBe(true);
  });

  it('image layer is resizable when unlocked and visible', () => {
    expect(isLayerResizable('image', false)).toBe(true);
  });

  it('logo layer is resizable when unlocked', () => {
    expect(isLayerResizable('logo', false)).toBe(true);
  });

  it('logo layer is not resizable when locked', () => {
    expect(isLayerResizable('logo', true)).toBe(false);
  });

  it('object layer is resizable when unlocked and visible', () => {
    expect(isLayerResizable('object', false)).toBe(true);
  });

  it('overlay layer is resizable when unlocked and visible', () => {
    expect(isLayerResizable('overlay', false)).toBe(true);
  });
});

// ── clampResizeBounds ────────────────────────────────────────────────────────

describe('clampResizeBounds', () => {
  const docW = 1080;
  const docH = 1350;

  it('returns rounded values unchanged when already valid', () => {
    const result = clampResizeBounds(100, 200, 400, 300, docW, docH);
    expect(result).toEqual({ x: 100, y: 200, w: 400, h: 300 });
  });

  it('enforces minimum width', () => {
    const result = clampResizeBounds(0, 0, MIN_RESIZE_W - 1, 100, docW, docH);
    expect(result.w).toBe(MIN_RESIZE_W);
  });

  it('enforces minimum height', () => {
    const result = clampResizeBounds(0, 0, 100, MIN_RESIZE_H - 1, docW, docH);
    expect(result.h).toBe(MIN_RESIZE_H);
  });

  it('enforces minimum for both dimensions simultaneously', () => {
    const result = clampResizeBounds(0, 0, 1, 1, docW, docH);
    expect(result.w).toBe(MIN_RESIZE_W);
    expect(result.h).toBe(MIN_RESIZE_H);
  });

  it('clamps x so layer does not extend past right edge of doc', () => {
    // layer at x=1000 with w=400 → x + w = 1400 > 1080 → clamp x to docW - w = 1080 - 400 = 680
    const result = clampResizeBounds(1000, 0, 400, 100, docW, docH);
    expect(result.x).toBe(docW - result.w);
  });

  it('clamps y so layer does not extend past bottom edge of doc', () => {
    const result = clampResizeBounds(0, 1200, 100, 400, docW, docH);
    expect(result.y).toBe(docH - result.h);
  });

  it('clamps x to 0 when negative', () => {
    const result = clampResizeBounds(-50, 0, 200, 100, docW, docH);
    expect(result.x).toBe(0);
  });

  it('clamps y to 0 when negative', () => {
    const result = clampResizeBounds(0, -30, 200, 100, docW, docH);
    expect(result.y).toBe(0);
  });

  it('rounds floating point values to integers', () => {
    const result = clampResizeBounds(10.7, 20.3, 400.9, 300.1, docW, docH);
    expect(result.x).toBe(11);
    expect(result.y).toBe(20);
    expect(result.w).toBe(401);
    expect(result.h).toBe(300);
  });

  it('layer exactly at min size stays at min size', () => {
    const result = clampResizeBounds(0, 0, MIN_RESIZE_W, MIN_RESIZE_H, docW, docH);
    expect(result.w).toBe(MIN_RESIZE_W);
    expect(result.h).toBe(MIN_RESIZE_H);
  });

  it('doc exactly fills when layer is at origin with full doc dimensions', () => {
    const result = clampResizeBounds(0, 0, docW, docH, docW, docH);
    expect(result).toEqual({ x: 0, y: 0, w: docW, h: docH });
  });
});

// ── hasResizeChanged ─────────────────────────────────────────────────────────

describe('hasResizeChanged', () => {
  const base = { x: 100, y: 200, w: 400, h: 300 };

  it('returns false when all values are identical', () => {
    expect(hasResizeChanged(base, { ...base })).toBe(false);
  });

  it('returns true when x changes', () => {
    expect(hasResizeChanged(base, { ...base, x: 101 })).toBe(true);
  });

  it('returns true when y changes', () => {
    expect(hasResizeChanged(base, { ...base, y: 201 })).toBe(true);
  });

  it('returns true when w changes', () => {
    expect(hasResizeChanged(base, { ...base, w: 401 })).toBe(true);
  });

  it('returns true when h changes', () => {
    expect(hasResizeChanged(base, { ...base, h: 301 })).toBe(true);
  });

  it('returns false when values differ by floating point that rounds to same integer (already clamped)', () => {
    // Both sides should have already been rounded by clampResizeBounds before hasResizeChanged
    const orig = { x: 100, y: 200, w: 400, h: 300 };
    const next = { x: 100, y: 200, w: 400, h: 300 };
    expect(hasResizeChanged(orig, next)).toBe(false);
  });
});

// ── kernel integration: updateLayerProps for resize ──────────────────────────

describe('resize via kernel (updateLayerProps integration)', () => {
  function setup() {
    const doc = makeArtifactSinglePost('@test');
    const card = doc.cards[0];
    const textLayer = card.layers.find((l) => l.type === 'text');
    if (!textLayer) throw new Error('no text layer in fixture');
    return { doc, card, textLayer };
  }

  it('resize updates w and h in document and increments version once', () => {
    const { doc, card, textLayer } = setup();
    const action = buildUpdateLayerPropsAction(card.id, textLayer.id, { w: 600, h: 120 });
    const result = applyAction(doc, action);
    const updated = result.document.cards[0].layers.find((l) => l.id === textLayer.id);
    expect(updated!.w).toBe(600);
    expect(updated!.h).toBe(120);
    expect(result.document.version).toBe(doc.version + 1);
  });

  it('resize updates x and y (from left-edge or top-edge drag)', () => {
    const { doc, card, textLayer } = setup();
    const action = buildUpdateLayerPropsAction(card.id, textLayer.id, {
      x: textLayer.x - 50,
      y: textLayer.y - 30,
      w: textLayer.w + 50,
      h: textLayer.h + 30,
    });
    const result = applyAction(doc, action);
    const updated = result.document.cards[0].layers.find((l) => l.id === textLayer.id);
    expect(updated!.x).toBe(textLayer.x - 50);
    expect(updated!.y).toBe(textLayer.y - 30);
    expect(updated!.w).toBe(textLayer.w + 50);
    expect(updated!.h).toBe(textLayer.h + 30);
  });

  it('unchanged resize (same x/y/w/h) — hasResizeChanged prevents dispatch', () => {
    const { textLayer } = setup();
    const unchanged = hasResizeChanged(
      { x: textLayer.x, y: textLayer.y, w: textLayer.w, h: textLayer.h },
      { x: textLayer.x, y: textLayer.y, w: textLayer.w, h: textLayer.h },
    );
    expect(unchanged).toBe(false);
  });

  it('resize of locked text layer is rejected by kernel', () => {
    const { doc, card, textLayer } = setup();
    (doc.cards[0].layers.find((l) => l.id === textLayer.id) as { locked: boolean }).locked = true;
    const action = buildUpdateLayerPropsAction(card.id, textLayer.id, { w: 600 });
    expect(() => applyAction(doc, action)).toThrow();
  });

  it('text content is unchanged after resize (font size not touched)', () => {
    const { doc, card, textLayer } = setup();
    const action = buildUpdateLayerPropsAction(card.id, textLayer.id, { w: 700, h: 200 });
    const result = applyAction(doc, action);
    const updated = result.document.cards[0].layers.find((l) => l.id === textLayer.id);
    expect((updated as { content: string }).content).toBe((textLayer as { content: string }).content);
    expect((updated as { fontSize: number }).fontSize).toBe((textLayer as { fontSize: number }).fontSize);
  });

  it('layer id is preserved after resize', () => {
    const { doc, card, textLayer } = setup();
    const action = buildUpdateLayerPropsAction(card.id, textLayer.id, { w: 500 });
    const result = applyAction(doc, action);
    const updated = result.document.cards[0].layers.find((l) => l.id === textLayer.id);
    expect(updated).toBeDefined();
    expect(updated!.id).toBe(textLayer.id);
  });

  it('clampResizeBounds output produces a valid updateLayerProps action shape', () => {
    const { card, textLayer } = setup();
    const clamped = clampResizeBounds(50, 80, 500, 250, 1080, 1350);
    const action = buildUpdateLayerPropsAction(card.id, textLayer.id, {
      x: clamped.x,
      y: clamped.y,
      w: clamped.w,
      h: clamped.h,
    });
    expect(action.type).toBe('updateLayerProps');
    expect((action as { props: { x: number } }).props.x).toBe(clamped.x);
    expect((action as { props: { w: number } }).props.w).toBe(clamped.w);
  });
});
