import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiTextProvider } from '../providers/geminiTextProvider.js';
import { AIProviderError } from '../errors.js';
import type { TextPlanRequest } from '../types.js';

function makeConfig() {
  return { apiKey: 'test-key', model: 'gemini-2.0-flash-lite' };
}

function makeRequest(overrides: Partial<TextPlanRequest> = {}): TextPlanRequest {
  return {
    projectId: 'proj-1',
    prompt: 'Ready to create a post about productivity.',
    projectType: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    brandContext: null,
    ...overrides,
  };
}

function makeValidPlan() {
  return {
    title: 'productivity post',
    summary: 'A focused post about productivity tips.',
    cardCount: 1,
    body: 'Start with a clear mind and a plan.',
    styleNotes: ['clean layout', 'minimal palette'],
  };
}

function makeGeminiEnvelope(plan: unknown) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }],
  };
}

function mockFetchOk(body: unknown) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

function mockFetchError(status: number) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({}),
  } as Response);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeminiTextProvider', () => {
  describe('planText', () => {
    it('sends correct HTTP request shape', async () => {
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest());

      expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];

      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).toContain('gemini-2.0-flash-lite:generateContent');
      expect(url).toContain('?key=test-key');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty('contents');
      expect(body).toHaveProperty('generationConfig');
      expect((body.generationConfig as Record<string, string>).responseMimeType).toBe(
        'application/json',
      );
    });

    it('returns parsed TextPlanResult on valid response', async () => {
      const plan = makeValidPlan();
      mockFetchOk(makeGeminiEnvelope(plan));
      const provider = new GeminiTextProvider(makeConfig());
      const result = await provider.planText(makeRequest());

      expect(result.title).toBe('productivity post');
      expect(result.cardCount).toBe(1);
      expect(result.summary).toBe('A focused post about productivity tips.');
    });

    it('parses all TextPlanResult fields including styleNotes', async () => {
      const plan = makeValidPlan();
      mockFetchOk(makeGeminiEnvelope(plan));
      const provider = new GeminiTextProvider(makeConfig());
      const result = await provider.planText(makeRequest());

      expect(result.body).toBeTruthy();
      expect(Array.isArray(result.styleNotes)).toBe(true);
      expect(result.styleNotes).toHaveLength(2);
    });

    it('throws PROVIDER_INVALID_RESPONSE when text part is not valid JSON', async () => {
      const envelope = {
        candidates: [{ content: { parts: [{ text: 'not json {' }] } }],
      };
      mockFetchOk(envelope);
      const provider = new GeminiTextProvider(makeConfig());

      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE',
      );
    });

    it('planText succeeds when Gemini returns fenced ```json block', async () => {
      const plan = makeValidPlan();
      const fencedText = `\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``;
      mockFetchOk({ candidates: [{ content: { parts: [{ text: fencedText }] } }] });
      const provider = new GeminiTextProvider(makeConfig());
      const result = await provider.planText(makeRequest());

      expect(result.title).toBe(plan.title);
      expect(result.cardCount).toBe(plan.cardCount);
    });

    it('planText succeeds when Gemini returns generic ``` fenced block', async () => {
      const plan = makeValidPlan();
      const fencedText = `\`\`\`\n${JSON.stringify(plan)}\n\`\`\``;
      mockFetchOk({ candidates: [{ content: { parts: [{ text: fencedText }] } }] });
      const provider = new GeminiTextProvider(makeConfig());
      const result = await provider.planText(makeRequest());

      expect(result.title).toBe(plan.title);
      expect(result.cardCount).toBe(plan.cardCount);
    });

    it('throws PROVIDER_INVALID_RESPONSE when Gemini returns prose response', async () => {
      const plan = makeValidPlan();
      const proseText = `Here is your plan: ${JSON.stringify(plan)}`;
      mockFetchOk({ candidates: [{ content: { parts: [{ text: proseText }] } }] });
      const provider = new GeminiTextProvider(makeConfig());

      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE',
      );
    });

    it('throws PROVIDER_INVALID_RESPONSE when schema validation fails', async () => {
      const badPlan = { title: '', cardCount: 'not-a-number' };
      mockFetchOk(makeGeminiEnvelope(badPlan));
      const provider = new GeminiTextProvider(makeConfig());

      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE',
      );
    });

    it('throws PROVIDER_HTTP_ERROR on non-2xx response', async () => {
      mockFetchError(429);
      const provider = new GeminiTextProvider(makeConfig());

      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError && err.code === 'PROVIDER_HTTP_ERROR',
      );
    });

    it('sets retryable=false for 4xx and retryable=true for 5xx', async () => {
      mockFetchError(429);
      const provider = new GeminiTextProvider(makeConfig());
      let caught: AIProviderError | undefined;
      try {
        await provider.planText(makeRequest());
      } catch (err) {
        caught = err as AIProviderError;
      }
      expect(caught?.retryable).toBe(false);

      mockFetchError(503);
      try {
        await provider.planText(makeRequest());
      } catch (err) {
        caught = err as AIProviderError;
      }
      expect(caught?.retryable).toBe(true);
    });

    it('throws PROVIDER_TIMEOUT when fetch throws AbortError', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      vi.mocked(fetch).mockRejectedValueOnce(abortErr);
      const provider = new GeminiTextProvider(makeConfig());

      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) => err instanceof AIProviderError && err.code === 'PROVIDER_TIMEOUT',
      );
    });

    it('throws PROVIDER_INVALID_RESPONSE when Gemini envelope is malformed', async () => {
      mockFetchOk({ notCandidates: [] });
      const provider = new GeminiTextProvider(makeConfig());

      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE',
      );
    });

    it('never includes the API key in any thrown error message', async () => {
      const provider = new GeminiTextProvider({ apiKey: 'secret-api-key', model: 'gemini-2.0-flash-lite' });
      const scenarios: Array<() => void> = [
        () => mockFetchError(400),
        () => mockFetchError(500),
        () => {
          vi.mocked(fetch).mockRejectedValueOnce(
            Object.assign(new Error('aborted'), { name: 'AbortError' }),
          );
        },
        () => mockFetchOk({ notCandidates: [] }),
        () =>
          mockFetchOk({
            candidates: [{ content: { parts: [{ text: 'not json' }] } }],
          }),
      ];

      for (const setup of scenarios) {
        setup();
        let caughtMessage = '';
        try {
          await provider.planText(makeRequest());
        } catch (err) {
          caughtMessage = err instanceof Error ? err.message : '';
        }
        expect(caughtMessage).not.toContain('secret-api-key');
      }
    });
  });

  describe('generateImageOrDocument', () => {
    it('throws PROVIDER_UNAVAILABLE', async () => {
      const provider = new GeminiTextProvider(makeConfig());

      await expect(
        provider.generateImageOrDocument({
          projectId: 'p1',
          plan: makeValidPlan(),
          brandContext: null,
        }),
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError &&
          err.code === 'PROVIDER_UNAVAILABLE' &&
          err.retryable === false,
      );
    });
  });
});
