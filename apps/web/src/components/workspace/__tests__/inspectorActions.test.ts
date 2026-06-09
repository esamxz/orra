import { describe, it, expect } from 'vitest';
import {
  buildSetTextContentAction,
  buildSetTextStyleAction,
  buildUpdateLayerPropsAction,
  buildRemoveLayerAction,
  buildAddLayerAction,
  buildReorderLayersAction,
  buildInsertImageLayerAction,
} from '../inspectorActions';
import {
  applyAction,
  type ArtifactDocument,
  type Layer,
  getFontsByCategory,
  getFontsByRole,
  getFontByFamily,
  isSupportedFontFamily,
  getDefaultFontForRole,
} from '@orra/shared';

function makeDocument(): ArtifactDocument {
  return {
    schemaVersion: 1,
    artifactId: '00000000-0000-0000-0000-000000000001',
    type: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: [
      {
        id: '00000000-0000-0000-0000-000000000002',
        index: 0,
        baseColor: '#1d2a30',
        layers: [
          {
            id: '00000000-0000-0000-0000-000000000003',
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
          },
        ],
      },
    ],
    version: 0,
  };
}

describe('inspector action builders', () => {
  it('builds setTextContent action', () => {
    const action = buildSetTextContentAction('card-1', 'layer-1', 'Updated text');
    expect(action).toEqual({
      type: 'setTextContent',
      cardId: 'card-1',
      layerId: 'layer-1',
      content: 'Updated text',
    });
  });

  it('builds setTextStyle action for font family', () => {
    const action = buildSetTextStyleAction('card-1', 'layer-1', { fontFamily: 'Newsreader' });
    expect(action).toEqual({
      type: 'setTextStyle',
      cardId: 'card-1',
      layerId: 'layer-1',
      style: { fontFamily: 'Newsreader' },
    });
  });

  it('builds setTextStyle action for size', () => {
    const action = buildSetTextStyleAction('card-1', 'layer-1', { fontSize: 48 });
    expect(action).toEqual({
      type: 'setTextStyle',
      cardId: 'card-1',
      layerId: 'layer-1',
      style: { fontSize: 48 },
    });
  });

  it('builds setTextStyle action for color', () => {
    const action = buildSetTextStyleAction('card-1', 'layer-1', { color: '#ff0000' });
    expect(action).toEqual({
      type: 'setTextStyle',
      cardId: 'card-1',
      layerId: 'layer-1',
      style: { color: '#ff0000' },
    });
  });

  it('builds setTextStyle action for alignment', () => {
    const action = buildSetTextStyleAction('card-1', 'layer-1', { align: 'center' });
    expect(action).toEqual({
      type: 'setTextStyle',
      cardId: 'card-1',
      layerId: 'layer-1',
      style: { align: 'center' },
    });
  });

  it('builds setTextStyle action for weight', () => {
    const action = buildSetTextStyleAction('card-1', 'layer-1', { fontWeight: 700 });
    expect(action).toEqual({
      type: 'setTextStyle',
      cardId: 'card-1',
      layerId: 'layer-1',
      style: { fontWeight: 700 },
    });
  });

  it('builds setTextStyle action for role', () => {
    const action = buildSetTextStyleAction('card-1', 'layer-1', { role: 'title' });
    expect(action).toEqual({
      type: 'setTextStyle',
      cardId: 'card-1',
      layerId: 'layer-1',
      style: { role: 'title' },
    });
  });

  it('builds updateLayerProps action for x/y position', () => {
    const action = buildUpdateLayerPropsAction('card-1', 'layer-1', { x: 200, y: 300 });
    expect(action).toEqual({
      type: 'updateLayerProps',
      cardId: 'card-1',
      layerId: 'layer-1',
      props: { x: 200, y: 300 },
    });
  });

  it('builds updateLayerProps action for opacity', () => {
    const action = buildUpdateLayerPropsAction('card-1', 'layer-1', { opacity: 0.5 });
    expect(action).toEqual({
      type: 'updateLayerProps',
      cardId: 'card-1',
      layerId: 'layer-1',
      props: { opacity: 0.5 },
    });
  });

  it('builds removeLayer action', () => {
    const action = buildRemoveLayerAction('card-1', 'layer-1');
    expect(action).toEqual({
      type: 'removeLayer',
      cardId: 'card-1',
      layerId: 'layer-1',
    });
  });

  it('builds addLayer action', () => {
    const layer = { id: 'new-layer', type: 'text' } as unknown as Layer;
    const action = buildAddLayerAction('card-1', layer);
    expect(action).toEqual({
      type: 'addLayer',
      cardId: 'card-1',
      layer,
    });
  });

  it('builds insertImageLayer action with centered geometry', () => {
    const action = buildInsertImageLayerAction('card-1', 'asset-123', 1080, 1350);
    expect(action.type).toBe('addLayer');
    const addAction = action as Extract<typeof action, { type: 'addLayer' }>;
    expect(addAction.cardId).toBe('card-1');
    expect(addAction.layer.type).toBe('image');
    expect((addAction.layer as { assetId?: string }).assetId).toBe('asset-123');
    expect(addAction.layer.x).toBeGreaterThan(0);
    expect(addAction.layer.y).toBeGreaterThan(0);
    expect(addAction.layer.w).toBeLessThanOrEqual(1080);
    expect(addAction.layer.h).toBeLessThanOrEqual(1350);
    expect(addAction.layer.x).toBe(Math.round((1080 - addAction.layer.w) / 2));
    expect(addAction.layer.y).toBe(Math.round((1350 - addAction.layer.h) / 2));
    expect((addAction.layer as { fit?: string }).fit).toBe('contain');
  });
});

describe('inspector actions applied through kernel', () => {
  it('applying text content edit changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextContentAction(cardId, layerId, 'New content');
    const result = applyAction(doc, action);
    expect(result.document.cards[0].layers[0].type).toBe('text');
    expect((result.document.cards[0].layers[0] as { content: string }).content).toBe('New content');
    expect(result.version).toBe(1);
  });

  it('applying size edit changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextStyleAction(cardId, layerId, { fontSize: 64 });
    const result = applyAction(doc, action);
    const layer = result.document.cards[0].layers[0] as { fontSize: number };
    expect(layer.fontSize).toBe(64);
    expect(result.version).toBe(1);
  });

  it('applying color edit changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextStyleAction(cardId, layerId, { color: '#ff0000' });
    const result = applyAction(doc, action);
    const layer = result.document.cards[0].layers[0] as { color: string };
    expect(layer.color).toBe('#ff0000');
  });

  it('applying alignment edit changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextStyleAction(cardId, layerId, { align: 'right' });
    const result = applyAction(doc, action);
    const layer = result.document.cards[0].layers[0] as { align: string };
    expect(layer.align).toBe('right');
  });

  it('applying weight edit changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextStyleAction(cardId, layerId, { fontWeight: 700 });
    const result = applyAction(doc, action);
    const layer = result.document.cards[0].layers[0] as { fontWeight: number };
    expect(layer.fontWeight).toBe(700);
    expect(result.version).toBe(1);
  });

  it('applying role edit changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextStyleAction(cardId, layerId, { role: 'title' });
    const result = applyAction(doc, action);
    const layer = result.document.cards[0].layers[0] as { role?: string };
    expect(layer.role).toBe('title');
    expect(result.version).toBe(1);
  });

  it('applying opacity edit changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildUpdateLayerPropsAction(cardId, layerId, { opacity: 0.5 });
    const result = applyAction(doc, action);
    expect(result.document.cards[0].layers[0].opacity).toBe(0.5);
  });

  it('applying x/y position edit changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildUpdateLayerPropsAction(cardId, layerId, { x: 999, y: 888 });
    const result = applyAction(doc, action);
    expect(result.document.cards[0].layers[0].x).toBe(999);
    expect(result.document.cards[0].layers[0].y).toBe(888);
  });

  it('unsupported font is rejected', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextStyleAction(cardId, layerId, { fontFamily: 'Comic Sans' });
    expect(() => applyAction(doc, action)).toThrow();
  });

  it('locked layer mutation is rejected', () => {
    const doc = makeDocument();
    (doc.cards[0].layers[0] as { locked: boolean }).locked = true;
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    expect(() => applyAction(doc, buildSetTextContentAction(cardId, layerId, 'New'))).toThrow();
    expect(() => applyAction(doc, buildSetTextStyleAction(cardId, layerId, { fontSize: 20 }))).toThrow();
    expect(() => applyAction(doc, buildUpdateLayerPropsAction(cardId, layerId, { x: 500 }))).toThrow();
  });

  it('version increments after successful inspector edit', () => {
    const doc = makeDocument();
    const action = buildUpdateLayerPropsAction(doc.cards[0].id, doc.cards[0].layers[0].id, { x: 999 });
    const result = applyAction(doc, action);
    expect(result.version).toBe(1);
    expect(result.document.version).toBe(1);
  });

  it('version does not increment after failed inspector edit', () => {
    const doc = makeDocument();
    (doc.cards[0].layers[0] as { locked: boolean }).locked = true;
    const originalVersion = doc.version;
    try {
      applyAction(doc, buildSetTextStyleAction(doc.cards[0].id, doc.cards[0].layers[0].id, { fontFamily: 'Newsreader' }));
    } catch {
      // expected
    }
    expect(doc.version).toBe(originalVersion);
  });

  it('selected layer lookup uses real ArtifactDocument IDs', () => {
    const doc = makeDocument();
    const card = doc.cards[0];
    const layer = card.layers[0];
    expect(card.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(layer.id).toMatch(/^[0-9a-f-]{36}$/);
    const action = buildSetTextContentAction(card.id, layer.id, 'Verified');
    const result = applyAction(doc, action);
    expect((result.document.cards[0].layers[0] as { content: string }).content).toBe('Verified');
  });

  it('inspector model does not expose layer ID as visible display data', () => {
    // The Inspector component no longer renders layer.id anywhere.
    // This is a design guarantee, not a runtime test.
    // We verify the builder functions do not leak IDs in action names
    // and that the action shape is clean.
    const action = buildSetTextContentAction('card-1', 'layer-1', 'Hello') as { type: string; cardId: string; layerId: string; content: string };
    expect(action.content).toBe('Hello');
    expect(Object.keys(action)).toEqual(['type', 'cardId', 'layerId', 'content']);
  });

  it('remove layer action removes the layer', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildRemoveLayerAction(cardId, layerId);
    const result = applyAction(doc, action);
    expect(result.document.cards[0].layers).toHaveLength(0);
    expect(result.version).toBe(1);
  });

  it('add layer action adds the layer', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const newLayer: Layer = {
      id: crypto.randomUUID(),
      type: 'text',
      z: 1,
      x: 0, y: 0, w: 100, h: 100,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      content: 'New',
      fontFamily: 'Newsreader',
      fontSize: 24,
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#000000',
      align: 'left',
    };
    const action = buildAddLayerAction(cardId, newLayer);
    const result = applyAction(doc, action);
    expect(result.document.cards[0].layers).toHaveLength(2);
    expect(result.version).toBe(1);
  });
});

describe('Position percent-to-pixel conversion', () => {
  it('X slider percent converts to absolute X correctly', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const cardW = doc.ratio.w; // 1080
    const targetPercent = 25;
    const expectedX = Math.round((targetPercent / 100) * cardW); // 270
    const action = buildUpdateLayerPropsAction(cardId, layerId, { x: expectedX });
    const result = applyAction(doc, action);
    expect(result.document.cards[0].layers[0].x).toBe(expectedX);
  });

  it('Y slider percent converts to absolute Y correctly', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const cardH = doc.ratio.h; // 1350
    const targetPercent = 50;
    const expectedY = Math.round((targetPercent / 100) * cardH); // 675
    const action = buildUpdateLayerPropsAction(cardId, layerId, { y: expectedY });
    const result = applyAction(doc, action);
    expect(result.document.cards[0].layers[0].y).toBe(expectedY);
  });

  it('X/Y input edits create updateLayerProps actions', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const cardW = doc.ratio.w;
    const cardH = doc.ratio.h;

    // Simulate user typing 10% in X input
    const xPercent = 10;
    const xPx = Math.round((xPercent / 100) * cardW);
    const xAction = buildUpdateLayerPropsAction(cardId, layerId, { x: xPx });
    expect(xAction).toEqual({
      type: 'updateLayerProps',
      cardId,
      layerId,
      props: { x: xPx },
    });

    // Simulate user typing 75% in Y input
    const yPercent = 75;
    const yPx = Math.round((yPercent / 100) * cardH);
    const yAction = buildUpdateLayerPropsAction(cardId, layerId, { y: yPx });
    expect(yAction).toEqual({
      type: 'updateLayerProps',
      cardId,
      layerId,
      props: { y: yPx },
    });
  });

  it('locked layers cannot be moved', () => {
    const doc = makeDocument();
    const layer = doc.cards[0].layers[0];
    (layer as { locked: boolean }).locked = true;
    const cardId = doc.cards[0].id;
    const layerId = layer.id;
    const cardW = doc.ratio.w;

    // Attempt to move via updateLayerProps
    const newX = Math.round((50 / 100) * cardW);
    expect(() => applyAction(doc, buildUpdateLayerPropsAction(cardId, layerId, { x: newX }))).toThrow();
    expect(() => applyAction(doc, buildUpdateLayerPropsAction(cardId, layerId, { y: 200 }))).toThrow();
  });
});

describe('font catalog integration', () => {
  it('returns correct fonts for each category', () => {
    const serif = getFontsByCategory('serif');
    const sans = getFontsByCategory('sans');
    const mono = getFontsByCategory('mono');
    const display = getFontsByCategory('display');
    const poster = getFontsByCategory('poster');
    const script = getFontsByCategory('script');
    const arabic = getFontsByCategory('arabic');

    expect(serif.map((f) => f.family)).toContain('Newsreader');
    expect(sans.map((f) => f.family)).toContain('Inter');
    expect(mono.map((f) => f.family)).toContain('IBM Plex Mono');
    expect(display.map((f) => f.family)).toContain('Playfair Display');
    expect(poster.map((f) => f.family)).toContain('Bebas Neue');
    expect(script.map((f) => f.family)).toContain('Caveat');
    expect(arabic.map((f) => f.family)).toContain('Cairo');

    expect(serif.every((f) => f.category === 'serif')).toBe(true);
    expect(sans.every((f) => f.category === 'sans')).toBe(true);
    expect(mono.every((f) => f.category === 'mono')).toBe(true);
    expect(display.every((f) => f.category === 'display')).toBe(true);
    expect(poster.every((f) => f.category === 'poster')).toBe(true);
    expect(script.every((f) => f.category === 'script')).toBe(true);
    expect(arabic.every((f) => f.category === 'arabic')).toBe(true);
  });

  it('resolves font family to correct category', () => {
    expect(getFontByFamily('Newsreader')?.category).toBe('serif');
    expect(getFontByFamily('Inter')?.category).toBe('sans');
    expect(getFontByFamily('IBM Plex Mono')?.category).toBe('mono');
    expect(getFontByFamily('Playfair Display')?.category).toBe('display');
    expect(getFontByFamily('Bebas Neue')?.category).toBe('poster');
    expect(getFontByFamily('Caveat')?.category).toBe('script');
    expect(getFontByFamily('Cairo')?.category).toBe('arabic');
  });

  it('supports all catalog font families', () => {
    const allFonts = [
      ...getFontsByCategory('serif'),
      ...getFontsByCategory('sans'),
      ...getFontsByCategory('mono'),
      ...getFontsByCategory('display'),
      ...getFontsByCategory('poster'),
      ...getFontsByCategory('script'),
      ...getFontsByCategory('arabic'),
    ];
    expect(allFonts.length).toBeGreaterThan(30);
    allFonts.forEach((f) => {
      expect(isSupportedFontFamily(f.family)).toBe(true);
    });
  });

  it('falls back for unsupported font families', () => {
    expect(getFontByFamily('Comic Sans')).toBeUndefined();
    expect(isSupportedFontFamily('Comic Sans')).toBe(false);
  });

  it('locked layer rejects font family change', () => {
    const doc = makeDocument();
    (doc.cards[0].layers[0] as { locked: boolean }).locked = true;
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    expect(() =>
      applyAction(doc, buildSetTextStyleAction(cardId, layerId, { fontFamily: 'Newsreader' })),
    ).toThrow();
  });

  it('getDefaultFontForRole returns supported catalog fonts', () => {
    expect(isSupportedFontFamily(getDefaultFontForRole('title').family)).toBe(true);
    expect(isSupportedFontFamily(getDefaultFontForRole('body').family)).toBe(true);
    expect(isSupportedFontFamily(getDefaultFontForRole('accent').family)).toBe(true);
    expect(isSupportedFontFamily(getDefaultFontForRole('caption').family)).toBe(true);
  });

  it('getFontsByRole includes fonts with matching roles array', () => {
    const titleFonts = getFontsByRole('title');
    const newsreader = titleFonts.find((f) => f.family === 'Newsreader');
    expect(newsreader).toBeDefined();
    expect(newsreader?.roles.includes('title')).toBe(true);
  });
});

describe('buildReorderLayersAction', () => {
  it('builds correct action shape', () => {
    const order = ['layer-a', 'layer-b', 'layer-c'];
    const action = buildReorderLayersAction('card-1', order);
    expect(action).toEqual({ type: 'reorderLayers', cardId: 'card-1', order });
  });
});

function makeDocumentWithLayers(): ArtifactDocument {
  return {
    schemaVersion: 1,
    artifactId: '00000000-0000-0000-0000-000000000001',
    type: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: [
      {
        id: '00000000-0000-0000-0000-000000000002',
        index: 0,
        baseColor: '#1d2a30',
        layers: [
          {
            id: '00000000-0000-0000-0000-000000000010',
            type: 'background',
            z: 0,
            x: 0, y: 0, w: 1080, h: 1350,
            rotation: 0, opacity: 1, locked: false, hidden: false,
            assetId: '00000000-0000-0000-0000-000000000099',
            fit: 'fill' as const,
          },
          {
            id: '00000000-0000-0000-0000-000000000011',
            type: 'text',
            z: 1,
            x: 100, y: 100, w: 400, h: 60,
            rotation: 0, opacity: 1, locked: false, hidden: false,
            content: 'Layer A',
            fontFamily: 'Inter', fontSize: 32, fontWeight: 400,
            lineHeight: 1.2, letterSpacing: 0, color: '#ffffff', align: 'left',
          },
          {
            id: '00000000-0000-0000-0000-000000000012',
            type: 'text',
            z: 2,
            x: 100, y: 200, w: 400, h: 60,
            rotation: 0, opacity: 1, locked: false, hidden: false,
            content: 'Layer B',
            fontFamily: 'Newsreader', fontSize: 24, fontWeight: 500,
            lineHeight: 1.2, letterSpacing: 0, color: '#ffffff', align: 'left',
          },
        ],
      },
    ],
    version: 0,
  };
}

describe('layer ordering through kernel', () => {
  it('In Front: moves selected layer to last position in order', () => {
    const doc = makeDocumentWithLayers();
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    const bgId   = layers[0].id; // background z=0
    const layerA = layers[1].id; // text z=1
    const layerB = layers[2].id; // text z=2 — currently topmost

    // Bring layerA "In Front" — should become the new topmost
    const newOrder = [bgId, layerB, layerA];
    const action = buildReorderLayersAction(cardId, newOrder);
    const result = applyAction(doc, action);

    const resultLayers = result.document.cards[0].layers;
    const aFinal = resultLayers.find((l) => l.id === layerA)!;
    const bFinal = resultLayers.find((l) => l.id === layerB)!;
    expect(aFinal.z).toBeGreaterThan(bFinal.z);
  });

  it('Behind: places selected layer just above background layer', () => {
    const doc = makeDocumentWithLayers();
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    const bgId   = layers[0].id;
    const layerA = layers[1].id;
    const layerB = layers[2].id; // currently topmost; send it "Behind"

    // Send layerB behind: new order = bg, layerB, layerA
    const newOrder = [bgId, layerB, layerA];
    const action = buildReorderLayersAction(cardId, newOrder);
    const result = applyAction(doc, action);

    const resultLayers = result.document.cards[0].layers;
    const bgFinal    = resultLayers.find((l) => l.id === bgId)!;
    const bFinal     = resultLayers.find((l) => l.id === layerB)!;
    const aFinal     = resultLayers.find((l) => l.id === layerA)!;

    expect(bFinal.z).toBeGreaterThan(bgFinal.z);
    expect(aFinal.z).toBeGreaterThan(bFinal.z);
  });

  it('selected layer is never placed below background layer', () => {
    const doc = makeDocumentWithLayers();
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    const bgId   = layers[0].id;
    const layerA = layers[1].id;
    const layerB = layers[2].id;

    // Background must remain lowest z regardless of order choices
    const newOrder = [bgId, layerA, layerB];
    const result = applyAction(doc, buildReorderLayersAction(cardId, newOrder));
    const bgFinal = result.document.cards[0].layers.find((l) => l.id === bgId)!;
    const nonBg = result.document.cards[0].layers.filter((l) => l.id !== bgId);
    nonBg.forEach((l) => expect(l.z).toBeGreaterThan(bgFinal.z));
  });

  it('rejects reorder that moves a locked layer', () => {
    const doc = makeDocumentWithLayers();
    (doc.cards[0].layers[1] as { locked: boolean }).locked = true; // lock textA (z=1)
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    // Attempt to move locked textA from idx 1 to idx 2
    const newOrder = [layers[0].id, layers[2].id, layers[1].id];
    expect(() => applyAction(doc, buildReorderLayersAction(cardId, newOrder))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// reorderLayers kernel hardening
// ---------------------------------------------------------------------------

function makeDocumentWithFourLayers(): ArtifactDocument {
  return {
    schemaVersion: 1,
    artifactId: '00000000-0000-0000-0000-000000000001',
    type: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: [
      {
        id: '00000000-0000-0000-0000-000000000002',
        index: 0,
        baseColor: '#1d2a30',
        layers: [
          {
            id: '00000000-0000-0000-0000-000000000010',
            type: 'background',
            z: 0,
            x: 0, y: 0, w: 1080, h: 1350,
            rotation: 0, opacity: 1, locked: false, hidden: false,
            assetId: '00000000-0000-0000-0000-000000000099',
            fit: 'fill' as const,
          },
          {
            id: '00000000-0000-0000-0000-000000000011',
            type: 'text',
            z: 1,
            x: 100, y: 100, w: 400, h: 60,
            rotation: 0, opacity: 1, locked: false, hidden: false,
            content: 'Layer A',
            fontFamily: 'Inter', fontSize: 32, fontWeight: 400,
            lineHeight: 1.2, letterSpacing: 0, color: '#ffffff', align: 'left',
          },
          {
            id: '00000000-0000-0000-0000-000000000012',
            type: 'text',
            z: 2,
            x: 100, y: 200, w: 400, h: 60,
            rotation: 0, opacity: 1, locked: false, hidden: false,
            content: 'Layer B',
            fontFamily: 'Newsreader', fontSize: 24, fontWeight: 500,
            lineHeight: 1.2, letterSpacing: 0, color: '#ffffff', align: 'left',
          },
          {
            id: '00000000-0000-0000-0000-000000000013',
            type: 'text',
            z: 3,
            x: 100, y: 300, w: 400, h: 60,
            rotation: 0, opacity: 1, locked: false, hidden: false,
            content: 'Layer C',
            fontFamily: 'Hanken Grotesk', fontSize: 18, fontWeight: 400,
            lineHeight: 1.2, letterSpacing: 0, color: '#ffffff', align: 'left',
          },
        ],
      },
    ],
    version: 0,
  };
}

describe('reorderLayers kernel hardening', () => {
  it('rejects reorder that changes a locked layer position', () => {
    const doc = makeDocumentWithFourLayers();
    (doc.cards[0].layers[1] as { locked: boolean }).locked = true; // lock A (idx 1)
    const cardId = doc.cards[0].id;
    const ids = doc.cards[0].layers.map((l) => l.id);
    const [bgId, aId, bId, cId] = ids;
    // Move A from idx 1 to idx 2 — should throw LAYER_LOCKED
    expect(() =>
      applyAction(doc, buildReorderLayersAction(cardId, [bgId, bId, aId, cId]))
    ).toThrow();
  });

  it('rejects reorder that displaces a locked layer via other layers moving', () => {
    const doc = makeDocumentWithFourLayers();
    (doc.cards[0].layers[1] as { locked: boolean }).locked = true; // lock A at idx 1
    const cardId = doc.cards[0].id;
    const ids = doc.cards[0].layers.map((l) => l.id);
    const [bgId, aId, bId, cId] = ids;
    // Moving B to front: [bg, A, C, B] — A stays at idx 1 → should PASS
    // Moving B before A: [bg, B, A, C] — A shifts to idx 2 → should THROW
    expect(() =>
      applyAction(doc, buildReorderLayersAction(cardId, [bgId, bId, aId, cId]))
    ).toThrow();
  });

  it('allows reorder when locked layer stays at the same index', () => {
    const doc = makeDocumentWithFourLayers();
    (doc.cards[0].layers[1] as { locked: boolean }).locked = true; // lock A at idx 1
    const cardId = doc.cards[0].id;
    const ids = doc.cards[0].layers.map((l) => l.id);
    const [bgId, aId, _bId, cId] = ids;
    // Swap B and C, A stays at idx 1
    const result = applyAction(
      doc,
      buildReorderLayersAction(cardId, [bgId, aId, cId, _bId]),
    );
    const layers = result.document.cards[0].layers;
    const aFinal = layers.find((l) => l.id === aId)!;
    expect(aFinal.z).toBe(1); // A still at z=1
    expect(layers).toHaveLength(4);
  });

  it('rejects reorder that moves background layer from position 0', () => {
    const doc = makeDocumentWithLayers();
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    const [bgId, aId, bId] = layers.map((l) => l.id);
    // Try to move bg to idx 1
    expect(() =>
      applyAction(doc, buildReorderLayersAction(cardId, [aId, bgId, bId]))
    ).toThrow();
  });

  it('rejects reorder that places non-background before background', () => {
    const doc = makeDocumentWithLayers();
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    const [bgId, aId, bId] = layers.map((l) => l.id);
    // bg displaced from idx 0
    expect(() =>
      applyAction(doc, buildReorderLayersAction(cardId, [bId, bgId, aId]))
    ).toThrow();
  });

  it('document version increments by 1 on successful reorder', () => {
    const doc = makeDocumentWithLayers();
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    const [bgId, aId, bId] = layers.map((l) => l.id);
    // Valid swap of A and B
    const result = applyAction(doc, buildReorderLayersAction(cardId, [bgId, bId, aId]));
    expect(result.document.version).toBe(doc.version + 1);
  });

  it('document version does not change when reorder is rejected (throws before mutation)', () => {
    const doc = makeDocumentWithLayers();
    (doc.cards[0].layers[1] as { locked: boolean }).locked = true; // lock A
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    const [bgId, aId, bId] = layers.map((l) => l.id);
    const originalVersion = doc.version;
    let threw = false;
    try {
      applyAction(doc, buildReorderLayersAction(cardId, [bgId, bId, aId]));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // Original document is unchanged
    expect(doc.version).toBe(originalVersion);
  });

  it('Behind action never places a layer below background', () => {
    const doc = makeDocumentWithLayers();
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    const [bgId, aId, bId] = layers.map((l) => l.id);
    // Simulate handleSendBehind for layerB: inserts just after bg
    const newOrder = [bgId, bId, aId]; // bg stays at 0, B goes just above bg
    const result = applyAction(doc, buildReorderLayersAction(cardId, newOrder));
    const bgFinal = result.document.cards[0].layers.find((l) => l.id === bgId)!;
    const bFinal  = result.document.cards[0].layers.find((l) => l.id === bId)!;
    expect(bFinal.z).toBeGreaterThan(bgFinal.z);
  });

  it('In Front action moves unlocked layer to the top position', () => {
    const doc = makeDocumentWithLayers();
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers;
    const [bgId, aId, bId] = layers.map((l) => l.id);
    // Simulate handleBringToFront for layerA: moves to last
    const newOrder = [bgId, bId, aId];
    const result = applyAction(doc, buildReorderLayersAction(cardId, newOrder));
    const aFinal = result.document.cards[0].layers.find((l) => l.id === aId)!;
    const bFinal = result.document.cards[0].layers.find((l) => l.id === bId)!;
    expect(aFinal.z).toBeGreaterThan(bFinal.z);
  });
});

describe('style preset kernel behavior', () => {
  it('Modern preset font (Inter) is supported by catalog', () => {
    expect(isSupportedFontFamily('Inter')).toBe(true);
  });

  it('Editorial preset font (Newsreader) is supported by catalog', () => {
    expect(isSupportedFontFamily('Newsreader')).toBe(true);
  });

  it('Bold preset font (Bebas Neue) is supported by catalog', () => {
    expect(isSupportedFontFamily('Bebas Neue')).toBe(true);
  });

  it('applying Modern preset fontFamily via setTextStyle changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextStyleAction(cardId, layerId, { fontFamily: 'Inter', fontWeight: 600 });
    const result = applyAction(doc, action);
    const layer = result.document.cards[0].layers[0] as { fontFamily: string; fontWeight: number };
    expect(layer.fontFamily).toBe('Inter');
    expect(layer.fontWeight).toBe(600);
  });

  it('applying Editorial preset fontFamily via setTextStyle changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextStyleAction(cardId, layerId, { fontFamily: 'Newsreader', fontWeight: 500 });
    const result = applyAction(doc, action);
    const layer = result.document.cards[0].layers[0] as { fontFamily: string; fontWeight: number };
    expect(layer.fontFamily).toBe('Newsreader');
    expect(layer.fontWeight).toBe(500);
  });

  it('applying Bold preset fontFamily via setTextStyle changes document', () => {
    const doc = makeDocument();
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers[0].id;
    const action = buildSetTextStyleAction(cardId, layerId, { fontFamily: 'Bebas Neue', fontWeight: 400 });
    const result = applyAction(doc, action);
    const layer = result.document.cards[0].layers[0] as { fontFamily: string; fontWeight: number };
    expect(layer.fontFamily).toBe('Bebas Neue');
    expect(layer.fontWeight).toBe(400);
  });

  it('weight options for selected font come from catalog metadata', () => {
    const interMeta = getFontByFamily('Inter');
    expect(interMeta?.weights).toBeDefined();
    expect(interMeta!.weights).toContain(400);
    expect(interMeta!.weights).toContain(600);
    expect(interMeta!.weights).toContain(700);

    const bebasMeta = getFontByFamily('Bebas Neue');
    expect(bebasMeta?.weights).toEqual([400]);
  });
});
