import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiTextProvider } from '../providers/geminiTextProvider.js';
import { AIProviderError } from '../errors.js';
import type { TextPlanRequest, RecentChatMessage, CurrentArtifactSummary } from '../types.js';
import type { ProjectContextMemory } from '@orra/shared';

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

    it('maps HTTP 429 to PROVIDER_RATE_LIMITED with retryable=true', async () => {
      mockFetchError(429);
      const provider = new GeminiTextProvider(makeConfig());
      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError &&
          err.code === 'PROVIDER_RATE_LIMITED' &&
          err.retryable === true,
      );
    });

    it('maps HTTP 401 to PROVIDER_AUTH_FAILED with retryable=false', async () => {
      mockFetchError(401);
      const provider = new GeminiTextProvider(makeConfig());
      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError &&
          err.code === 'PROVIDER_AUTH_FAILED' &&
          err.retryable === false,
      );
    });

    it('maps HTTP 403 to PROVIDER_AUTH_FAILED with retryable=false', async () => {
      mockFetchError(403);
      const provider = new GeminiTextProvider(makeConfig());
      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError &&
          err.code === 'PROVIDER_AUTH_FAILED' &&
          err.retryable === false,
      );
    });

    it('maps HTTP 404 to PROVIDER_NOT_FOUND with retryable=false', async () => {
      mockFetchError(404);
      const provider = new GeminiTextProvider(makeConfig());
      await expect(provider.planText(makeRequest())).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AIProviderError &&
          err.code === 'PROVIDER_NOT_FOUND' &&
          err.retryable === false,
      );
    });

    it('sets retryable=false for 400 and retryable=true for 5xx', async () => {
      mockFetchError(400);
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

  describe('Phase 13E: prompt context sections', () => {
    function extractPrompt(): string {
      const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const contents = body.contents as Array<{ parts: Array<{ text: string }> }>;
      return contents[0].parts[0].text;
    }

    it('prompt includes memory section when projectMemory provided', async () => {
      const memory: ProjectContextMemory = {
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        topic: 'fitness',
        platform: 'Instagram',
        tone: 'energetic',
        audience: 'gym goers',
        updatedAt: '2026-06-01T00:00:00Z',
        summary: 'fitness content',
        rejectedIdeas: [],
        userPreferences: [],
        constraints: [],
      };
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest({ projectMemory: memory }));

      const prompt = extractPrompt();
      expect(prompt).toContain('Project context');
      expect(prompt).toContain('fitness');
      expect(prompt).toContain('Instagram');
    });

    it('prompt includes recent messages section when recentChatMessages provided', async () => {
      const messages: RecentChatMessage[] = [
        { role: 'user', content: 'Keep the tone calm and focused' },
        { role: 'assistant', content: 'I will keep it calm.' },
      ];
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest({ recentChatMessages: messages }));

      const prompt = extractPrompt();
      expect(prompt).toContain('Recent conversation');
      expect(prompt).toContain('Keep the tone calm and focused');
    });

    it('prompt includes artifact summary section when currentArtifactSummary provided', async () => {
      const summary: CurrentArtifactSummary = {
        cardCount: 3,
        ratioName: '4:5',
        textLayerCount: 6,
        imageLayerCount: 1,
        shapeLayerCount: 0,
        visibleLayerCount: 7,
        textSnippets: ['Main headline'],
      };
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest({ currentArtifactSummary: summary }));

      const prompt = extractPrompt();
      expect(prompt).toContain('Current artifact');
      expect(prompt).toContain('3 card(s)');
      expect(prompt).toContain('Main headline');
    });

    it('prompt includes precedence instruction', async () => {
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest());

      const prompt = extractPrompt();
      expect(prompt).toContain('Current user request takes precedence');
    });

    it('truncates long message content to 500 chars in prompt', async () => {
      const longContent = 'B'.repeat(600);
      const messages: RecentChatMessage[] = [{ role: 'user', content: longContent }];
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest({ recentChatMessages: messages }));

      const prompt = extractPrompt();
      expect(prompt).toContain('B'.repeat(500));
      expect(prompt).not.toContain('B'.repeat(501));
    });

    it('truncates long text snippet in artifact summary to 100 chars', async () => {
      const summary: CurrentArtifactSummary = {
        cardCount: 1,
        textLayerCount: 1,
        imageLayerCount: 0,
        shapeLayerCount: 0,
        visibleLayerCount: 1,
        textSnippets: ['C'.repeat(120)],
      };
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest({ currentArtifactSummary: summary }));

      const prompt = extractPrompt();
      expect(prompt).toContain('C'.repeat(100));
      expect(prompt).not.toContain('C'.repeat(101));
    });

    it('does not include raw artifact JSON in prompt', async () => {
      const summary: CurrentArtifactSummary = {
        cardCount: 1,
        textLayerCount: 1,
        imageLayerCount: 0,
        shapeLayerCount: 0,
        visibleLayerCount: 1,
        textSnippets: ['Headline'],
      };
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest({ currentArtifactSummary: summary }));

      const prompt = extractPrompt();
      // Raw JSON would include "artifactId" or "schemaVersion"
      expect(prompt).not.toContain('"artifactId"');
      expect(prompt).not.toContain('"schemaVersion"');
    });

    it('does not include assetId strings when summary present', async () => {
      const summary: CurrentArtifactSummary = {
        cardCount: 1,
        textLayerCount: 0,
        imageLayerCount: 1,
        shapeLayerCount: 0,
        visibleLayerCount: 1,
        textSnippets: [],
      };
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest({ currentArtifactSummary: summary }));

      const prompt = extractPrompt();
      // Summary never exposes assetId — make sure no UUID patterns sneak in from summary
      expect(prompt).not.toContain('assetId');
    });

    it('omits recent messages section when recentChatMessages is empty', async () => {
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest({ recentChatMessages: [] }));

      const prompt = extractPrompt();
      expect(prompt).not.toContain('Recent conversation');
    });

    it('omits artifact summary section when currentArtifactSummary is null', async () => {
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest({ currentArtifactSummary: null }));

      const prompt = extractPrompt();
      expect(prompt).not.toContain('Current artifact');
    });

    it('prompt includes supported layout direction vocabulary', async () => {
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest());

      const prompt = extractPrompt();
      expect(prompt).toContain('editorial, centered, bold, minimal, quote, split');
    });

    it('prompt includes supported visual direction vocabulary', async () => {
      mockFetchOk(makeGeminiEnvelope(makeValidPlan()));
      const provider = new GeminiTextProvider(makeConfig());
      await provider.planText(makeRequest());

      const prompt = extractPrompt();
      expect(prompt).toContain('calm, dark, bold, minimal, elegant, playful, professional');
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

// ---------------------------------------------------------------------------
// chat() tests
// ---------------------------------------------------------------------------

function makeGeminiChatEnvelope(text: string) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
  };
}

describe('GeminiTextProvider — chat()', () => {
  it('returns reply text from the provider on success', async () => {
    const chatReply = 'Sure! Tell me more about your content goals.';
    mockFetchOk(makeGeminiChatEnvelope(chatReply));
    const provider = new GeminiTextProvider(makeConfig());

    const result = await provider.chat({ userMessage: 'hi' });
    expect(result.reply).toBe(chatReply);
  });

  it('sends system_instruction in the request body', async () => {
    mockFetchOk(makeGeminiChatEnvelope('ok'));
    const provider = new GeminiTextProvider(makeConfig());
    await provider.chat({ userMessage: 'hello' });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty('system_instruction');
    expect(body).toHaveProperty('contents');
  });

  it('does NOT send generationConfig.responseMimeType (plain text, not JSON)', async () => {
    mockFetchOk(makeGeminiChatEnvelope('ok'));
    const provider = new GeminiTextProvider(makeConfig());
    await provider.chat({ userMessage: 'hello' });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.generationConfig).toBeUndefined();
  });

  it('maps HTTP 429 to PROVIDER_RATE_LIMITED with retryable=true', async () => {
    mockFetchError(429);
    const provider = new GeminiTextProvider(makeConfig());
    await expect(provider.chat({ userMessage: 'hi' })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_RATE_LIMITED' &&
        err.retryable === true,
    );
  });

  it('maps HTTP 401 to PROVIDER_AUTH_FAILED with retryable=false', async () => {
    mockFetchError(401);
    const provider = new GeminiTextProvider(makeConfig());
    await expect(provider.chat({ userMessage: 'hi' })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_AUTH_FAILED' &&
        err.retryable === false,
    );
  });

  it('maps HTTP 404 to PROVIDER_NOT_FOUND with retryable=false', async () => {
    mockFetchError(404);
    const provider = new GeminiTextProvider(makeConfig());
    await expect(provider.chat({ userMessage: 'hi' })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_NOT_FOUND' &&
        err.retryable === false,
    );
  });

  it('throws AIProviderError when response envelope is invalid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: 'shape' }),
    } as Response);
    const provider = new GeminiTextProvider(makeConfig());
    await expect(provider.chat({ userMessage: 'hi' })).rejects.toBeInstanceOf(AIProviderError);
  });
});

// ---------------------------------------------------------------------------
// enhancePrompt() tests
// ---------------------------------------------------------------------------

function makeEnhancementEnvelope(result: unknown) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
  };
}

describe('GeminiTextProvider — enhancePrompt()', () => {
  it('returns enhanced prompt and inferredType on success', async () => {
    mockFetchOk(makeEnhancementEnvelope({
      enhancedPrompt: 'A powerful post about morning routines for high performers',
      inferredType: 'single_post',
    }));
    const provider = new GeminiTextProvider(makeConfig());
    const result = await provider.enhancePrompt({ prompt: 'morning routine post' });
    expect(result.enhancedPrompt).toContain('morning routines');
    expect(result.inferredType).toBe('single_post');
  });

  it('maps HTTP 429 to PROVIDER_RATE_LIMITED with retryable=true', async () => {
    mockFetchError(429);
    const provider = new GeminiTextProvider(makeConfig());
    await expect(provider.enhancePrompt({ prompt: 'test' })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_RATE_LIMITED' &&
        err.retryable === true,
    );
  });

  it('maps HTTP 401 to PROVIDER_AUTH_FAILED with retryable=false', async () => {
    mockFetchError(401);
    const provider = new GeminiTextProvider(makeConfig());
    await expect(provider.enhancePrompt({ prompt: 'test' })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_AUTH_FAILED' &&
        err.retryable === false,
    );
  });

  it('maps HTTP 404 to PROVIDER_NOT_FOUND — model misconfiguration', async () => {
    mockFetchError(404);
    const provider = new GeminiTextProvider(makeConfig());
    await expect(provider.enhancePrompt({ prompt: 'test' })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_NOT_FOUND' &&
        err.retryable === false,
    );
  });

  it('throws PROVIDER_INVALID_RESPONSE when schema validation fails', async () => {
    mockFetchOk(makeEnhancementEnvelope({ enhancedPrompt: 42 }));
    const provider = new GeminiTextProvider(makeConfig());
    await expect(provider.enhancePrompt({ prompt: 'test' })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE',
    );
  });

  it('never includes the API key in thrown error messages', async () => {
    const provider = new GeminiTextProvider({ apiKey: 'secret-api-key', model: 'gemini-2.0-flash-lite' });
    mockFetchError(401);
    let caughtMessage = '';
    try {
      await provider.enhancePrompt({ prompt: 'test' });
    } catch (err) {
      caughtMessage = err instanceof Error ? err.message : '';
    }
    expect(caughtMessage).not.toContain('secret-api-key');
  });
});

// ---------------------------------------------------------------------------
// globalThis.fetch wrapper regression (Cloudflare Workers binding)
// ---------------------------------------------------------------------------

describe('GeminiTextProvider — globalThis.fetch wrapper', () => {
  it('resolves globalThis.fetch at call time, not construction time', async () => {
    // Provider created with NO injected fetch — exercises the wrapper path.
    // The wrapper is: (input, init) => globalThis.fetch(input, init)
    // If the constructor captured the reference directly (old pattern), spy installed
    // after construction would never fire. The wrapper re-reads globalThis.fetch each call.
    const provider = new GeminiTextProvider(makeConfig());

    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeGeminiEnvelope(makeValidPlan()),
    } as Response);

    try {
      await provider.planText(makeRequest());
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
});
