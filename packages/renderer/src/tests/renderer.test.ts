import { describe, it, expect } from 'vitest';
import {
  type ArtifactDocument,
  type Card,
  type TextLayer,
  type BackgroundLayer,
  type ImageLayer,
  type ObjectLayer,
  type LogoLayer,
  type ShapeLayer,
  type OverlayLayer,
  type Layer,
} from '@orra/shared';
import { buildCardRenderData } from '../map.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTextLayer(overrides?: Partial<TextLayer>): TextLayer {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    z: 0,
    x: 100,
    y: 100,
    w: 400,
    h: 60,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    content: 'Hello world',
    fontFamily: 'Inter',
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    align: 'left',
    ...overrides,
  };
}

function makeBackgroundLayer(overrides?: Partial<BackgroundLayer>): BackgroundLayer {
  return {
    id: crypto.randomUUID(),
    type: 'background',
    z: 0,
    x: 0,
    y: 0,
    w: 1080,
    h: 1350,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    assetId: crypto.randomUUID(),
    fit: 'cover',
    ...overrides,
  };
}

function makeImageLayer(overrides?: Partial<ImageLayer>): ImageLayer {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    z: 1,
    x: 50,
    y: 50,
    w: 200,
    h: 200,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    assetId: crypto.randomUUID(),
    fit: 'contain',
    ...overrides,
  };
}

function makeObjectLayer(overrides?: Partial<ObjectLayer>): ObjectLayer {
  return {
    id: crypto.randomUUID(),
    type: 'object',
    z: 2,
    x: 200,
    y: 200,
    w: 150,
    h: 150,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    assetId: crypto.randomUUID(),
    fit: 'contain',
    aiManaged: true,
    ...overrides,
  };
}

function makeLogoLayer(overrides?: Partial<LogoLayer>): LogoLayer {
  return {
    id: crypto.randomUUID(),
    type: 'logo',
    z: 5,
    x: 900,
    y: 1200,
    w: 120,
    h: 80,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    assetId: crypto.randomUUID(),
    fit: 'contain',
    aiManaged: false,
    ...overrides,
  };
}

function makeShapeLayer(overrides?: Partial<ShapeLayer>): ShapeLayer {
  return {
    id: crypto.randomUUID(),
    type: 'shape',
    z: 3,
    x: 0,
    y: 0,
    w: 1080,
    h: 100,
    rotation: 0,
    opacity: 0.5,
    locked: false,
    hidden: false,
    shapeKind: 'rect',
    fill: '#ffffff',
    ...overrides,
  };
}

function makeOverlayLayer(overrides?: Partial<OverlayLayer>): OverlayLayer {
  return {
    id: crypto.randomUUID(),
    type: 'overlay',
    z: 4,
    x: 0,
    y: 0,
    w: 1080,
    h: 1350,
    rotation: 0,
    opacity: 0.3,
    locked: false,
    hidden: false,
    overlayKind: 'solid',
    params: { color: '#000000' },
    ...overrides,
  };
}

function normalizeZ(layers: Layer[]): Layer[] {
  return layers.map((l, i) => ({ ...l, z: i }));
}

function makeCard(overrides?: Partial<Card> & { layers?: Layer[] }): Card {
  const layers = overrides?.layers ?? [
    makeBackgroundLayer({ z: 0 }),
    makeTextLayer({ z: 1 }),
  ];
  return {
    id: crypto.randomUUID(),
    index: 0,
    baseColor: '#ffffff',
    layers: normalizeZ(layers),
    ...overrides,
  };
}

function makeDocument(type: 'post' | 'carousel' = 'post', cardCount = 1): ArtifactDocument {
  const cards = Array.from({ length: cardCount }, (_, i) =>
    makeCard({ index: i }),
  );
  return {
    schemaVersion: 1,
    artifactId: crypto.randomUUID(),
    type,
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards,
    version: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildCardRenderData', () => {
  it('accepts a valid ArtifactDocument', () => {
    const doc = makeDocument('post', 1);
    const result = buildCardRenderData(doc, 0);
    expect(result).toBeDefined();
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
    expect(result.baseColor).toBe('#ffffff');
  });

  it('selects the correct active card', () => {
    const doc = makeDocument('carousel', 3);
    doc.cards[0].baseColor = '#111111';
    doc.cards[1].baseColor = '#222222';
    doc.cards[2].baseColor = '#333333';

    expect(buildCardRenderData(doc, 0).baseColor).toBe('#111111');
    expect(buildCardRenderData(doc, 1).baseColor).toBe('#222222');
    expect(buildCardRenderData(doc, 2).baseColor).toBe('#333333');
  });

  it('text layers map correctly', () => {
    const textLayer = makeTextLayer({
      z: 1,
      content: 'Test headline',
      fontFamily: 'Newsreader',
      fontSize: 48,
      fontWeight: 700,
      color: '#1d2a30',
      align: 'center',
      x: 50,
      y: 200,
      w: 980,
      h: 120,
      rotation: 5,
      opacity: 0.9,
    });
    const doc = makeDocument('post', 1);
    doc.cards[0].layers = [makeBackgroundLayer({ z: 0 }), textLayer];

    const result = buildCardRenderData(doc, 0);
    const mapped = result.layers.find((l) => l.kind === 'text');
    expect(mapped).toBeDefined();
    expect(mapped?.kind).toBe('text');
    expect((mapped as any).content).toBe('Test headline');
    expect((mapped as any).fontFamily).toBe('Newsreader');
    expect((mapped as any).fontSize).toBe(48);
    expect((mapped as any).fontWeight).toBe(700);
    expect((mapped as any).color).toBe('#1d2a30');
    expect((mapped as any).align).toBe('center');
    expect((mapped as any).x).toBe(50);
    expect((mapped as any).y).toBe(200);
    expect((mapped as any).w).toBe(980);
    expect((mapped as any).h).toBe(120);
    expect((mapped as any).rotation).toBe(5);
    expect((mapped as any).opacity).toBe(0.9);
  });

  it('hidden layers are skipped from render output', () => {
    const visibleText = makeTextLayer({ z: 1, hidden: false });
    const hiddenText = makeTextLayer({ z: 2, hidden: true, content: 'Hidden' });
    const doc = makeDocument('post', 1);
    doc.cards[0].layers = [makeBackgroundLayer({ z: 0 }), visibleText, hiddenText];

    const result = buildCardRenderData(doc, 0);
    expect(result.layers).toHaveLength(2);
    expect(result.layers.some((l) => l.kind === 'text' && (l as any).content === 'Hidden')).toBe(false);
    expect(result.layers.some((l) => l.kind === 'text' && (l as any).content === 'Hello world')).toBe(true);
  });

  it('layers are ordered by z-index', () => {
    const bg = makeBackgroundLayer({ z: 0 });
    const text = makeTextLayer({ z: 1 });
    const shape = makeShapeLayer({ z: 2 });
    const overlay = makeOverlayLayer({ z: 3 });
    const doc = makeDocument('post', 1);
    // Shuffle insertion order intentionally
    doc.cards[0].layers = [overlay, text, bg, shape];

    const result = buildCardRenderData(doc, 0);
    const ids = result.layers.map((l) => l.id);
    expect(ids).toEqual([bg.id, text.id, shape.id, overlay.id]);
  });

  it('malformed documents are rejected by shared validation', () => {
    const badDoc = {
      schemaVersion: 1,
      artifactId: 'not-a-uuid',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      cards: [],
      version: 0,
    } as unknown as ArtifactDocument;

    expect(() => buildCardRenderData(badDoc, 0)).toThrow('Invalid document');
  });

  it('throws when card index is out of bounds', () => {
    const doc = makeDocument('post', 1);
    expect(() => buildCardRenderData(doc, 5)).toThrow('Card index 5 not found');
  });

  it('maps all supported layer kinds', () => {
    const layers: Layer[] = [
      makeBackgroundLayer({ z: 0 }),
      makeImageLayer({ z: 1 }),
      makeObjectLayer({ z: 2 }),
      makeLogoLayer({ z: 3 }),
      makeShapeLayer({ z: 4 }),
      makeOverlayLayer({ z: 5 }),
      makeTextLayer({ z: 6 }),
    ];
    const doc = makeDocument('post', 1);
    doc.cards[0].layers = normalizeZ(layers);

    const result = buildCardRenderData(doc, 0);
    const kinds = result.layers.map((l) => l.kind);
    expect(kinds).toEqual([
      'background',
      'image',
      'object',
      'logo',
      'shape',
      'overlay',
      'text',
    ]);
  });

  it('preserves locked state in render output', () => {
    const lockedText = makeTextLayer({ z: 1, locked: true });
    const unlockedText = makeTextLayer({ z: 2, locked: false });
    const doc = makeDocument('post', 1);
    doc.cards[0].layers = [makeBackgroundLayer({ z: 0 }), lockedText, unlockedText];

    const result = buildCardRenderData(doc, 0);
    const layers = result.layers.filter((l) => l.kind === 'text');
    expect(layers[0].locked).toBe(true);
    expect(layers[1].locked).toBe(false);
  });
});
