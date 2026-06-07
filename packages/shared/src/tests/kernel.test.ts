import { describe, it, expect } from 'vitest';
import {
  applyAction,
  APP_FONT_CATALOG,
  KernelError,
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
  type Ratio,
} from '../index.js';

// ---------------------------------------------------------------------------
// Test fixtures
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

function normalizeZ(layers: Layer[]): Layer[] {
  return layers.map((l, i) => ({ ...l, z: i }));
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
// Schema tests
// ---------------------------------------------------------------------------

describe('ArtifactDocument schemas', () => {
  it('creates a valid post document', () => {
    const doc = makeDocument('post', 1);
    expect(doc.type).toBe('post');
    expect(doc.cards).toHaveLength(1);
    expect(doc.version).toBe(0);
  });

  it('creates a valid carousel document', () => {
    const doc = makeDocument('carousel', 5);
    expect(doc.type).toBe('carousel');
    expect(doc.cards).toHaveLength(5);
    doc.cards.forEach((card, i) => {
      expect(card.index).toBe(i);
    });
  });

  it('accepts all layer types', () => {
    const layers: Layer[] = [
      makeBackgroundLayer(),
      makeImageLayer(),
      makeObjectLayer(),
      makeLogoLayer(),
      makeShapeLayer(),
      makeOverlayLayer(),
      makeTextLayer(),
    ];
    const card = makeCard({ layers: normalizeZ(layers) });
    const doc = makeDocument('post', 1);
    doc.cards = [card];
    // Should not throw on apply (which validates the document)
    const result = applyAction(doc, { type: 'setCardBase', cardId: card.id, baseColor: '#eeeeee' });
    expect(result.document.cards[0].layers).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Card actions
// ---------------------------------------------------------------------------

describe('Card actions', () => {
  it('adds a card', () => {
    const doc = makeDocument('post', 1);
    const newCard = makeCard({ index: 1 });
    const result = applyAction(doc, { type: 'addCard', card: newCard });
    expect(result.document.cards).toHaveLength(2);
    expect(result.document.cards[1].index).toBe(1);
    expect(result.version).toBe(1);
    expect(result.inverse).toEqual({ type: 'removeCard', cardId: result.document.cards[1].id });
  });

  it('removes a card', () => {
    const doc = makeDocument('carousel', 3);
    const removedId = doc.cards[1].id;
    const removedCard = doc.cards[1];
    const result = applyAction(doc, { type: 'removeCard', cardId: removedId });
    expect(result.document.cards).toHaveLength(2);
    expect(result.document.cards.some((c) => c.id === removedId)).toBe(false);
    expect(result.document.cards[0].index).toBe(0);
    expect(result.document.cards[1].index).toBe(1);
    expect(result.version).toBe(1);
    expect(result.inverse).toEqual({ type: 'addCard', card: removedCard });
  });

  it('duplicates a card', () => {
    const doc = makeDocument('carousel', 2);
    const original = doc.cards[0];
    const result = applyAction(doc, { type: 'duplicateCard', cardId: original.id });
    expect(result.document.cards).toHaveLength(3);
    const dup = result.document.cards[2];
    expect(dup.index).toBe(2);
    expect(dup.layers).toHaveLength(original.layers.length);
    expect(dup.id).not.toBe(original.id);
    expect(dup.layers[0].id).not.toBe(original.layers[0].id);
    expect(result.inverse).toEqual({ type: 'removeCard', cardId: dup.id });
  });

  it('reorders cards', () => {
    const doc = makeDocument('carousel', 3);
    const ids = doc.cards.map((c) => c.id);
    const newOrder = [ids[2], ids[0], ids[1]];
    const result = applyAction(doc, { type: 'reorderCards', order: newOrder });
    expect(result.document.cards.map((c) => c.id)).toEqual(newOrder);
    expect(result.document.cards[0].index).toBe(0);
    expect(result.document.cards[1].index).toBe(1);
    expect(result.document.cards[2].index).toBe(2);
    expect(result.inverse).toEqual({ type: 'reorderCards', order: ids });
  });

  it('rejects reorderCards with wrong length', () => {
    const doc = makeDocument('carousel', 3);
    expect(() => applyAction(doc, { type: 'reorderCards', order: [doc.cards[0].id] })).toThrow(KernelError);
  });

  it('rejects reorderCards with missing IDs', () => {
    const doc = makeDocument('carousel', 3);
    expect(() => applyAction(doc, { type: 'reorderCards', order: [doc.cards[0].id, doc.cards[1].id, crypto.randomUUID()] })).toThrow(KernelError);
  });
});

// ---------------------------------------------------------------------------
// Layer actions
// ---------------------------------------------------------------------------

describe('Layer actions', () => {
  it('adds a text layer', () => {
    const doc = makeDocument('post', 1);
    const layer = makeTextLayer();
    const result = applyAction(doc, { type: 'addLayer', cardId: doc.cards[0].id, layer });
    expect(result.document.cards[0].layers).toHaveLength(3);
    expect(result.document.cards[0].layers[2].type).toBe('text');
    expect(result.version).toBe(1);
  });

  it('adds a background layer', () => {
    const doc = makeDocument('post', 1);
    const layer = makeBackgroundLayer();
    const result = applyAction(doc, { type: 'addLayer', cardId: doc.cards[0].id, layer });
    expect(result.document.cards[0].layers.some((l) => l.type === 'background' && l.id === layer.id)).toBe(true);
  });

  it('adds an image layer', () => {
    const doc = makeDocument('post', 1);
    const layer = makeImageLayer();
    const result = applyAction(doc, { type: 'addLayer', cardId: doc.cards[0].id, layer });
    expect(result.document.cards[0].layers.some((l) => l.type === 'image' && l.id === layer.id)).toBe(true);
  });

  it('adds an object layer', () => {
    const doc = makeDocument('post', 1);
    const layer = makeObjectLayer();
    const result = applyAction(doc, { type: 'addLayer', cardId: doc.cards[0].id, layer });
    expect(result.document.cards[0].layers.some((l) => l.type === 'object' && l.id === layer.id)).toBe(true);
  });

  it('adds a logo layer', () => {
    const doc = makeDocument('post', 1);
    const layer = makeLogoLayer();
    const result = applyAction(doc, { type: 'addLayer', cardId: doc.cards[0].id, layer });
    expect(result.document.cards[0].layers.some((l) => l.type === 'logo' && l.id === layer.id)).toBe(true);
  });

  it('removes a layer', () => {
    const doc = makeDocument('post', 1);
    const layerId = doc.cards[0].layers[0].id;
    const oldLayer = doc.cards[0].layers[0];
    const result = applyAction(doc, { type: 'removeLayer', cardId: doc.cards[0].id, layerId });
    expect(result.document.cards[0].layers).toHaveLength(1);
    expect(result.document.cards[0].layers.some((l) => l.id === layerId)).toBe(false);
    expect(result.inverse).toEqual({ type: 'addLayer', cardId: doc.cards[0].id, layer: oldLayer });
  });

  it('normalizes z-order after remove', () => {
    const doc = makeDocument('post', 1);
    // Add more layers
    doc.cards[0].layers.push(makeTextLayer({ z: 2 }));
    doc.cards[0].layers.push(makeShapeLayer({ z: 3 }));
    const layerId = doc.cards[0].layers[1].id;
    const result = applyAction(doc, { type: 'removeLayer', cardId: doc.cards[0].id, layerId });
    result.document.cards[0].layers.forEach((l, i) => {
      expect(l.z).toBe(i);
    });
  });

  it('reorders layers', () => {
    const doc = makeDocument('post', 1);
    const card = doc.cards[0];
    card.layers = [
      makeBackgroundLayer({ z: 0 }),
      makeTextLayer({ z: 1 }),
      makeShapeLayer({ z: 2 }),
    ];
    const ids = card.layers.map((l) => l.id);
    // Background (ids[0]) must stay at index 0; swap text and shape only
    const newOrder = [ids[0], ids[2], ids[1]];
    const result = applyAction(doc, { type: 'reorderLayers', cardId: card.id, order: newOrder });
    expect(result.document.cards[0].layers.map((l) => l.id)).toEqual(newOrder);
    result.document.cards[0].layers.forEach((l, i) => {
      expect(l.z).toBe(i);
    });
    expect(result.inverse).toEqual({ type: 'reorderLayers', cardId: card.id, order: ids });
  });

  it('updates layer position', () => {
    const doc = makeDocument('post', 1);
    const layer = doc.cards[0].layers[0];
    const result = applyAction(doc, {
      type: 'updateLayerProps',
      cardId: doc.cards[0].id,
      layerId: layer.id,
      props: { x: 999, y: 888 },
    });
    const updated = result.document.cards[0].layers[0];
    expect(updated.x).toBe(999);
    expect(updated.y).toBe(888);
    expect(result.inverse).toEqual({
      type: 'updateLayerProps',
      cardId: doc.cards[0].id,
      layerId: layer.id,
      props: { x: layer.x, y: layer.y },
    });
  });
});

// ---------------------------------------------------------------------------
// Text actions
// ---------------------------------------------------------------------------

describe('Text actions', () => {
  it('edits text content', () => {
    const doc = makeDocument('post', 1);
    const textLayer = makeTextLayer({ z: 1 });
    doc.cards[0].layers = [makeBackgroundLayer({ z: 0 }), textLayer];
    const result = applyAction(doc, {
      type: 'setTextContent',
      cardId: doc.cards[0].id,
      layerId: textLayer.id,
      content: 'Updated text',
    });
    const updated = result.document.cards[0].layers[1] as TextLayer;
    expect(updated.content).toBe('Updated text');
    expect(result.version).toBe(1);
    expect(result.inverse).toEqual({
      type: 'setTextContent',
      cardId: doc.cards[0].id,
      layerId: textLayer.id,
      content: 'Hello world',
    });
  });

  it('edits text style', () => {
    const doc = makeDocument('post', 1);
    const textLayer = makeTextLayer({ z: 1, fontSize: 24, color: '#000000' });
    doc.cards[0].layers = [makeBackgroundLayer({ z: 0 }), textLayer];
    const result = applyAction(doc, {
      type: 'setTextStyle',
      cardId: doc.cards[0].id,
      layerId: textLayer.id,
      style: { fontSize: 48, color: '#ff0000' },
    });
    const updated = result.document.cards[0].layers[1] as TextLayer;
    expect(updated.fontSize).toBe(48);
    expect(updated.color).toBe('#ff0000');
    expect(updated.fontFamily).toBe('Inter'); // unchanged
    expect(result.inverse).toEqual({
      type: 'setTextStyle',
      cardId: doc.cards[0].id,
      layerId: textLayer.id,
      style: { fontSize: 24, color: '#000000' },
    });
  });
});

// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------

describe('Validation rules', () => {
  it('rejects non-catalog font on addLayer', () => {
    const doc = makeDocument('post', 1);
    const layer = makeTextLayer({ fontFamily: 'Comic Sans' });
    expect(() => applyAction(doc, { type: 'addLayer', cardId: doc.cards[0].id, layer })).toThrow(KernelError);
  });

  it('rejects non-catalog font on setTextStyle', () => {
    const doc = makeDocument('post', 1);
    const textLayer = makeTextLayer({ z: 1 });
    doc.cards[0].layers = [makeBackgroundLayer({ z: 0 }), textLayer];
    expect(() =>
      applyAction(doc, {
        type: 'setTextStyle',
        cardId: doc.cards[0].id,
        layerId: textLayer.id,
        style: { fontFamily: 'Papyrus' },
      }),
    ).toThrow(KernelError);
  });

  it('rejects logo assetId mutation via replaceAsset', () => {
    const doc = makeDocument('post', 1);
    const logo = makeLogoLayer({ z: 1 });
    doc.cards[0].layers = [makeBackgroundLayer({ z: 0 }), logo];
    expect(() =>
      applyAction(doc, {
        type: 'replaceAsset',
        cardId: doc.cards[0].id,
        layerId: logo.id,
        assetId: crypto.randomUUID(),
      }),
    ).toThrow(KernelError);
  });

  it('rejects mutation of locked layers via updateLayerProps', () => {
    const doc = makeDocument('post', 1);
    const layer = doc.cards[0].layers[0];
    layer.locked = true;
    expect(() =>
      applyAction(doc, {
        type: 'updateLayerProps',
        cardId: doc.cards[0].id,
        layerId: layer.id,
        props: { x: 500 },
      }),
    ).toThrow(KernelError);
  });

  it('rejects mutation of locked layers via setTextContent', () => {
    const doc = makeDocument('post', 1);
    const textLayer = makeTextLayer({ z: 1, locked: true });
    doc.cards[0].layers = [makeBackgroundLayer({ z: 0 }), textLayer];
    expect(() =>
      applyAction(doc, {
        type: 'setTextContent',
        cardId: doc.cards[0].id,
        layerId: textLayer.id,
        content: 'New text',
      }),
    ).toThrow(KernelError);
  });

  it('rejects removing a locked layer', () => {
    const doc = makeDocument('post', 1);
    const layer = doc.cards[0].layers[0];
    layer.locked = true;
    expect(() =>
      applyAction(doc, {
        type: 'removeLayer',
        cardId: doc.cards[0].id,
        layerId: layer.id,
      }),
    ).toThrow(KernelError);
  });

  it('fails on non-existent card ID', () => {
    const doc = makeDocument('post', 1);
    expect(() =>
      applyAction(doc, {
        type: 'setCardBase',
        cardId: crypto.randomUUID(),
        baseColor: '#000000',
      }),
    ).toThrow(KernelError);
  });

  it('fails on non-existent layer ID', () => {
    const doc = makeDocument('post', 1);
    expect(() =>
      applyAction(doc, {
        type: 'removeLayer',
        cardId: doc.cards[0].id,
        layerId: crypto.randomUUID(),
      }),
    ).toThrow(KernelError);
  });

  it('increments version on successful action', () => {
    const doc = makeDocument('post', 1);
    const result = applyAction(doc, {
      type: 'setCardBase',
      cardId: doc.cards[0].id,
      baseColor: '#123456',
    });
    expect(result.version).toBe(1);
    expect(result.document.version).toBe(1);
  });

  it('does not increment version on rejected action', () => {
    const doc = makeDocument('post', 1);
    const originalVersion = doc.version;
    try {
      applyAction(doc, {
        type: 'setCardBase',
        cardId: crypto.randomUUID(),
        baseColor: '#123456',
      });
    } catch {
      // expected
    }
    expect(doc.version).toBe(originalVersion);
  });

  it('does not mutate input document', () => {
    const doc = makeDocument('post', 1);
    const originalBaseColor = doc.cards[0].baseColor;
    applyAction(doc, {
      type: 'setCardBase',
      cardId: doc.cards[0].id,
      baseColor: '#999999',
    });
    expect(doc.cards[0].baseColor).toBe(originalBaseColor);
  });

  it('Zod rejects malformed document', () => {
    const badDoc = {
      schemaVersion: 1,
      artifactId: 'not-a-uuid',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      cards: [],
      version: 0,
    } as unknown as ArtifactDocument;
    expect(() =>
      applyAction(badDoc, {
        type: 'setCardBase',
        cardId: crypto.randomUUID(),
        baseColor: '#000000',
      }),
    ).toThrow(KernelError);
  });

  it('rejects malformed action', () => {
    const doc = makeDocument('post', 1);
    expect(() =>
      applyAction(doc, {
        type: 'unknownAction',
      } as unknown as Parameters<typeof applyAction>[1]),
    ).toThrow(KernelError);
  });

  it('rejects setTextContent on non-text layer', () => {
    const doc = makeDocument('post', 1);
    const bg = makeBackgroundLayer({ z: 0 });
    doc.cards[0].layers = [bg];
    expect(() =>
      applyAction(doc, {
        type: 'setTextContent',
        cardId: doc.cards[0].id,
        layerId: bg.id,
        content: 'Oops',
      }),
    ).toThrow(KernelError);
  });

  it('rejects setTextStyle on non-text layer', () => {
    const doc = makeDocument('post', 1);
    const bg = makeBackgroundLayer({ z: 0 });
    doc.cards[0].layers = [bg];
    expect(() =>
      applyAction(doc, {
        type: 'setTextStyle',
        cardId: doc.cards[0].id,
        layerId: bg.id,
        style: { fontSize: 20 },
      }),
    ).toThrow(KernelError);
  });
});

// ---------------------------------------------------------------------------
// Undo / inverse action coverage
// ---------------------------------------------------------------------------

describe('Inverse actions', () => {
  it('setCardBase returns correct inverse', () => {
    const doc = makeDocument('post', 1);
    const oldColor = doc.cards[0].baseColor;
    const result = applyAction(doc, {
      type: 'setCardBase',
      cardId: doc.cards[0].id,
      baseColor: '#abcdef',
    });
    expect(result.inverse).toEqual({
      type: 'setCardBase',
      cardId: doc.cards[0].id,
      baseColor: oldColor,
    });
  });

  it('replaceAsset returns correct inverse', () => {
    const doc = makeDocument('post', 1);
    const image = makeImageLayer({ z: 1 });
    doc.cards[0].layers = [makeBackgroundLayer({ z: 0 }), image];
    const oldAssetId = image.assetId;
    const newAssetId = crypto.randomUUID();
    const result = applyAction(doc, {
      type: 'replaceAsset',
      cardId: doc.cards[0].id,
      layerId: image.id,
      assetId: newAssetId,
    });
    const updatedLayer = result.document.cards[0].layers[1];
    expect(updatedLayer.type === 'image' && updatedLayer.assetId).toBe(newAssetId);
    expect(result.inverse).toEqual({
      type: 'replaceAsset',
      cardId: doc.cards[0].id,
      layerId: image.id,
      assetId: oldAssetId,
    });
  });

  it('setRatio returns inverse with old ratio', () => {
    const doc = makeDocument('post', 1);
    const oldRatio = doc.ratio;
    const newRatio: Ratio = { name: '9:16', w: 1080, h: 1920 };
    const result = applyAction(doc, {
      type: 'setRatio',
      ratio: newRatio,
    });
    expect(result.document.ratio).toEqual(newRatio);
    expect(result.inverse).toEqual({
      type: 'setRatio',
      ratio: oldRatio,
    });
  });
});

// ---------------------------------------------------------------------------
// Font catalog sanity
// ---------------------------------------------------------------------------

describe('Font catalog', () => {
  it('contains the required fonts', () => {
    expect(APP_FONT_CATALOG).toContain('Hanken Grotesk');
    expect(APP_FONT_CATALOG).toContain('Newsreader');
    expect(APP_FONT_CATALOG).toContain('Inter');
    expect(APP_FONT_CATALOG).toContain('Geist');
    expect(APP_FONT_CATALOG).toContain('DM Sans');
  });
});
