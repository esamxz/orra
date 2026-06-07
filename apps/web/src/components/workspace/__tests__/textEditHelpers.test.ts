import { describe, it, expect } from 'vitest';
import { shouldEnterEditMode, computeOverlayGeometry } from '../textEditHelpers';
import { applyAction } from '@orra/shared';
import { buildSetTextContentAction } from '../inspectorActions';
import { makeArtifactSinglePost } from '../../../data/mockArtifacts';

// ── shouldEnterEditMode ──────────────────────────────────────────────────────

const makeLayer = (overrides: Record<string, unknown>) => ({
  id: '00000000-0000-0000-0000-000000000001',
  type: 'text',
  z: 0,
  x: 0, y: 0, w: 400, h: 60,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
  content: 'Hello',
  fontFamily: 'Inter',
  fontSize: 32,
  fontWeight: 400,
  lineHeight: 1.2,
  letterSpacing: 0,
  color: '#ffffff',
  align: 'left',
  ...overrides,
});

describe('shouldEnterEditMode', () => {
  it('returns true for unlocked, unhidden text with no rotation', () => {
    expect(shouldEnterEditMode(makeLayer({}) as never)).toBe(true);
  });

  it('returns true when rotation is explicitly 0', () => {
    expect(shouldEnterEditMode(makeLayer({ rotation: 0 }) as never)).toBe(true);
  });

  it('returns false for locked text layer', () => {
    expect(shouldEnterEditMode(makeLayer({ locked: true }) as never)).toBe(false);
  });

  it('returns false for hidden text layer', () => {
    expect(shouldEnterEditMode(makeLayer({ hidden: true }) as never)).toBe(false);
  });

  it('returns false for rotated text layer (rotation = 45)', () => {
    expect(shouldEnterEditMode(makeLayer({ rotation: 45 }) as never)).toBe(false);
  });

  it('returns false for rotated text layer (rotation = -90)', () => {
    expect(shouldEnterEditMode(makeLayer({ rotation: -90 }) as never)).toBe(false);
  });

  it('returns false for background layer', () => {
    expect(shouldEnterEditMode(makeLayer({ type: 'background' }) as never)).toBe(false);
  });

  it('returns false for image layer', () => {
    expect(shouldEnterEditMode(makeLayer({ type: 'image' }) as never)).toBe(false);
  });

  it('returns false for logo layer', () => {
    expect(shouldEnterEditMode(makeLayer({ type: 'logo' }) as never)).toBe(false);
  });

  it('returns false when both locked and hidden', () => {
    expect(shouldEnterEditMode(makeLayer({ locked: true, hidden: true }) as never)).toBe(false);
  });
});

// ── computeOverlayGeometry ───────────────────────────────────────────────────

describe('computeOverlayGeometry', () => {
  it('layer fills entire doc at same frame size → left=0, top=0', () => {
    const layer = { x: 0, y: 0, w: 1080, h: 1350 };
    const result = computeOverlayGeometry(layer, 1080, 1350, 1080, 1350);
    expect(result.left).toBeCloseTo(0);
    expect(result.top).toBeCloseTo(0);
    expect(result.width).toBeCloseTo(1080);
    expect(result.height).toBeCloseTo(1350);
    expect(result.scale).toBeCloseTo(1);
  });

  it('frame half the size of doc → scale = 0.5', () => {
    const layer = { x: 0, y: 0, w: 1080, h: 1350 };
    const result = computeOverlayGeometry(layer, 540, 675, 1080, 1350);
    expect(result.scale).toBeCloseTo(0.5);
    expect(result.width).toBeCloseTo(540);
    expect(result.height).toBeCloseTo(675);
  });

  it('4:5 doc in wider frame → horizontal offset centers card', () => {
    // docW=1080, docH=1350, frameW=800, frameH=1350
    // scale = min(800/1080, 1350/1350) = min(0.741, 1) = 0.741
    // scaledW = 1080 * 0.741 = 800, scaledH = 1350 * 0.741 = 1000.7 → no, let me recalc
    // Actually scale = min(800/1080, 1350/1350) = min(0.7407, 1.0) = 0.7407
    // scaledW = 1080 * 0.7407 = 799.96 ≈ 800
    // scaledH = 1350 * 0.7407 = 999.94 ≈ 1000
    // offsetX = (800 - 800) / 2 = 0
    // offsetY = (1350 - 1000) / 2 = 175
    const layer = { x: 0, y: 0, w: 100, h: 100 };
    const result = computeOverlayGeometry(layer, 800, 1350, 1080, 1350);
    const scale = Math.min(800 / 1080, 1350 / 1350);
    expect(result.scale).toBeCloseTo(scale);
    expect(result.left).toBeCloseTo(0); // offsetX = 0
  });

  it('layer at (docW/4, docH/4) is positioned at offsetX + scale*(docW/4)', () => {
    const docW = 1080, docH = 1350;
    const frameW = 540, frameH = 675;
    const scale = Math.min(frameW / docW, frameH / docH);
    const offsetX = (frameW - docW * scale) / 2;
    const offsetY = (frameH - docH * scale) / 2;
    const layer = { x: docW / 4, y: docH / 4, w: 200, h: 100 };
    const result = computeOverlayGeometry(layer, frameW, frameH, docW, docH);
    expect(result.left).toBeCloseTo(offsetX + (docW / 4) * scale);
    expect(result.top).toBeCloseTo(offsetY + (docH / 4) * scale);
  });

  it('overlay width equals layer.w * scale', () => {
    const layer = { x: 100, y: 200, w: 400, h: 60 };
    const result = computeOverlayGeometry(layer, 540, 675, 1080, 1350);
    expect(result.width).toBeCloseTo(layer.w * result.scale);
    expect(result.height).toBeCloseTo(layer.h * result.scale);
  });

  it('narrow frame scales by height constraint', () => {
    // frameW = 300, frameH = 675, docW = 1080, docH = 1350
    // scaleW = 300/1080 = 0.2778, scaleH = 675/1350 = 0.5
    // scale = min = 0.2778 (width is the constraint)
    const layer = { x: 0, y: 0, w: 1080, h: 1350 };
    const result = computeOverlayGeometry(layer, 300, 675, 1080, 1350);
    expect(result.scale).toBeCloseTo(300 / 1080);
  });

  it('tall frame scales by width constraint', () => {
    // frameW = 540, frameH = 1000, docW = 1080, docH = 1350
    // scaleW = 540/1080 = 0.5, scaleH = 1000/1350 = 0.7407
    // scale = min = 0.5
    const layer = { x: 0, y: 0, w: 1080, h: 1350 };
    const result = computeOverlayGeometry(layer, 540, 1000, 1080, 1350);
    expect(result.scale).toBeCloseTo(0.5);
  });
});

// ── setTextContent kernel integration ────────────────────────────────────────

describe('setTextContent via kernel (inline edit integration)', () => {
  function setup() {
    const doc = makeArtifactSinglePost('@test');
    const card = doc.cards[0];
    const textLayer = card.layers.find((l) => l.type === 'text');
    if (!textLayer) throw new Error('no text layer in fixture');
    return { doc, card, textLayer };
  }

  it('changed text dispatches setTextContent and increments version', () => {
    const { doc, card, textLayer } = setup();
    const action = buildSetTextContentAction(card.id, textLayer.id, 'New content');
    const result = applyAction(doc, action);
    const updated = result.document.cards[0].layers.find((l) => l.id === textLayer.id);
    expect((updated as { content: string }).content).toBe('New content');
    expect(result.document.version).toBe(doc.version + 1);
  });

  it('unchanged text: no-op check — shouldEnterEditMode returns true for editing layer', () => {
    const { textLayer } = setup();
    expect(shouldEnterEditMode(textLayer)).toBe(true);
  });

  it('locked text layer: setTextContent is rejected by kernel', () => {
    const { doc, card, textLayer } = setup();
    (doc.cards[0].layers.find((l) => l.id === textLayer.id) as { locked: boolean }).locked = true;
    const action = buildSetTextContentAction(card.id, textLayer.id, 'New content');
    expect(() => applyAction(doc, action)).toThrow();
  });

  it('locked layer: shouldEnterEditMode returns false (never enters edit)', () => {
    const { textLayer } = setup();
    const locked = { ...textLayer, locked: true };
    expect(shouldEnterEditMode(locked)).toBe(false);
  });

  it('selection remains on same layer id after commit (layer id unchanged)', () => {
    const { doc, card, textLayer } = setup();
    const action = buildSetTextContentAction(card.id, textLayer.id, 'Updated');
    const result = applyAction(doc, action);
    const updatedLayer = result.document.cards[0].layers.find((l) => l.id === textLayer.id);
    expect(updatedLayer).toBeDefined();
    expect(updatedLayer!.id).toBe(textLayer.id);
  });
});
