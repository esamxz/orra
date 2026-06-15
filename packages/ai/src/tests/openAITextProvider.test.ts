import { describe, it, expect, vi } from 'vitest';
import { OpenAITextProvider } from '../providers/openAITextProvider.js';
import { AIProviderError } from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_KEY = 'sk-test-openai-key-never-logged';
const FAKE_MODEL = 'gpt-4o-mini';

function makeProvider(overrides?: Partial<ConstructorParameters<typeof OpenAITextProvider>[0]>) {
  return new OpenAITextProvider({
    apiKey: FAKE_KEY,
    model: FAKE_MODEL,
    fetch: vi.fn(),
    ...overrides,
  });
}

function makeTextRequest() {
  return {
    projectId: 'proj-1',
    prompt: 'Post about discipline',
    projectType: 'post' as const,
    ratio: { name: '1:1', w: 1080, h: 1080 },
    brandContext: null,
  };
}

function makeEnhanceRequest() {
  return { prompt: 'Post about discipline', selectedType: 'single_post' as const };
}

function makeValidPlan() {
  return {
    title: 'Discipline',
    summary: 'A post about discipline.',
    cardCount: 1,
    body: 'Discipline is the key.',
    styleNotes: ['calm', 'minimal'],
    cards: [{ headline: 'Stay Disciplined', body: 'Every day counts.', cta: null }],
    layoutDirection: 'centered',
    visualDirection: null,
  };
}

function makeValidEnhancement() {
  return {
    enhancedPrompt: 'A motivational post about discipline and daily habits.',
    inferredType: 'single_post',
    cardCount: null,
  };
}

function makeEnvelope(textContent: string) {
  return { output: [{ content: [{ text: textContent }] }] };
}

function mockFetch(fetchFn: ReturnType<typeof vi.fn>, body: unknown, status = 200) {
  fetchFn.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function mockFetchError(fetchFn: ReturnType<typeof vi.fn>, name: string, message: string) {
  const err = new Error(message);
  err.name = name;
  fetchFn.mockRejectedValueOnce(err);
}

// ---------------------------------------------------------------------------
// planText tests
// ---------------------------------------------------------------------------

describe('OpenAITextProvider — planText', () => {
  it('returns a normalized TextPlanResult on success', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope(JSON.stringify(makeValidPlan())));

    const result = await provider.planText(makeTextRequest());
    expect(result.title).toBe('Discipline');
    expect(result.cardCount).toBe(1);
    expect(result.styleNotes).toContain('calm');
  });

  it('sends Authorization: Bearer header (key not in URL or body)', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope(JSON.stringify(makeValidPlan())));

    await provider.planText(makeTextRequest());

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${FAKE_KEY}`);
    expect(url).not.toContain(FAKE_KEY);
    const body = JSON.parse(init.body as string);
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it('uses Responses API endpoint /responses', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope(JSON.stringify(makeValidPlan())));

    await provider.planText(makeTextRequest());

    const [url] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/responses');
  });

  it('requests json_schema strict format', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope(JSON.stringify(makeValidPlan())));

    await provider.planText(makeTextRequest());

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text?.format?.type).toBe('json_schema');
    expect(body.text?.format?.strict).toBe(true);
  });

  it('maps HTTP 429 to PROVIDER_HTTP_ERROR with retryable: true', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'rate limited' }, 429);

    await expect(provider.planText(makeTextRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_HTTP_ERROR' &&
        err.retryable === true &&
        err.message.includes('429')
      );
    });
  });

  it('maps HTTP 401 to PROVIDER_HTTP_ERROR with retryable: false', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'unauthorized' }, 401);

    await expect(provider.planText(makeTextRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_HTTP_ERROR' &&
        err.retryable === false
      );
    });
  });

  it('maps HTTP 403 to PROVIDER_HTTP_ERROR with retryable: false', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'forbidden' }, 403);

    await expect(provider.planText(makeTextRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_HTTP_ERROR' &&
        err.retryable === false
      );
    });
  });

  it('maps HTTP 503 to PROVIDER_HTTP_ERROR with retryable: true', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'unavailable' }, 503);

    await expect(provider.planText(makeTextRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_HTTP_ERROR' &&
        err.retryable === true
      );
    });
  });

  it('maps AbortError to PROVIDER_TIMEOUT with retryable: true', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn, timeoutMs: 1 });
    mockFetchError(fetchFn, 'AbortError', 'The operation was aborted');

    await expect(provider.planText(makeTextRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_TIMEOUT' &&
        err.retryable === true
      );
    });
  });

  it('maps non-JSON response body to PROVIDER_INVALID_RESPONSE', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad json'); },
    } as unknown as Response);

    await expect(provider.planText(makeTextRequest())).rejects.toSatisfy((err: unknown) => {
      return err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE';
    });
  });

  it('maps missing output envelope to PROVIDER_INVALID_RESPONSE', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { choices: [{ text: 'wrong shape' }] });

    await expect(provider.planText(makeTextRequest())).rejects.toSatisfy((err: unknown) => {
      return err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE';
    });
  });

  it('API key never appears in thrown error messages', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'unauthorized' }, 401);

    let caughtMessage = '';
    try {
      await provider.planText(makeTextRequest());
    } catch (err) {
      caughtMessage = err instanceof Error ? err.message : String(err);
    }
    expect(caughtMessage).not.toContain(FAKE_KEY);
  });
});

// ---------------------------------------------------------------------------
// generateImageOrDocument tests
// ---------------------------------------------------------------------------

describe('OpenAITextProvider — generateImageOrDocument', () => {
  it('throws PROVIDER_UNAVAILABLE', async () => {
    const provider = makeProvider();
    await expect(
      provider.generateImageOrDocument({ projectId: 'p1', plan: {} as never, brandContext: null }),
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof AIProviderError && err.code === 'PROVIDER_UNAVAILABLE';
    });
  });
});

// ---------------------------------------------------------------------------
// enhancePrompt tests
// ---------------------------------------------------------------------------

describe('OpenAITextProvider — enhancePrompt', () => {
  it('returns enhancement output on success', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope(JSON.stringify(makeValidEnhancement())));

    const result = await provider.enhancePrompt(makeEnhanceRequest());
    expect(result.enhancedPrompt).toContain('motivational');
    expect(result.inferredType).toBe('single_post');
    expect(result.cardCount).toBeUndefined();
  });

  it('strips null cardCount before returning', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope(JSON.stringify({ ...makeValidEnhancement(), cardCount: null })));

    const result = await provider.enhancePrompt(makeEnhanceRequest());
    expect(result.cardCount).toBeUndefined();
  });

  it('maps HTTP 429 to PROVIDER_HTTP_ERROR with retryable: true', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'rate limited' }, 429);

    await expect(provider.enhancePrompt(makeEnhanceRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_HTTP_ERROR' &&
        err.retryable === true
      );
    });
  });

  it('API key never appears in error messages', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'forbidden' }, 403);

    let caughtMessage = '';
    try {
      await provider.enhancePrompt(makeEnhanceRequest());
    } catch (err) {
      caughtMessage = err instanceof Error ? err.message : String(err);
    }
    expect(caughtMessage).not.toContain(FAKE_KEY);
  });
});

// ---------------------------------------------------------------------------
// provider identity
// ---------------------------------------------------------------------------

describe('OpenAITextProvider — identity', () => {
  it('name is "openai"', () => {
    const provider = makeProvider();
    expect(provider.name).toBe('openai');
  });
});

// ---------------------------------------------------------------------------
// default fetch safe wrapper (Cloudflare Workers binding regression)
// ---------------------------------------------------------------------------

describe('OpenAITextProvider — default fetch safe wrapper', () => {
  it('resolves globalThis.fetch at call time, not construction time', async () => {
    // Create provider with NO injected fetch — exercises the wrapper path.
    const provider = new OpenAITextProvider({ apiKey: FAKE_KEY, model: FAKE_MODEL });

    // Spy installed AFTER construction. With the old detached-reference pattern
    // (this.fetchFn = globalThis.fetch), this spy would never be called because
    // the constructor already captured the original reference. The wrapper
    // ((input, init) => globalThis.fetch(input, init)) re-reads globalThis.fetch
    // on every call, so the spy IS called.
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeEnvelope(JSON.stringify(makeValidPlan())),
    } as Response);

    try {
      await provider.planText(makeTextRequest());
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// chat() tests
// ---------------------------------------------------------------------------

describe('OpenAITextProvider — chat()', () => {
  it('returns reply text from the provider on success', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    const chatReply = 'Happy to help! What kind of content are you thinking about?';
    mockFetch(fetchFn, makeEnvelope(chatReply));

    const result = await provider.chat({ userMessage: 'hi' });
    expect(result.reply).toBe(chatReply);
  });

  it('sends Authorization: Bearer header (key not in URL or body)', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope('hello'));

    await provider.chat({ userMessage: 'hi' });

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${FAKE_KEY}`);
    expect(url).not.toContain(FAKE_KEY);
  });

  it('does NOT use json_schema format (plain text response)', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope('hello'));

    await provider.chat({ userMessage: 'hi' });

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toBeUndefined();
    expect(body.format).toBeUndefined();
  });

  it('throws AIProviderError with retryable=true on HTTP 429', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'rate limited' }, 429);

    try {
      await provider.chat({ userMessage: 'hi' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).retryable).toBe(true);
    }
  });

  it('throws AIProviderError on network failure', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetchError(fetchFn, 'TypeError', 'fetch failed');

    await expect(provider.chat({ userMessage: 'hi' })).rejects.toBeInstanceOf(AIProviderError);
  });

  it('throws AIProviderError when response envelope is invalid', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { unexpected: 'shape' });

    await expect(provider.chat({ userMessage: 'hi' })).rejects.toBeInstanceOf(AIProviderError);
  });
});
