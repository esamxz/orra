import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NoopAIProviderObserver } from '../observability.js';
import type { AIProviderObservation, AIProviderObserver } from '../observability.js';
import { GeminiTextProvider } from '../providers/geminiTextProvider.js';
import { AIProviderError } from '../errors.js';
import type { TextPlanRequest } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<TextPlanRequest> = {}): TextPlanRequest {
  return {
    projectId: 'smoke-obs',
    prompt: 'Ready to create a post about sleep.',
    projectType: 'post',
    ratio: { name: '1:1', w: 1080, h: 1080 },
    brandContext: null,
    ...overrides,
  };
}

function makeValidPlan(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Sleep habits',
    summary: 'A post about better sleep.',
    cardCount: 1,
    body: 'Sleep is important for health.',
    styleNotes: ['calm', 'minimal'],
    ...overrides,
  };
}

function makeEnvelope(plan: unknown) {
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

function capturingObserver(): { observer: AIProviderObserver; events: AIProviderObservation[] } {
  const events: AIProviderObservation[] = [];
  return {
    observer: { observe: (e: AIProviderObservation) => events.push(e) },
    events,
  };
}

const TEST_API_KEY = 'test-secret-api-key-obs-12345';

function makeProvider(observer?: AIProviderObserver) {
  return new GeminiTextProvider({
    apiKey: TEST_API_KEY,
    model: 'gemini-2.0-flash-lite',
    observer,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// NoopAIProviderObserver
// ---------------------------------------------------------------------------

describe('NoopAIProviderObserver', () => {
  it('does not throw when observe is called with any event', () => {
    const noop = new NoopAIProviderObserver();
    expect(() =>
      noop.observe({ provider: 'gemini', operation: 'planText', status: 'started' }),
    ).not.toThrow();
    expect(() =>
      noop.observe({ provider: 'gemini', operation: 'planText', status: 'succeeded', durationMs: 100 }),
    ).not.toThrow();
    expect(() =>
      noop.observe({ provider: 'gemini', operation: 'planText', status: 'failed', errorCode: 'PROVIDER_TIMEOUT' }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GeminiTextProvider observability wiring
// ---------------------------------------------------------------------------

describe('GeminiTextProvider: observer events on success', () => {
  it('emits exactly started then succeeded events', async () => {
    mockFetchOk(makeEnvelope(makeValidPlan()));
    const { observer, events } = capturingObserver();
    await makeProvider(observer).planText(makeRequest());

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('started');
    expect(events[1].status).toBe('succeeded');
  });

  it('started event carries model and promptChars', async () => {
    mockFetchOk(makeEnvelope(makeValidPlan()));
    const { observer, events } = capturingObserver();
    await makeProvider(observer).planText(makeRequest());

    const started = events[0];
    expect(started.model).toBe('gemini-2.0-flash-lite');
    expect(typeof started.promptChars).toBe('number');
    expect(started.promptChars).toBeGreaterThan(0);
  });

  it('succeeded event carries durationMs, model, promptChars, responseChars', async () => {
    mockFetchOk(makeEnvelope(makeValidPlan()));
    const { observer, events } = capturingObserver();
    await makeProvider(observer).planText(makeRequest());

    const succeeded = events[1];
    expect(succeeded.model).toBe('gemini-2.0-flash-lite');
    expect(typeof succeeded.durationMs).toBe('number');
    expect(succeeded.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof succeeded.promptChars).toBe('number');
    expect(succeeded.promptChars).toBeGreaterThan(0);
    expect(typeof succeeded.responseChars).toBe('number');
    expect(succeeded.responseChars).toBeGreaterThan(0);
  });

  it('succeeded event carries normalizedCardCount, layoutDirection, visualDirection', async () => {
    mockFetchOk(makeEnvelope(makeValidPlan({ layoutDirection: 'editorial', visualDirection: 'calm' })));
    const { observer, events } = capturingObserver();
    await makeProvider(observer).planText(makeRequest());

    const succeeded = events[1];
    expect(succeeded.normalizedCardCount).toBe(1);
    expect(succeeded.layoutDirection).toBe('editorial');
    expect(succeeded.visualDirection).toBe('calm');
  });

  it('responseChars is a number — never the raw response string', async () => {
    mockFetchOk(makeEnvelope(makeValidPlan()));
    const { observer, events } = capturingObserver();
    await makeProvider(observer).planText(makeRequest());

    const succeeded = events[1];
    expect(typeof succeeded.responseChars).toBe('number');
    expect(succeeded).not.toHaveProperty('response');
    expect(succeeded).not.toHaveProperty('rawText');
  });
});

describe('GeminiTextProvider: observer events on failure', () => {
  it('emits started then failed on invalid JSON response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json {' }] } }] }),
    } as Response);
    const { observer, events } = capturingObserver();

    await expect(makeProvider(observer).planText(makeRequest())).rejects.toBeInstanceOf(AIProviderError);

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('started');
    expect(events[1].status).toBe('failed');
    expect(events[1].errorCode).toBe('PROVIDER_INVALID_RESPONSE');
  });

  it('emits failed with PROVIDER_TIMEOUT and retryable: true on AbortError', async () => {
    const abortErr = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    vi.mocked(fetch).mockRejectedValueOnce(abortErr);
    const { observer, events } = capturingObserver();

    await expect(makeProvider(observer).planText(makeRequest())).rejects.toBeInstanceOf(AIProviderError);

    const failed = events.find((e) => e.status === 'failed')!;
    expect(failed).toBeDefined();
    expect(failed.errorCode).toBe('PROVIDER_TIMEOUT');
    expect(failed.retryable).toBe(true);
  });

  it('emits failed with PROVIDER_HTTP_ERROR on HTTP 4xx', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as Response);
    const { observer, events } = capturingObserver();

    await expect(makeProvider(observer).planText(makeRequest())).rejects.toBeInstanceOf(AIProviderError);

    const failed = events.find((e) => e.status === 'failed')!;
    expect(failed.errorCode).toBe('PROVIDER_HTTP_ERROR');
  });

  it('failed event carries durationMs as a non-negative number', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(Object.assign(new Error('abort'), { name: 'AbortError' }));
    const { observer, events } = capturingObserver();

    await expect(makeProvider(observer).planText(makeRequest())).rejects.toBeInstanceOf(AIProviderError);

    const failed = events.find((e) => e.status === 'failed')!;
    expect(typeof failed.durationMs).toBe('number');
    expect(failed.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('GeminiTextProvider: privacy invariants', () => {
  it('events never contain the API key string', async () => {
    mockFetchOk(makeEnvelope(makeValidPlan()));
    const { observer, events } = capturingObserver();
    await makeProvider(observer).planText(makeRequest());

    for (const evt of events) {
      expect(JSON.stringify(evt)).not.toContain(TEST_API_KEY);
    }
  });

  it('events never have a prompt field — only promptChars as a number', async () => {
    mockFetchOk(makeEnvelope(makeValidPlan()));
    const { observer, events } = capturingObserver();
    await makeProvider(observer).planText(makeRequest());

    for (const evt of events) {
      expect(evt).not.toHaveProperty('prompt');
      if ('promptChars' in evt) {
        expect(typeof evt.promptChars).toBe('number');
      }
    }
  });

  it('events never have a response or rawText field', async () => {
    mockFetchOk(makeEnvelope(makeValidPlan()));
    const { observer, events } = capturingObserver();
    await makeProvider(observer).planText(makeRequest());

    for (const evt of events) {
      expect(evt).not.toHaveProperty('response');
      expect(evt).not.toHaveProperty('rawText');
    }
  });
});

describe('GeminiTextProvider: no-observer default', () => {
  it('works without observer config — uses NoopAIProviderObserver', async () => {
    mockFetchOk(makeEnvelope(makeValidPlan()));
    const provider = new GeminiTextProvider({ apiKey: TEST_API_KEY, model: 'gemini-2.0-flash-lite' });
    await expect(provider.planText(makeRequest())).resolves.toBeDefined();
  });
});
