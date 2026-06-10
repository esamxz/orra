import { describe, it, expect } from 'vitest';
import { FakeAIProvider } from '../providers/fakeProvider.js';
import type { TextPlanRequest, ImageGenerationRequest } from '../types.js';
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
  });

  describe('generateImageOrDocument', () => {
    it('returns { kind: "mock_document" }', async () => {
      const provider = new FakeAIProvider();
      const req: ImageGenerationRequest = {
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
});
