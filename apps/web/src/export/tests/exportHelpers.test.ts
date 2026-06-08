import { describe, it, expect } from 'vitest';
import { buildExportFilename, waitForFonts, buildZipFilename, assertCarouselExportReady } from '../exportHelpers.js';
import { buildCardRenderData, type RenderTextLayer } from '@orra/renderer';
import {
  makeExportFixtureDoc,
  FIXTURE_HIDDEN_LAYER_ID,
  FIXTURE_LOCKED_LAYER_ID,
  FIXTURE_HIDDEN_LAYER_SENTINEL,
} from './exportFixture.js';
import type {
  ArtifactDocument,
  Card,
  TextLayer,
  BackgroundLayer,
  Layer,
} from '@orra/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `00000000-0000-0000-0000-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeTextLayer(overrides?: Partial<TextLayer>): TextLayer {
  return {
    id: mockId(),
    type: 'text',
    z: 1,
    x: 100,
    y: 100,
    w: 400,
    h: 60,
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
    color: '#000000',
    align: 'left',
    ...overrides,
  };
}

function makeBackgroundLayer(overrides?: Partial<BackgroundLayer>): BackgroundLayer {
  return {
    id: mockId(),
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
    assetId: mockId(),
    fit: 'cover',
    ...overrides,
  };
}

function makeCard(layers: Layer[] = [], overrides?: Partial<Card>): Card {
  return {
    id: mockId(),
    index: 0,
    baseColor: '#ffffff',
    layers: layers.length ? layers : [makeBackgroundLayer(), makeTextLayer()],
    ...overrides,
  };
}

function makeDocument(overrides?: Partial<ArtifactDocument>): ArtifactDocument {
  return {
    schemaVersion: 1,
    artifactId: mockId(),
    type: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: [makeCard()],
    version: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildExportFilename
// ---------------------------------------------------------------------------

describe('buildExportFilename', () => {
  it('returns orra-card-01.png when no project name and index 0', () => {
    expect(buildExportFilename(undefined, 0)).toBe('orra-card-01.png');
  });

  it('pads single-digit card indexes to two digits', () => {
    expect(buildExportFilename(undefined, 4)).toBe('orra-card-05.png');
  });

  it('uses project name slug when provided', () => {
    expect(buildExportFilename('My Project', 0)).toBe('my-project-01.png');
  });

  it('slugifies special characters in project name', () => {
    expect(buildExportFilename('Hello World! 2025', 0)).toBe('hello-world-2025-01.png');
  });

  it('falls back to orra-card when project name is empty string', () => {
    expect(buildExportFilename('', 0)).toBe('orra-card-01.png');
  });

  it('falls back to orra-card when project name is only whitespace', () => {
    expect(buildExportFilename('   ', 0)).toBe('orra-card-01.png');
  });

  it('falls back to orra-card when slug collapses to empty after cleaning', () => {
    expect(buildExportFilename('---!!!---', 0)).toBe('orra-card-01.png');
  });

  it('uses card index in filename with project name', () => {
    expect(buildExportFilename('Orra Test', 2)).toBe('orra-test-03.png');
  });
});

// ---------------------------------------------------------------------------
// waitForFonts
// ---------------------------------------------------------------------------

describe('waitForFonts', () => {
  it('resolves immediately in a node environment (no document)', async () => {
    // In node env, typeof document === 'undefined', so it resolves with no-op
    await expect(waitForFonts()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Export pipeline — document validation (via buildCardRenderData)
// ---------------------------------------------------------------------------

describe('export pipeline — document and card validation', () => {
  it('export dimensions come from document ratio, not viewport', () => {
    const doc = makeDocument();
    const result = buildCardRenderData(doc, 0);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
  });

  it('dimensions reflect the actual ratio in the document', () => {
    const doc = makeDocument({ ratio: { name: '1:1', w: 1080, h: 1080 } });
    const result = buildCardRenderData(doc, 0);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
  });

  it('hidden layers are excluded from export render data', () => {
    const visible = makeTextLayer({ z: 1, hidden: false, content: 'Visible' });
    const hidden = makeTextLayer({ z: 2, hidden: true, content: 'Hidden' });
    const doc = makeDocument({
      cards: [makeCard([makeBackgroundLayer({ z: 0 }), visible, hidden])],
    });
    const result = buildCardRenderData(doc, 0);
    expect(result.layers.some((l) => l.kind === 'text' && (l as typeof l & { content: string }).content === 'Hidden')).toBe(false);
    expect(result.layers.some((l) => l.kind === 'text' && (l as typeof l & { content: string }).content === 'Visible')).toBe(true);
  });

  it('rejects an invalid document', () => {
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

  it('rejects an out-of-range card index', () => {
    const doc = makeDocument();
    expect(() => buildCardRenderData(doc, 5)).toThrow('Card index 5 not found');
  });

  it('active card index selects the correct card', () => {
    const doc: ArtifactDocument = {
      schemaVersion: 1,
      artifactId: crypto.randomUUID(),
      type: 'carousel',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      cards: [
        makeCard([], { index: 0, baseColor: '#111111' }),
        makeCard([], { index: 1, baseColor: '#222222' }),
        makeCard([], { index: 2, baseColor: '#333333' }),
      ],
      version: 0,
    };
    expect(buildCardRenderData(doc, 0).baseColor).toBe('#111111');
    expect(buildCardRenderData(doc, 1).baseColor).toBe('#222222');
    expect(buildCardRenderData(doc, 2).baseColor).toBe('#333333');
  });
});

// ---------------------------------------------------------------------------
// buildZipFilename
// ---------------------------------------------------------------------------

describe('buildZipFilename', () => {
  it('returns orra-carousel.zip when no project name', () => {
    expect(buildZipFilename(undefined)).toBe('orra-carousel.zip');
  });

  it('returns orra-carousel.zip when project name is empty string', () => {
    expect(buildZipFilename('')).toBe('orra-carousel.zip');
  });

  it('returns orra-carousel.zip when project name is only whitespace', () => {
    expect(buildZipFilename('   ')).toBe('orra-carousel.zip');
  });

  it('returns orra-carousel.zip when slug collapses to empty after cleaning', () => {
    expect(buildZipFilename('---!!!---')).toBe('orra-carousel.zip');
  });

  it('uses project name slug when provided', () => {
    expect(buildZipFilename('My Project')).toBe('my-project-carousel.zip');
  });

  it('slugifies special characters in project name', () => {
    expect(buildZipFilename('Self Improvement! 2025')).toBe('self-improvement-2025-carousel.zip');
  });

  it('strips leading and trailing hyphens from slug', () => {
    expect(buildZipFilename('  Test  ')).toBe('test-carousel.zip');
  });
});

// ---------------------------------------------------------------------------
// assertCarouselExportReady
// ---------------------------------------------------------------------------

describe('assertCarouselExportReady', () => {
  it('does not throw for a document with 2 cards', () => {
    const doc = makeDocument({ type: 'carousel', cards: [makeCard([], { index: 0 }), makeCard([], { index: 1 })] });
    expect(() => assertCarouselExportReady(doc)).not.toThrow();
  });

  it('does not throw for a document with 5 cards', () => {
    const cards = Array.from({ length: 5 }, (_, i) => makeCard([], { index: i }));
    const doc = makeDocument({ type: 'carousel', cards });
    expect(() => assertCarouselExportReady(doc)).not.toThrow();
  });

  it('throws for a single-card document', () => {
    const doc = makeDocument({ cards: [makeCard([], { index: 0 })] });
    expect(() => assertCarouselExportReady(doc)).toThrow('at least 2 cards');
  });

  it('throws for a zero-card document', () => {
    const doc = makeDocument({ cards: [] });
    expect(() => assertCarouselExportReady(doc)).toThrow('at least 2 cards');
  });
});

// ---------------------------------------------------------------------------
// Carousel card ordering (via buildCardRenderData)
// ---------------------------------------------------------------------------

describe('carousel card ordering for ZIP export', () => {
  it('card data is retrieved in document array order', () => {
    const doc: ArtifactDocument = {
      schemaVersion: 1,
      artifactId: crypto.randomUUID(),
      type: 'carousel',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      cards: [
        makeCard([], { index: 0, baseColor: '#aaaaaa' }),
        makeCard([], { index: 1, baseColor: '#bbbbbb' }),
        makeCard([], { index: 2, baseColor: '#cccccc' }),
      ],
      version: 0,
    };
    // Simulate the ZIP loop: iterate by array position
    for (let i = 0; i < doc.cards.length; i++) {
      const data = buildCardRenderData(doc, i);
      expect(data.baseColor).toBe(doc.cards[i].baseColor);
    }
  });

  it('PNG filenames for carousel cards are zero-padded and in order', () => {
    const filenames = [0, 1, 2, 3, 4].map((i) => buildExportFilename(undefined, i));
    expect(filenames).toEqual([
      'orra-card-01.png',
      'orra-card-02.png',
      'orra-card-03.png',
      'orra-card-04.png',
      'orra-card-05.png',
    ]);
  });

  it('PNG filenames with project name are zero-padded and in order', () => {
    const filenames = [0, 1, 2].map((i) => buildExportFilename('Growth Tips', i));
    expect(filenames).toEqual([
      'growth-tips-01.png',
      'growth-tips-02.png',
      'growth-tips-03.png',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Export fidelity audit
// ---------------------------------------------------------------------------

describe('export fidelity audit', () => {
  it('locked visible layer is included in export render data', () => {
    const doc = makeExportFixtureDoc();
    const result = buildCardRenderData(doc, 0);
    const lockedLayer = result.layers.find((l) => l.id === FIXTURE_LOCKED_LAYER_ID);
    expect(lockedLayer).toBeDefined();
    expect(lockedLayer?.locked).toBe(true);
  });

  it('locked hidden layer is excluded from export render data', () => {
    const hiddenLockedLayer: TextLayer = {
      id: '00000000-0000-0000-0000-000000000099',
      type: 'text',
      z: 20, x: 0, y: 0, w: 100, h: 40,
      rotation: 0, opacity: 1,
      locked: true, hidden: true,
      content: 'should not appear',
      fontFamily: 'Hanken Grotesk',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: 0,
      color: '#ffffff',
      align: 'left',
    };
    const doc = makeExportFixtureDoc();
    doc.cards[0].layers.push(hiddenLockedLayer);
    const result = buildCardRenderData(doc, 0);
    expect(result.layers.find((l) => l.id === '00000000-0000-0000-0000-000000000099')).toBeUndefined();
  });

  it('export fixture validates cleanly', () => {
    const doc = makeExportFixtureDoc();
    expect(() => buildCardRenderData(doc, 0)).not.toThrow();
  });

  it('export fixture render layer count excludes the hidden layer', () => {
    const doc = makeExportFixtureDoc();
    // 12 total layers, 1 hidden → 11 in render result
    const result = buildCardRenderData(doc, 0);
    expect(result.layers.length).toBe(11);
  });

  it('export fixture includes the locked visible layer', () => {
    const doc = makeExportFixtureDoc();
    const result = buildCardRenderData(doc, 0);
    expect(result.layers.some((l) => l.locked === true)).toBe(true);
  });

  it('export fixture excludes the hidden layer by sentinel content', () => {
    const doc = makeExportFixtureDoc();
    const result = buildCardRenderData(doc, 0);
    const hasHiddenSentinel = result.layers.some(
      (l) => l.kind === 'text' && (l as RenderTextLayer).content === FIXTURE_HIDDEN_LAYER_SENTINEL,
    );
    expect(hasHiddenSentinel).toBe(false);
  });

  it('hidden layer id is absent from render result', () => {
    const doc = makeExportFixtureDoc();
    const result = buildCardRenderData(doc, 0);
    expect(result.layers.find((l) => l.id === FIXTURE_HIDDEN_LAYER_ID)).toBeUndefined();
  });

  it('export dimensions are independent of viewport — come only from document ratio', () => {
    const doc45 = makeExportFixtureDoc(); // 4:5 → 1080×1350
    const doc11: ArtifactDocument = {
      ...doc45,
      artifactId: '00000000-0000-0000-0000-000000000003',
      ratio: { name: '1:1', w: 1080, h: 1080 },
    };
    const result45 = buildCardRenderData(doc45, 0);
    const result11 = buildCardRenderData(doc11, 0);
    expect(result45.width).toBe(1080);
    expect(result45.height).toBe(1350);
    expect(result11.width).toBe(1080);
    expect(result11.height).toBe(1080);
    // Calling again produces identical values — no viewport state
    expect(buildCardRenderData(doc45, 0).width).toBe(result45.width);
    expect(buildCardRenderData(doc45, 0).height).toBe(result45.height);
  });
});
