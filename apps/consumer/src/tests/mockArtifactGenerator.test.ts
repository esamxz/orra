import { describe, it, expect } from 'vitest';
import { generateMockArtifactDocument, generateMockSingleCard } from '../services/mockArtifactGenerator.js';
import { ArtifactDocumentSchema } from '@orra/shared';
import type { ArtifactDocument } from '@orra/shared';
import type { TextPlanResult } from '@orra/ai';

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

function makePlan(overrides: Partial<TextPlanResult> = {}): TextPlanResult {
  return {
    title: 'Test Title',
    summary: 'A test plan.',
    cardCount: 1,
    body: 'Test body content.',
    styleNotes: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('generateMockArtifactDocument', () => {
  it('produces a schema-valid document for a post', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ cardCount: 1 }),
      brandContext: null,
    });
    const parsed = ArtifactDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  it('produces a schema-valid document for a carousel', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('carousel'),
      plan: makePlan({ cardCount: 3 }),
      brandContext: null,
    });
    const parsed = ArtifactDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    expect(doc.cards).toHaveLength(3);
  });

  it('increments document version', () => {
    const current = makeEmptyDocument('post');
    const doc = generateMockArtifactDocument({
      currentDocument: current,
      plan: makePlan({ cardCount: 1 }),
      brandContext: null,
    });
    expect(doc.version).toBe(current.version + 1);
  });

  it('preserves artifactId, type, and ratio', () => {
    const current = makeEmptyDocument('post');
    const doc = generateMockArtifactDocument({
      currentDocument: current,
      plan: makePlan({ cardCount: 1 }),
      brandContext: null,
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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
      plan: makePlan({ cardCount: 1 }),
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

  it('uses Orra defaults when brandContext is undefined (omitted)', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ cardCount: 1 }),
      brandContext: null,
    });
    expect(doc.cards[0].baseColor).toBe('#1d2a30');
  });

  it('ignores empty brand context object and falls back', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ cardCount: 1 }),
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

  it('post without CTA contains overlay, shape, title, and body layers (4 total)', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ cardCount: 1 }),
      brandContext: null,
    });
    expect(doc.cards[0].layers).toHaveLength(4);
    const types = doc.cards[0].layers.map((l) => l.type);
    expect(types).toContain('overlay');
    expect(types).toContain('shape');
    expect(types).toContain('text');
  });

  it('carousel card without CTA includes index text layer (5 total)', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('carousel'),
      plan: makePlan({ cardCount: 3 }),
      brandContext: null,
    });
    expect(doc.cards[0].layers).toHaveLength(5);
    const indexLayer = doc.cards[0].layers.find(
      (l) => l.type === 'text' && (l as import('@orra/shared').TextLayer).role === 'caption'
    );
    expect(indexLayer).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Phase 14A: plan-driven content
  // ---------------------------------------------------------------------------

  describe('Phase 14A: plan-driven content', () => {
    it('plan.title appears in title layer (no Mock: prefix)', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({ title: 'mindfulness', cardCount: 1 }),
        brandContext: null,
      });
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      const title = textLayers.find((l) => l.role === 'title')!;
      expect(title.content).toContain('mindfulness');
      expect(title.content).not.toContain('Mock:');
    });

    it('plan.body appears in body layer when no plan.cards provided', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({ body: 'Real body content from the plan.' }),
        brandContext: null,
      });
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      const body = textLayers.find((l) => l.role === 'body')!;
      expect(body.content).toBe('Real body content from the plan.');
    });

    it('plan.cards[0].headline appears in card 0 title layer', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({
          cardCount: 1,
          cards: [{ headline: 'Per-card Headline', body: 'Per-card body.' }],
        }),
        brandContext: null,
      });
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      const title = textLayers.find((l) => l.role === 'title')!;
      expect(title.content).toBe('Per-card Headline');
    });

    it('plan.cards[0].body appears in card 0 body layer', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({
          cardCount: 1,
          cards: [{ headline: 'Headline', body: 'Specific card body.' }],
        }),
        brandContext: null,
      });
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      const body = textLayers.find((l) => l.role === 'body')!;
      expect(body.content).toBe('Specific card body.');
    });

    it('plan.cards[1].headline appears in card 1 title layer for carousel', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('carousel'),
        plan: makePlan({
          cardCount: 2,
          cards: [
            { headline: 'Card One', body: 'Body one.' },
            { headline: 'Card Two', body: 'Body two.' },
          ],
        }),
        brandContext: null,
      });
      const textLayers1 = doc.cards[1].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      const title1 = textLayers1.find((l) => l.role === 'title')!;
      expect(title1.content).toBe('Card Two');
    });

    it('plan.cards[1].body appears in card 1 body layer for carousel', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('carousel'),
        plan: makePlan({
          cardCount: 2,
          cards: [
            { headline: 'Card One', body: 'Body one.' },
            { headline: 'Card Two', body: 'Specific body two.' },
          ],
        }),
        brandContext: null,
      });
      const textLayers1 = doc.cards[1].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      const body1 = textLayers1.find((l) => l.role === 'body')!;
      expect(body1.content).toBe('Specific body two.');
    });

    it('CTA text layer added when plan.cards[i].cta is present', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({
          cardCount: 1,
          cards: [{ headline: 'H', body: 'B', cta: 'Get started' }],
        }),
        brandContext: null,
      });
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      const cta = textLayers.find((l) => l.role === 'accent')!;
      expect(cta).toBeDefined();
      expect(cta.content).toBe('Get started');
    });

    it('CTA layer has role accent', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({
          cardCount: 1,
          cards: [{ headline: 'H', body: 'B', cta: 'Learn more' }],
        }),
        brandContext: null,
      });
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      const cta = textLayers.find((l) => l.role === 'accent')!;
      expect(cta.role).toBe('accent');
    });

    it('no CTA layer when plan.cards[i].cta is absent', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({
          cardCount: 1,
          cards: [{ headline: 'H', body: 'B' }],
        }),
        brandContext: null,
      });
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      expect(textLayers.find((l) => l.role === 'accent')).toBeUndefined();
    });

    it('no CTA layer when plan.cards is absent entirely', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({ cardCount: 1 }),
        brandContext: null,
      });
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      expect(textLayers.find((l) => l.role === 'accent')).toBeUndefined();
    });

    it('post with CTA has 5 layers (overlay, shape, title, body, cta)', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({
          cardCount: 1,
          cards: [{ headline: 'H', body: 'B', cta: 'Act now' }],
        }),
        brandContext: null,
      });
      expect(doc.cards[0].layers).toHaveLength(5);
    });

    it('post without CTA still has 4 layers', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({ cardCount: 1 }),
        brandContext: null,
      });
      expect(doc.cards[0].layers).toHaveLength(4);
    });

    it('carousel card with CTA has 6 layers (overlay, shape, title, body, cta, index)', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('carousel'),
        plan: makePlan({
          cardCount: 3,
          cards: [
            { headline: 'H1', body: 'B1', cta: 'Act' },
            { headline: 'H2', body: 'B2' },
            { headline: 'H3', body: 'B3' },
          ],
        }),
        brandContext: null,
      });
      // Card 0 has CTA → 6 layers
      expect(doc.cards[0].layers).toHaveLength(6);
      // Card 1 has no CTA → 5 layers
      expect(doc.cards[1].layers).toHaveLength(5);
    });

    it('plan.cardCount used when plan.cards present (no carousel minimum override)', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('carousel'),
        plan: makePlan({
          cardCount: 2,
          cards: [
            { headline: 'H1', body: 'B1' },
            { headline: 'H2', body: 'B2' },
          ],
        }),
        brandContext: null,
      });
      expect(doc.cards).toHaveLength(2);
    });

    it('carousel minimum-3 still applies when plan.cards absent and cardCount < 3', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('carousel'),
        plan: makePlan({ cardCount: 1 }),
        brandContext: null,
      });
      expect(doc.cards).toHaveLength(3);
    });

    it('brand colors/fonts still applied when plan.cards present', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({
          cardCount: 1,
          cards: [{ headline: 'H', body: 'B' }],
        }),
        brandContext: {
          brandSystemId: 'brand-1',
          name: 'Test Brand',
          colors: { background: '#aabbcc' },
          typography: { headingFont: 'Newsreader' },
        },
      });
      expect(doc.cards[0].baseColor).toBe('#aabbcc');
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      const title = textLayers.find((l) => l.role === 'title')!;
      expect(title.fontFamily).toBe('Newsreader');
    });

    it('no-brand fallback works when plan.cards present', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({
          cardCount: 1,
          cards: [{ headline: 'H', body: 'B' }],
        }),
        brandContext: null,
      });
      expect(doc.cards[0].baseColor).toBe('#1d2a30');
      const textLayers = doc.cards[0].layers.filter((l) => l.type === 'text') as Array<
        import('@orra/shared').TextLayer
      >;
      expect(textLayers.find((l) => l.role === 'title')!.fontFamily).toBe('Newsreader');
    });

    it('falls back to plan.title when plan.cards has fewer entries than cardCount', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('carousel'),
        plan: makePlan({
          title: 'Global Title',
          cardCount: 3,
          cards: [{ headline: 'Explicit Card 0', body: 'Body 0.' }],
        }),
        brandContext: null,
      });
      // Card 0 uses per-card headline
      const t0 = (doc.cards[0].layers.filter((l) => l.type === 'text') as Array<import('@orra/shared').TextLayer>)
        .find((l) => l.role === 'title')!;
      expect(t0.content).toBe('Explicit Card 0');
      // Card 1 falls back to plan.title
      const t1 = (doc.cards[1].layers.filter((l) => l.type === 'text') as Array<import('@orra/shared').TextLayer>)
        .find((l) => l.role === 'title')!;
      expect(t1.content).toBe('Global Title');
    });

    it('document is schema-valid when plan has cards with CTAs', () => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('carousel'),
        plan: makePlan({
          cardCount: 3,
          cards: [
            { headline: 'H1', body: 'B1', cta: 'CTA 1' },
            { headline: 'H2', body: 'B2', cta: 'CTA 2' },
            { headline: 'H3', body: 'B3', cta: 'CTA 3' },
          ],
        }),
        brandContext: null,
      });
      const parsed = ArtifactDocumentSchema.safeParse(doc);
      expect(parsed.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 14B: layout and visual direction
// ---------------------------------------------------------------------------

const CARD_W = 1080;
const CARD_H = 1350;

function getOverlayLayer(doc: ArtifactDocument, cardIdx = 0) {
  return doc.cards[cardIdx].layers.find((l) => l.type === 'overlay')!;
}
function getShapeLayers(doc: ArtifactDocument, cardIdx = 0) {
  return doc.cards[cardIdx].layers.filter((l) => l.type === 'shape');
}
function getTextLayerByRole(doc: ArtifactDocument, role: string, cardIdx = 0) {
  return doc.cards[cardIdx].layers.find(
    (l) => l.type === 'text' && (l as import('@orra/shared').TextLayer).role === role,
  ) as import('@orra/shared').TextLayer | undefined;
}

describe('Phase 14B: layout and visual direction', () => {
  it('layoutDirection "centered" — title layer align = center', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'centered' }),
      brandContext: null,
    });
    const title = getTextLayerByRole(doc, 'title');
    expect(title!.align).toBe('center');
  });

  it('layoutDirection "centered" — body layer align = center', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'centered' }),
      brandContext: null,
    });
    const body = getTextLayerByRole(doc, 'body');
    expect(body!.align).toBe('center');
  });

  it('layoutDirection "bold" — title layer fontSize = 96', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'bold' }),
      brandContext: null,
    });
    const title = getTextLayerByRole(doc, 'title');
    expect(title!.fontSize).toBe(96);
  });

  it('layoutDirection "bold" — title layer fontWeight = 700', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'bold' }),
      brandContext: null,
    });
    const title = getTextLayerByRole(doc, 'title');
    expect(title!.fontWeight).toBe(700);
  });

  it('layoutDirection "minimal" — title layer fontSize = 60', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'minimal' }),
      brandContext: null,
    });
    const title = getTextLayerByRole(doc, 'title');
    expect(title!.fontSize).toBe(60);
  });

  it('layoutDirection "quote" — title layer fontSize = 88, align = center', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'quote' }),
      brandContext: null,
    });
    const title = getTextLayerByRole(doc, 'title');
    expect(title!.fontSize).toBe(88);
    expect(title!.align).toBe('center');
  });

  it('layoutDirection "centered" — no accent shape layer (3 layers for post without CTA)', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'centered' }),
      brandContext: null,
    });
    expect(getShapeLayers(doc)).toHaveLength(0);
    expect(doc.cards[0].layers).toHaveLength(3); // overlay + title + body
  });

  it('layoutDirection "minimal" — no accent shape layer', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'minimal' }),
      brandContext: null,
    });
    expect(getShapeLayers(doc)).toHaveLength(0);
  });

  it('visualDirection "minimal" — overlay opacity <= 0.20', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ visualDirection: 'minimal' }),
      brandContext: null,
    });
    const overlay = getOverlayLayer(doc);
    expect(overlay.opacity).toBeLessThanOrEqual(0.20);
  });

  it('visualDirection "dark" — overlay opacity >= 0.50', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ visualDirection: 'dark' }),
      brandContext: null,
    });
    const overlay = getOverlayLayer(doc);
    expect(overlay.opacity).toBeGreaterThanOrEqual(0.50);
  });

  it('layoutDirection "bold", visualDirection "dark" — overlay opacity >= 0.50', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'bold', visualDirection: 'dark' }),
      brandContext: null,
    });
    const overlay = getOverlayLayer(doc);
    expect(overlay.opacity).toBeGreaterThanOrEqual(0.50);
    expect(getShapeLayers(doc)).toHaveLength(1); // bold layout keeps shape
  });

  it('layoutDirection "editorial" — accent shape present, title y = 140', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'editorial' }),
      brandContext: null,
    });
    expect(getShapeLayers(doc)).toHaveLength(1);
    const title = getTextLayerByRole(doc, 'title');
    expect(title!.y).toBe(140);
  });

  it('brand colors still respected when layoutDirection "bold" present', () => {
    const brandCtx = {
      brandSystemId: 'b1',
      name: 'Brand',
      colors: { background: '#ff0000', primary: '#00ff00', text: '#0000ff', accent: '#ffffff' },
      typography: { headingFont: 'Newsreader', bodyFont: 'Inter' },
    };
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'bold' }),
      brandContext: brandCtx,
    });
    expect(doc.cards[0].baseColor).toBe('#ff0000');
    const title = getTextLayerByRole(doc, 'title');
    expect(title!.color).toBe('#0000ff');
    expect(title!.fontSize).toBe(96); // bold layout still applied
  });

  it('no-brand defaults produce valid document with layoutDirection "centered"', () => {
    const doc = generateMockArtifactDocument({
      currentDocument: makeEmptyDocument('post'),
      plan: makePlan({ layoutDirection: 'centered' }),
      brandContext: null,
    });
    const parsed = ArtifactDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    expect(doc.cards[0].baseColor).toBe('#1d2a30');
  });

  it.each(['editorial', 'centered', 'bold', 'minimal', 'quote', 'split'] as const)(
    'layoutDirection "%s" produces valid ArtifactDocument',
    (layout) => {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({ layoutDirection: layout }),
        brandContext: null,
      });
      const parsed = ArtifactDocumentSchema.safeParse(doc);
      expect(parsed.success).toBe(true);
    },
  );

  it('all layout families: title.x + title.w <= cardW', () => {
    const layouts = ['editorial', 'centered', 'bold', 'minimal', 'quote', 'split'] as const;
    for (const layout of layouts) {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({ layoutDirection: layout }),
        brandContext: null,
      });
      const title = getTextLayerByRole(doc, 'title')!;
      expect(title.x + title.w).toBeLessThanOrEqual(CARD_W);
    }
  });

  it('centered and quote layouts: title.y + title.h <= cardH', () => {
    for (const layout of ['centered', 'quote'] as const) {
      const doc = generateMockArtifactDocument({
        currentDocument: makeEmptyDocument('post'),
        plan: makePlan({ layoutDirection: layout }),
        brandContext: null,
      });
      const title = getTextLayerByRole(doc, 'title')!;
      expect(title.y + title.h).toBeLessThanOrEqual(CARD_H);
    }
  });
});

// ---------------------------------------------------------------------------
// W5: generateMockSingleCard
// ---------------------------------------------------------------------------

describe('generateMockSingleCard', () => {
  it('returns a single card with non-empty layers', () => {
    const doc = makeEmptyDocument('carousel');
    const plan = makePlan({ cardCount: 3, title: 'Card Test', body: 'Card body.' });
    const card = generateMockSingleCard({
      cardIndex: 0,
      total: 3,
      plan,
      brandContext: null,
      currentDocument: doc,
    });
    expect(card).toBeDefined();
    expect(card.layers.length).toBeGreaterThan(0);
  });

  it('returned card index label matches cardIndex + 1 for carousel (total > 1)', () => {
    const doc = makeEmptyDocument('carousel');
    const plan = makePlan({ cardCount: 3, title: 'Test', body: 'Body.' });
    const card = generateMockSingleCard({
      cardIndex: 1,
      total: 3,
      plan,
      brandContext: null,
      currentDocument: doc,
    });
    const indexLayer = card.layers.find(
      (l) => l.type === 'text' && (l as import('@orra/shared').TextLayer).role === 'caption'
    ) as import('@orra/shared').TextLayer | undefined;
    expect(indexLayer).toBeDefined();
    expect(indexLayer!.content).toBe('2 / 3');
  });

  it('uses ratio dimensions from currentDocument', () => {
    const doc = makeEmptyDocument('carousel');
    const plan = makePlan({ cardCount: 3, title: 'Test', body: 'Body.' });
    const card = generateMockSingleCard({
      cardIndex: 0,
      total: 3,
      plan,
      brandContext: null,
      currentDocument: doc,
    });
    // All layers should fit within the card dimensions
    for (const layer of card.layers) {
      expect(layer.x).toBeGreaterThanOrEqual(0);
      expect(layer.y).toBeGreaterThanOrEqual(0);
    }
  });
});
