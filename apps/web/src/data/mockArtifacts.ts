import {
  type ArtifactDocument,
  type TextLayer,
  type BackgroundLayer,
  type ShapeLayer,
  type OverlayLayer,
  type LogoLayer,
  type ImageLayer,
  type ObjectLayer,
  type Layer,
  type Card,
} from '@orra/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _id = 0;
const nid = () => {
  _id++;
  // Return deterministic fake UUIDs for mocks so they stay consistent
  return `00000000-0000-0000-0000-${String(_id).padStart(12, '0')}`;
};

export function makeTextLayer(overrides?: Partial<TextLayer> & { content?: string }): TextLayer {
  return {
    id: nid(),
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

export function makeBackgroundLayer(overrides?: Partial<BackgroundLayer>): BackgroundLayer {
  return {
    id: nid(),
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
    assetId: nid(),
    fit: 'cover',
    ...overrides,
  };
}

export function makeShapeLayer(overrides?: Partial<ShapeLayer>): ShapeLayer {
  return {
    id: nid(),
    type: 'shape',
    z: 0,
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

export function makeOverlayLayer(overrides?: Partial<OverlayLayer>): OverlayLayer {
  return {
    id: nid(),
    type: 'overlay',
    z: 0,
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

export function makeLogoLayer(overrides?: Partial<LogoLayer>): LogoLayer {
  return {
    id: nid(),
    type: 'logo',
    z: 0,
    x: 900,
    y: 1200,
    w: 120,
    h: 80,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    assetId: nid(),
    fit: 'contain',
    aiManaged: false,
    ...overrides,
  };
}

export function makeImageLayer(overrides?: Partial<ImageLayer>): ImageLayer {
  return {
    id: nid(),
    type: 'image',
    z: 0,
    x: 50,
    y: 50,
    w: 200,
    h: 200,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    assetId: nid(),
    fit: 'contain',
    ...overrides,
  };
}

export function makeObjectLayer(overrides?: Partial<ObjectLayer>): ObjectLayer {
  return {
    id: nid(),
    type: 'object',
    z: 0,
    x: 200,
    y: 200,
    w: 150,
    h: 150,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    assetId: nid(),
    fit: 'contain',
    aiManaged: true,
    ...overrides,
  };
}

export function normalizeZ(layers: Layer[]): Layer[] {
  return layers.map((l, i) => ({ ...l, z: i }));
}

export function makeCard(overrides?: Partial<Card> & { layers?: Layer[] }): Card {
  const layers = overrides?.layers ?? [
    makeBackgroundLayer({ z: 0 }),
    makeTextLayer({ z: 1 }),
  ];
  return {
    id: nid(),
    index: 0,
    baseColor: '#ffffff',
    layers: normalizeZ(layers),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock single post
// ---------------------------------------------------------------------------

export function mockSinglePost(): ArtifactDocument {
  _id = 0;
  const bg = makeBackgroundLayer({ z: 0, w: 1080, h: 1350 });
  const accent = makeShapeLayer({
    z: 1,
    x: 0,
    y: 0,
    w: 1080,
    h: 8,
    opacity: 1,
    fill: '#354e53',
    shapeKind: 'rect',
  });
  const overlay = makeOverlayLayer({
    z: 2,
    overlayKind: 'linearGradient',
    params: {
      stops: [
        { offset: 0, color: '#243338' },
        { offset: 1, color: '#1d2a30' },
      ],
      angle: 165,
    },
    opacity: 1,
  });
  const headline = makeTextLayer({
    z: 3,
    content: 'Do less,\nbut finish.',
    x: 120,
    y: 360,
    w: 840,
    h: 320,
    fontFamily: 'Newsreader',
    fontSize: 96,
    fontWeight: 500,
    color: '#f1f4f4',
    align: 'left',
    lineHeight: 1.02,
    letterSpacing: -1,
  });
  const subhead = makeTextLayer({
    z: 4,
    content: 'A note on focus',
    x: 120,
    y: 260,
    w: 600,
    h: 48,
    fontFamily: 'Hanken Grotesk',
    fontSize: 24,
    fontWeight: 700,
    color: '#a4b7bd',
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 2,
  });
  const handle = makeTextLayer({
    z: 5,
    content: '@still.studio',
    x: 120,
    y: 1180,
    w: 400,
    h: 40,
    fontFamily: 'Hanken Grotesk',
    fontSize: 24,
    fontWeight: 600,
    color: '#5e7680',
    align: 'left',
    lineHeight: 1.2,
  });

  const card = makeCard({
    index: 0,
    baseColor: '#1d2a30',
    layers: normalizeZ([bg, accent, overlay, headline, subhead, handle]),
  });

  return {
    schemaVersion: 1,
    artifactId: nid(),
    type: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: [card],
    version: 0,
  };
}

// ---------------------------------------------------------------------------
// Mock carousel
// ---------------------------------------------------------------------------

export function mockCarousel(): ArtifactDocument {
  _id = 0;
  const handle = '@still.studio';

  const c1 = makeCard({
    index: 0,
    baseColor: '#1d2a30',
    layers: normalizeZ([
      makeBackgroundLayer({ z: 0 }),
      makeOverlayLayer({
        z: 1,
        overlayKind: 'linearGradient',
        params: {
          stops: [
            { offset: 0, color: '#243338' },
            { offset: 1, color: '#1d2a30' },
          ],
          angle: 165,
        },
        opacity: 1,
      }),
      makeTextLayer({
        z: 2,
        content: 'FIVE QUIET HABITS',
        x: 108,
        y: 189,
        w: 864,
        h: 40,
        fontFamily: 'Hanken Grotesk',
        fontSize: 34,
        fontWeight: 700,
        color: '#a4b7bd',
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 2,
      }),
      makeTextLayer({
        z: 3,
        content: 'that changed how I work',
        x: 108,
        y: 260,
        w: 864,
        h: 300,
        fontFamily: 'Newsreader',
        fontSize: 86,
        fontWeight: 500,
        color: '#f1f4f4',
        align: 'left',
        lineHeight: 1.05,
        letterSpacing: -1,
      }),
      makeTextLayer({
        z: 4,
        content: 'A slow guide to doing less, better.',
        x: 108,
        y: 999,
        w: 756,
        h: 48,
        fontFamily: 'Hanken Grotesk',
        fontSize: 24,
        fontWeight: 500,
        color: '#c8d1d8',
        align: 'left',
        lineHeight: 1.4,
      }),
      makeTextLayer({
        z: 5,
        content: handle,
        x: 108,
        y: 1188,
        w: 400,
        h: 40,
        fontFamily: 'Hanken Grotesk',
        fontSize: 24,
        fontWeight: 600,
        color: '#5e7680',
        align: 'left',
        lineHeight: 1.2,
      }),
    ]),
  });

  const c2 = makeCard({
    index: 1,
    baseColor: '#354e53',
    layers: normalizeZ([
      makeBackgroundLayer({ z: 0 }),
      makeTextLayer({
        z: 1,
        content: '01',
        x: 108,
        y: 162,
        w: 324,
        h: 160,
        fontFamily: 'Newsreader',
        fontSize: 118,
        fontWeight: 600,
        color: '#f1f4f4',
        align: 'left',
        lineHeight: 1.0,
        opacity: 0.5,
      }),
      makeTextLayer({
        z: 2,
        content: 'Start before\nyou feel ready',
        x: 108,
        y: 459,
        w: 864,
        h: 260,
        fontFamily: 'Newsreader',
        fontSize: 76,
        fontWeight: 500,
        color: '#f1f4f4',
        align: 'left',
        lineHeight: 1.06,
      }),
      makeTextLayer({
        z: 3,
        content: 'Readiness is a feeling that arrives after you begin — rarely before.',
        x: 108,
        y: 891,
        w: 800,
        h: 100,
        fontFamily: 'Hanken Grotesk',
        fontSize: 24,
        fontWeight: 500,
        color: '#e6eaeb',
        align: 'left',
        lineHeight: 1.4,
        opacity: 0.95,
      }),
    ]),
  });

  const c3 = makeCard({
    index: 2,
    baseColor: '#eef1f1',
    layers: normalizeZ([
      makeBackgroundLayer({ z: 0 }),
      makeTextLayer({
        z: 1,
        content: '02',
        x: 108,
        y: 162,
        w: 324,
        h: 160,
        fontFamily: 'Newsreader',
        fontSize: 118,
        fontWeight: 600,
        color: '#1d2a30',
        align: 'left',
        lineHeight: 1.0,
        opacity: 0.28,
      }),
      makeTextLayer({
        z: 2,
        content: 'Protect your\nfirst hour',
        x: 108,
        y: 459,
        w: 864,
        h: 260,
        fontFamily: 'Newsreader',
        fontSize: 76,
        fontWeight: 500,
        color: '#1d2a30',
        align: 'left',
        lineHeight: 1.06,
      }),
      makeTextLayer({
        z: 3,
        content: 'The first hour sets the tone for the whole day. Spend it on intent, not input.',
        x: 108,
        y: 891,
        w: 820,
        h: 100,
        fontFamily: 'Hanken Grotesk',
        fontSize: 24,
        fontWeight: 500,
        color: '#5e7680',
        align: 'left',
        lineHeight: 1.4,
        opacity: 1,
      }),
    ]),
  });

  const c4 = makeCard({
    index: 3,
    baseColor: '#c8d1d8',
    layers: normalizeZ([
      makeBackgroundLayer({ z: 0 }),
      makeTextLayer({
        z: 1,
        content: '03',
        x: 108,
        y: 162,
        w: 324,
        h: 160,
        fontFamily: 'Newsreader',
        fontSize: 118,
        fontWeight: 600,
        color: '#1d2a30',
        align: 'left',
        lineHeight: 1.0,
        opacity: 0.3,
      }),
      makeTextLayer({
        z: 2,
        content: 'Say no without\nthe paragraph',
        x: 108,
        y: 459,
        w: 864,
        h: 260,
        fontFamily: 'Newsreader',
        fontSize: 72,
        fontWeight: 500,
        color: '#1d2a30',
        align: 'left',
        lineHeight: 1.06,
      }),
      makeTextLayer({
        z: 3,
        content: "A clear no protects a clear yes. You don't owe anyone the explanation.",
        x: 108,
        y: 891,
        w: 800,
        h: 100,
        fontFamily: 'Hanken Grotesk',
        fontSize: 24,
        fontWeight: 500,
        color: '#2c4146',
        align: 'left',
        lineHeight: 1.4,
        opacity: 0.95,
      }),
    ]),
  });

  const c5 = makeCard({
    index: 4,
    baseColor: '#1d2a30',
    layers: normalizeZ([
      makeBackgroundLayer({ z: 0 }),
      makeTextLayer({
        z: 1,
        content: 'Save this for\nthe next slow week',
        x: 108,
        y: 378,
        w: 864,
        h: 260,
        fontFamily: 'Newsreader',
        fontSize: 76,
        fontWeight: 500,
        color: '#f1f4f4',
        align: 'left',
        lineHeight: 1.06,
      }),
      makeTextLayer({
        z: 2,
        content: 'Follow for calm notes on work & craft.',
        x: 108,
        y: 837,
        w: 780,
        h: 48,
        fontFamily: 'Hanken Grotesk',
        fontSize: 24,
        fontWeight: 500,
        color: '#c8d1d8',
        align: 'left',
        lineHeight: 1.4,
        opacity: 0.92,
      }),
      makeTextLayer({
        z: 3,
        content: handle,
        x: 108,
        y: 1134,
        w: 400,
        h: 40,
        fontFamily: 'Hanken Grotesk',
        fontSize: 24,
        fontWeight: 700,
        color: '#a4b7bd',
        align: 'left',
        lineHeight: 1.2,
      }),
    ]),
  });

  return {
    schemaVersion: 1,
    artifactId: nid(),
    type: 'carousel',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: [c1, c2, c3, c4, c5],
    version: 0,
  };
}

// ---------------------------------------------------------------------------
// Re-export convenience generators for workspace
// ---------------------------------------------------------------------------

export function makeArtifactSinglePost(brandHandle?: string): ArtifactDocument {
  const doc = mockSinglePost();
  if (brandHandle) {
    const textLayers = doc.cards[0].layers.filter((l): l is TextLayer => l.type === 'text');
    const handleLayer = textLayers.find((l) => l.content.includes('@'));
    if (handleLayer) {
      handleLayer.content = brandHandle;
    }
  }
  return doc;
}

export function makeArtifactCarousel(brandHandle?: string): ArtifactDocument {
  const doc = mockCarousel();
  if (brandHandle) {
    for (const card of doc.cards) {
      const textLayers = card.layers.filter((l): l is TextLayer => l.type === 'text');
      const handleLayer = textLayers.find((l) => l.content.includes('@still.studio'));
      if (handleLayer) {
        handleLayer.content = brandHandle;
      }
    }
  }
  return doc;
}
