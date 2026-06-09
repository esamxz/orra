import { describe, it, expect } from 'vitest';
import { generateMockArtifactDocument } from '../services/mockArtifactGenerator.js';
import { ArtifactDocumentSchema } from '@orra/shared';
import type { ArtifactDocument } from '@orra/shared';

function makeEmptyDocument(type: 'post' | 'carousel' = 'post'): ArtifactDocument {
  return {
    schemaVersion: 1,
    artifactId: '11111111-1111-1111-1111-111111111111',
    type,
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        index: 0,
        baseColor: '#1d2a30',
        layers: [],
      },
    ],
    version: 1,
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('generateMockArtifactDocument', () => {
  it('produces a schema-valid document for a post', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
    });
    const parsed = ArtifactDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  it('produces a schema-valid document for a carousel', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('carousel'),
      targetCardCount: 3,
    });
    const parsed = ArtifactDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    expect(doc.cards).toHaveLength(3);
  });

  it('increments document version', () => {
    const current = makeEmptyDocument('post');
    const doc = generateMockArtifactDocument({
      currentDocument: current,
      targetCardCount: 1,
    });
    expect(doc.version).toBe(current.version + 1);
  });

  it('preserves artifactId, type, and ratio', () => {
    const current = makeEmptyDocument('post');
    const doc = generateMockArtifactDocument({
      currentDocument: current,
      targetCardCount: 1,
    });
    expect(doc.artifactId).toBe(current.artifactId);
    expect(doc.type).toBe(current.type);
    expect(doc.ratio).toEqual(current.ratio);
  });

  // ---------------------------------------------------------------------------
  // Brand context: colors
  // ---------------------------------------------------------------------------

  it('uses brand background color for baseColor when valid', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        colors: { background: '#ff0000' },
      },
    });
    expect(doc.cards[0].baseColor).toBe('#ff0000');
  });

  it('falls back to brand primary for baseColor when background is missing', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        colors: { primary: '#00ff00' },
      },
    });
    expect(doc.cards[0].baseColor).toBe('#00ff00');
  });

  it('falls back to Orra palette when no brand colors are valid', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        colors: { background: 'not-a-color', primary: 'bad' },
      },
    });
    expect(doc.cards[0].baseColor).toBe('#1d2a30');
  });

  it('uses brand text color for title and body when valid', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        colors: { text: '#123456' },
      },
    });
    const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
      import('@orra/shared').TextLayer
    >;
    const title = textLayers.find((l) => l.role === 'title')!;
    const body = textLayers.find((l) => l.role === 'body')!;
    expect(title.color).toBe('#123456');
    expect(body.color).toBe('#123456');
  });

  it('uses brand accent for shape when valid', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        colors: { accent: '#abcdef' },
      },
    });
    const shape = doc.cards[0].layers.find((l) => l.type === 'shape') as
      import('@orra/shared').ShapeLayer;
    expect(shape.fill).toBe('#abcdef');
  });

  it('falls back to brand secondary for shape when accent is missing', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        colors: { secondary: '#fedcba' },
      },
    });
    const shape = doc.cards[0].layers.find((l) => l.type === 'shape') as
      import('@orra/shared').ShapeLayer;
    expect(shape.fill).toBe('#fedcba');
  });

  it('uses brand colors in overlay gradient when valid', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        colors: { background: '#111111', primary: '#222222' },
      },
    });
    const overlay = doc.cards[0].layers.find((l) => l.type === 'overlay') as
      import('@orra/shared').OverlayLayer;
    expect(overlay.overlayKind).toBe('linearGradient');
    const stops = overlay.params.stops!;
    expect(stops[0].color).toBe('#111111');
    expect(stops[1].color).toBe('#222222');
  });

  // ---------------------------------------------------------------------------
  // Brand context: fonts
  // ---------------------------------------------------------------------------

  it('uses brand heading font for title when valid', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        typography: { headingFont: 'Newsreader' },
      },
    });
    const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
      import('@orra/shared').TextLayer
    >;
    const title = textLayers.find((l) => l.role === 'title')!;
    expect(title.fontFamily).toBe('Newsreader');
  });

  it('uses brand body font for body text when valid', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        typography: { bodyFont: 'Inter' },
      },
    });
    const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
      import('@orra/shared').TextLayer
    >;
    const body = textLayers.find((l) => l.role === 'body')!;
    expect(body.fontFamily).toBe('Inter');
  });

  it('falls back to default fonts for invalid brand font names', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Test Brand',
        typography: { headingFont: 'Comic Sans', bodyFont: 'Papyrus' },
      },
    });
    const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
      import('@orra/shared').TextLayer
    >;
    const title = textLayers.find((l) => l.role === 'title')!;
    const body = textLayers.find((l) => l.role === 'body')!;
    expect(title.fontFamily).toBe('Newsreader');
    expect(body.fontFamily).toBe('Inter');
  });

  // ---------------------------------------------------------------------------
  // No brand context
  // ---------------------------------------------------------------------------

  it('uses Orra defaults when brandContext is null', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: null,
    });
    expect(doc.cards[0].baseColor).toBe('#1d2a30');
    const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
      import('@orra/shared').TextLayer
    >;
    const title = textLayers.find((l) => l.role === 'title')!;
    const body = textLayers.find((l) => l.role === 'body')!;
    expect(title.color).toBe('#c8d1d8');
    expect(title.fontFamily).toBe('Newsreader');
    expect(body.color).toBe('#a4b7bd');
    expect(body.fontFamily).toBe('Inter');
  });

  it('uses Orra defaults when brandContext is undefined', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
    });
    expect(doc.cards[0].baseColor).toBe('#1d2a30');
  });

  it('ignores empty brand context object and falls back', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      brandContext: {
        brandSystemId: 'brand-1',
        name: 'Empty Brand',
      },
    });
    expect(doc.cards[0].baseColor).toBe('#1d2a30');
    const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
      import('@orra/shared').TextLayer
    >;
    const title = textLayers.find((l) => l.role === 'title')!;
    expect(title.fontFamily).toBe('Newsreader');
  });

  // ---------------------------------------------------------------------------
  // Layer composition
  // ---------------------------------------------------------------------------

  it('post contains overlay, shape, title, and body layers', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
    });
    expect(doc.cards[0].layers).toHaveLength(4);
    const types = doc.cards[0].layers.map((l) => l.type);
    expect(types).toContain('overlay');
    expect(types).toContain('shape');
    expect(types).toContain('text');
  });

  it('carousel card includes index text layer', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('carousel'),
      targetCardCount: 3,
    });
    expect(doc.cards[0].layers).toHaveLength(5);
    const indexLayer = doc.cards[0].layers.find(
      (l) => l.type === 'text' && (l as import('@orra/shared').TextLayer).role === 'caption'
    );
    expect(indexLayer).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Topic integration
  // ---------------------------------------------------------------------------

  it('uses topic in title text when provided', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      targetCardCount: 1,
      topic: 'mindfulness',
    });
    const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
      import('@orra/shared').TextLayer
    >;
    const title = textLayers.find((l) => l.role === 'title')!;
    expect(title.content).toContain('mindfulness');
  });
});
