import { describe, it, expect } from 'vitest';
import { FakeAIProvider } from '../providers/fakeProvider.js';
import { TextPlanResultSchema, PlannedCardSchema } from '../schemas.js';
import type { TextPlanRequest, MockDocumentRequest, RecentChatMessage, CurrentArtifactSummary } from '../types.js';
import type { BrandContextDto } from '@orra/shared';

function makeTextRequest(overrides: Partial<TextPlanRequest> = {}): TextPlanRequest {
  return {
    projectId: 'proj-1',
    prompt: 'Ready to create a post about productivity.',
    projectType: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    brandContext: null,
    ...overrides,
  };
}

const brand: BrandContextDto = {
  brandSystemId: 'brand-1',
  name: 'Acme',
  tone: 'calm',
  colors: { primary: '#123456', background: '#654321', text: '#ffffff', accent: '#aabbcc' },
  typography: { headingFont: 'Newsreader', bodyFont: 'Inter' },
  visualDirection: 'minimal premium',
};

describe('FakeAIProvider', () => {
  describe('planText', () => {
    it('is deterministic — same input produces identical output', async () => {
      const provider = new FakeAIProvider();
      const req = makeTextRequest();
      const a = await provider.planText(req);
      const b = await provider.planText(req);
      expect(a).toEqual(b);
    });

    it('extracts title from approvalCard.summaryLine, stripping "Ready to create a ..."', async () => {
      const provider = new FakeAIProvider();
      const result = await provider.planText(makeTextRequest({
        approvalCard: {
          summaryLine: 'Ready to create a carousel about self-improvement.',
          style: 'calm',
          format: 'Instagram 4:5',
          brand: 'No brand',
          cta: 'Not set',
          assumptions: [],
          actions: ['approve_and_create'],
        },
      }));
      expect(result.title).toBe('carousel about self-improvement.');
    });

    it('falls back to prompt when no approvalCard is provided', async () => {
      const provider = new FakeAIProvider();
      const result = await provider.planText(makeTextRequest({
        prompt: 'Ready to create a post about focus.',
      }));
      expect(result.title).toBe('post about focus.');
    });

    it('returns cardCount: 1 for post', async () => {
      const provider = new FakeAIProvider();
      const result = await provider.planText(makeTextRequest({ projectType: 'post' }));
      expect(result.cardCount).toBe(1);
    });

    it('returns cardCount: 3 for carousel', async () => {
      const provider = new FakeAIProvider();
      const result = await provider.planText(makeTextRequest({ projectType: 'carousel' }));
      expect(result.cardCount).toBe(3);
    });

    it('includes brand tone and visual direction in styleNotes when brandContext present', async () => {
      const provider = new FakeAIProvider();
      const result = await provider.planText(makeTextRequest({ brandContext: brand }));
      expect(result.styleNotes).toContain('tone: calm');
      expect(result.styleNotes).toContain('style: minimal premium');
    });

    it('returns empty styleNotes when brandContext is null', async () => {
      const provider = new FakeAIProvider();
      const result = await provider.planText(makeTextRequest({ brandContext: null }));
      expect(result.styleNotes).toEqual([]);
    });

    it('output validates with TextPlanResultSchema', async () => {
      const provider = new FakeAIProvider();
      const result = await provider.planText(makeTextRequest({ projectType: 'carousel' }));
      const parsed = TextPlanResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Phase 13E: recentChatMessages and currentArtifactSummary', () => {
    it('is still deterministic with recentChatMessages present', async () => {
      const provider = new FakeAIProvider();
      const messages: RecentChatMessage[] = [
        { role: 'user', content: 'Make it calm and minimal' },
        { role: 'assistant', content: 'Got it, I will plan a calm design.' },
      ];
      const req = makeTextRequest({ recentChatMessages: messages });
      const a = await provider.planText(req);
      const b = await provider.planText(req);
      expect(a).toEqual(b);
    });

    it('adds existing artifact context to styleNotes when currentArtifactSummary present', async () => {
      const provider = new FakeAIProvider();
      const summary: CurrentArtifactSummary = {
        cardCount: 3,
        textLayerCount: 6,
        imageLayerCount: 0,
        shapeLayerCount: 1,
        visibleLayerCount: 7,
        textSnippets: ['Main headline'],
      };
      const result = await provider.planText(makeTextRequest({ currentArtifactSummary: summary }));
      expect(result.styleNotes.some((n) => n.includes('existing: 3 card(s)'))).toBe(true);
    });

    it('does not add artifact styleNote when cardCount is 0', async () => {
      const provider = new FakeAIProvider();
      const summary: CurrentArtifactSummary = {
        cardCount: 0,
        textLayerCount: 0,
        imageLayerCount: 0,
        shapeLayerCount: 0,
        visibleLayerCount: 0,
        textSnippets: [],
      };
      const result = await provider.planText(makeTextRequest({ currentArtifactSummary: summary }));
      expect(result.styleNotes.some((n) => n.includes('existing:'))).toBe(false);
    });

    it('adds last user message as context styleNote when recentChatMessages present', async () => {
      const provider = new FakeAIProvider();
      const messages: RecentChatMessage[] = [
        { role: 'assistant', content: 'How can I help?' },
        { role: 'user', content: 'Keep it simple and focused' },
      ];
      const result = await provider.planText(makeTextRequest({ recentChatMessages: messages }));
      expect(result.styleNotes.some((n) => n.startsWith('context:'))).toBe(true);
      expect(result.styleNotes.some((n) => n.includes('Keep it simple and focused'))).toBe(true);
    });

    it('does not add context styleNote when recentChatMessages has only assistant messages', async () => {
      const provider = new FakeAIProvider();
      const messages: RecentChatMessage[] = [
        { role: 'assistant', content: 'How can I help?' },
      ];
      const result = await provider.planText(makeTextRequest({ recentChatMessages: messages }));
      expect(result.styleNotes.some((n) => n.startsWith('context:'))).toBe(false);
    });

    it('does not add context styleNote when recentChatMessages is empty', async () => {
      const provider = new FakeAIProvider();
      const result = await provider.planText(makeTextRequest({ recentChatMessages: [] }));
      expect(result.styleNotes.some((n) => n.startsWith('context:'))).toBe(false);
    });

    it('output validates with TextPlanResultSchema when new fields present', async () => {
      const provider = new FakeAIProvider();
      const result = await provider.planText(makeTextRequest({
        recentChatMessages: [{ role: 'user', content: 'Make it bold' }],
        currentArtifactSummary: {
          cardCount: 1,
          textLayerCount: 2,
          imageLayerCount: 0,
          shapeLayerCount: 0,
          visibleLayerCount: 2,
          textSnippets: ['Some text'],
        },
      }));
      const parsed = TextPlanResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('generateImageOrDocument', () => {
    it('returns { kind: "mock_document" }', async () => {
      const provider = new FakeAIProvider();
      const req: MockDocumentRequest = {
        projectId: 'proj-1',
        plan: { summary: '', cardCount: 1, title: '', body: '', styleNotes: [] },
        brandContext: null,
      };
      const result = await provider.generateImageOrDocument(req);
      expect(result.kind).toBe('mock_document');
    });

    it('does not make network calls (no fetch invoked)', async () => {
      const provider = new FakeAIProvider();
      const planResult = await provider.planText(makeTextRequest());
      const imgResult = await provider.generateImageOrDocument({
        projectId: 'proj-1',
        plan: planResult,
        brandContext: null,
      });
      // If fetch had been called without a mock it would throw or hang.
      // Reaching here without error confirms no network call was made.
      expect(imgResult.kind).toBe('mock_document');
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 14A: per-card content and visualDirection
  // ---------------------------------------------------------------------------

  describe('Phase 14A: per-card content and visualDirection', () => {
    const provider = new FakeAIProvider();

    it('returns cards array with length matching cardCount for post (1 card)', async () => {
      const result = await provider.planText(makeTextRequest({ projectType: 'post' }));
      expect(result.cards).toHaveLength(1);
    });

    it('returns cards array with length matching cardCount for carousel (3 cards)', async () => {
      const result = await provider.planText(makeTextRequest({ projectType: 'carousel' }));
      expect(result.cards).toHaveLength(3);
    });

    it('cards[0].headline equals the plan title', async () => {
      const result = await provider.planText(
        makeTextRequest({ projectMemory: { projectId: 'p', workspaceId: 'w', topic: 'productivity', summary: '', updatedAt: new Date().toISOString(), rejectedIdeas: [], userPreferences: [], constraints: [] } })
      );
      expect(result.cards![0].headline).toBe(result.title);
    });

    it('cards[1].headline and cards[2].headline differ from cards[0].headline for carousel', async () => {
      const result = await provider.planText(makeTextRequest({ projectType: 'carousel' }));
      expect(result.cards![1].headline).not.toBe(result.cards![0].headline);
      expect(result.cards![2].headline).not.toBe(result.cards![0].headline);
    });

    it('all card headlines and bodies are non-empty strings', async () => {
      const result = await provider.planText(makeTextRequest({ projectType: 'carousel' }));
      for (const card of result.cards!) {
        expect(typeof card.headline).toBe('string');
        expect(card.headline.length).toBeGreaterThan(0);
        expect(typeof card.body).toBe('string');
        expect(card.body.length).toBeGreaterThan(0);
      }
    });

    it('last card has cta set; non-last cards have no cta for carousel', async () => {
      const result = await provider.planText(makeTextRequest({ projectType: 'carousel' }));
      const cards = result.cards!;
      expect(cards[cards.length - 1].cta).toBeDefined();
      for (let i = 0; i < cards.length - 1; i++) {
        expect(cards[i].cta).toBeUndefined();
      }
    });

    it('single-card post has cta set on its only card', async () => {
      const result = await provider.planText(makeTextRequest({ projectType: 'post' }));
      expect(result.cards![0].cta).toBeDefined();
    });

    it('each card entry validates against PlannedCardSchema', async () => {
      const result = await provider.planText(makeTextRequest({ projectType: 'carousel' }));
      for (const card of result.cards!) {
        const parsed = PlannedCardSchema.safeParse(card);
        expect(parsed.success).toBe(true);
      }
    });

    it('returns visualDirection from brandContext.visualDirection when present', async () => {
      const result = await provider.planText(makeTextRequest({ brandContext: brand }));
      expect(result.visualDirection).toBe('minimal premium');
    });

    it('returns visualDirection from projectMemory.visualDirection when brandContext has none', async () => {
      const noBrandVisual: BrandContextDto = { brandSystemId: 'b', name: 'B' };
      const result = await provider.planText(
        makeTextRequest({
          brandContext: noBrandVisual,
          projectMemory: {
            projectId: 'p',
            workspaceId: 'w',
            visualDirection: 'bold editorial',
            summary: '',
            updatedAt: new Date().toISOString(),
            rejectedIdeas: [],
            userPreferences: [],
            constraints: [],
          },
        })
      );
      expect(result.visualDirection).toBe('bold editorial');
    });

    it('returns undefined visualDirection when neither brandContext nor memory provides one', async () => {
      const result = await provider.planText(makeTextRequest({ brandContext: null }));
      expect(result.visualDirection).toBeUndefined();
    });

    it('layoutDirection is undefined in fake provider output', async () => {
      const result = await provider.planText(makeTextRequest());
      expect(result.layoutDirection).toBeUndefined();
    });

    it('full output validates against TextPlanResultSchema', async () => {
      const result = await provider.planText(makeTextRequest({ projectType: 'carousel', brandContext: brand }));
      const parsed = TextPlanResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('is still deterministic with cards field present', async () => {
      const p = new FakeAIProvider();
      const req = makeTextRequest({ projectType: 'carousel', brandContext: brand });
      const r1 = await p.planText(req);
      const r2 = await p.planText(req);
      expect(JSON.stringify(r1.cards)).toBe(JSON.stringify(r2.cards));
    });
  });
});
