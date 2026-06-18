import { describe, it, expect, vi } from 'vitest';
import { FluxImageProvider } from '../providers/fluxImageProvider.js';
import { createImageProviderRouter } from '../imageRouter.js';
import { FakeImageProvider } from '../providers/fakeImageProvider.js';
import { AIProviderError } from '../errors.js';
import type { AIProviderObserver, AIProviderObservation } from '../observability.js';
import type { ImageGenerationRequest } from '../imageTypes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<ImageGenerationRequest> = {}): ImageGenerationRequest {
  return {
    prompt: 'a calm gradient background for a social post',
    width: 1080,
    height: 1350,
    ...overrides,
  };
}

function makeObserver(): { observer: AIProviderObserver; events: AIProviderObservation[] } {
  const events: AIProviderObservation[] = [];
  const observer: AIProviderObserver = { observe: (e) => events.push(e) };
  return { observer, events };
}

/** Await a promise and return the caught error (or undefined if it resolved). */
async function catchErr(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return err;
  }
}

const FAKE_IMAGE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]);
const MOCK_JOB_ID = 'bfl-test-job-id-001';
const MOCK_SAMPLE_URL = 'https://cdn.bfl.ai/mock/image.png';

/**
 * Build a mocked fetch vi.fn() that handles the 3-step BFL flow in sequence.
 * Only adds mock responses for steps that would actually be reached.
 */
function makeFluxFetch(opts: {
  submitStatus?: number;
  submitBody?: unknown;
  pollStatus?: number;
  pollBody?: unknown;
  imageStatus?: number;
  imageBytes?: Uint8Array;
} = {}): ReturnType<typeof vi.fn> {
  const {
    submitStatus = 200,
    submitBody = { id: MOCK_JOB_ID },
    pollStatus = 200,
    pollBody = { status: 'Ready', result: { sample: MOCK_SAMPLE_URL } },
    imageStatus = 200,
    imageBytes = FAKE_IMAGE_BYTES,
  } = opts;

  const mockFetch = vi.fn();
  const submitOk = submitStatus >= 200 && submitStatus < 300;
  const pollOk = pollStatus >= 200 && pollStatus < 300;

  // Call 1: submit job
  mockFetch.mockResolvedValueOnce({
    ok: submitOk,
    status: submitStatus,
    json: async () => submitBody,
  } as Response);

  if (submitOk) {
    // Call 2: poll result
    mockFetch.mockResolvedValueOnce({
      ok: pollOk,
      status: pollStatus,
      json: async () => pollBody,
    } as Response);

    if (pollOk) {
      // Call 3: fetch image bytes
      mockFetch.mockResolvedValueOnce({
        ok: imageStatus >= 200 && imageStatus < 300,
        status: imageStatus,
        arrayBuffer: async () => imageBytes.buffer as ArrayBuffer,
      } as unknown as Response);
    }
  }

  return mockFetch;
}

/** Create a FluxImageProvider wired to a mocked fetch and instant sleep. */
function makeFluxProvider(opts: {
  apiKey?: string;
  fetch?: ReturnType<typeof vi.fn>;
  observer?: AIProviderObserver;
  baseUrl?: string;
  model?: string;
} = {}): FluxImageProvider {
  return new FluxImageProvider({
    apiKey: opts.apiKey ?? 'test-api-key',
    fetch: opts.fetch ?? makeFluxFetch(),
    sleep: async () => {},
    maxPollAttempts: 3,
    pollIntervalMs: 0,
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.observer ? { observer: opts.observer } : {}),
  });
}

// ---------------------------------------------------------------------------
// Test cases 1–5: router selection (image router — flux branch)
// ---------------------------------------------------------------------------

describe('image router — flux deprecated (D5.2)', () => {
  // Case 1: fake remains default when IMAGE_PROVIDER is unset
  it('createImageProviderRouter() with no config returns FakeImageProvider', () => {
    const router = createImageProviderRouter();
    expect(router.getProvider()).toBeInstanceOf(FakeImageProvider);
  });

  // Case 2: fake remains default when IMAGE_PROVIDER=fake
  it('createImageProviderRouter({ provider: "fake" }) returns FakeImageProvider', () => {
    const router = createImageProviderRouter({ provider: 'fake' });
    expect(router.getProvider()).toBeInstanceOf(FakeImageProvider);
  });

  // Case 3: flux is deprecated — always throws regardless of other config
  it('throws PROVIDER_CONFIG_MISSING with deprecation message for provider=flux', () => {
    expect(() => createImageProviderRouter({ provider: 'flux' })).toThrow(AIProviderError);
    let caught: unknown;
    try { createImageProviderRouter({ provider: 'flux' }); } catch (e) { caught = e; }
    expect((caught as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
    expect((caught as AIProviderError).provider).toBe('flux');
    expect((caught as AIProviderError).message).toContain('deprecated');
    expect((caught as AIProviderError).message).toContain('gemini');
  });

  // Case 4: unknown IMAGE_PROVIDER fails safely
  it('throws PROVIDER_CONFIG_MISSING for an unknown provider string', () => {
    let caught: unknown;
    try { createImageProviderRouter({ provider: 'dalle' }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(AIProviderError);
    expect((caught as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
  });

  it('does not require any key when provider is fake', () => {
    expect(() => createImageProviderRouter({ provider: 'fake' })).not.toThrow();
  });

  it('does not require any key when no provider is specified', () => {
    expect(() => createImageProviderRouter()).not.toThrow();
    expect(() => createImageProviderRouter({})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test cases 6–20: FluxImageProvider adapter
// ---------------------------------------------------------------------------

describe('FluxImageProvider', () => {
  // Case 6: sends a normalized request using mocked fetch
  it('sends a POST to the correct BFL endpoint with normalized fields', async () => {
    const mockFetch = makeFluxFetch();
    const provider = makeFluxProvider({ fetch: mockFetch });

    await provider.generateFromText(makeRequest({ format: 'jpeg', seed: 42 }));

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api.bfl.ml/v1/flux-schnell');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.prompt).toBe('a calm gradient background for a social post');
    expect(body.width).toBe(1080);
    expect(body.height).toBe(1350);
    expect(body.output_format).toBe('jpeg');
    expect(body.seed).toBe(42);
  });

  it('sends a GET poll request to the get_result endpoint with the job id', async () => {
    const mockFetch = makeFluxFetch();
    const provider = makeFluxProvider({ fetch: mockFetch });
    await provider.generateFromText(makeRequest());

    const [pollUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(pollUrl).toContain('get_result?id=');
    expect(pollUrl).toContain(MOCK_JOB_ID);
  });

  it('fetches image bytes from the sample URL returned by the poll', async () => {
    const mockFetch = makeFluxFetch();
    const provider = makeFluxProvider({ fetch: mockFetch });
    await provider.generateFromText(makeRequest());

    const [imageUrl] = mockFetch.mock.calls[2] as [string, RequestInit];
    expect(imageUrl).toBe(MOCK_SAMPLE_URL);
  });

  // Case 7: authorization is sent safely — API key in request header, never in errors or events
  it('sends x-key authorization header on submit and poll requests', async () => {
    const mockFetch = makeFluxFetch();
    const provider = makeFluxProvider({ apiKey: 'secret-flux-key', fetch: mockFetch });
    await provider.generateFromText(makeRequest());

    const [, submitInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const [, pollInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect((submitInit.headers as Record<string, string>)['x-key']).toBe('secret-flux-key');
    expect((pollInit.headers as Record<string, string>)['x-key']).toBe('secret-flux-key');
  });

  it('never exposes API key in AIProviderError messages', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 401, json: async () => ({}),
    } as Response);
    const err = await catchErr(
      makeFluxProvider({ apiKey: 'my-secret-key', fetch: mockFetch }).generateFromText(makeRequest()),
    );
    expect((err as Error).message).not.toContain('my-secret-key');
  });

  // Case 8: normalizes a successful mocked response into ImageGenerationResult
  it('returns a valid ImageGenerationResult on success', async () => {
    const result = await makeFluxProvider().generateFromText(makeRequest());
    expect(result.provider).toBe('flux');
    expect(result.model).toBe('flux-schnell');
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.mimeType).toBe('image/png');
  });

  // Case 9: preserves width and height in result
  it('preserves requested width and height in the result', async () => {
    const result = await makeFluxProvider({ fetch: makeFluxFetch() }).generateFromText(
      makeRequest({ width: 1024, height: 768 }),
    );
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
  });

  // Case 10: preserves seed when supported
  it('preserves seed in result when provided', async () => {
    const result = await makeFluxProvider({ fetch: makeFluxFetch() }).generateFromText(
      makeRequest({ seed: 777 }),
    );
    expect(result.seed).toBe(777);
  });

  it('omits seed from result when not provided in request', async () => {
    const result = await makeFluxProvider({ fetch: makeFluxFetch() }).generateFromText(makeRequest());
    expect(result.seed).toBeUndefined();
  });

  // Case 11: transparentBackground handled safely with a warning
  it('adds a warning when transparentBackground is requested (unsupported by flux-schnell)', async () => {
    const result = await makeFluxProvider({ fetch: makeFluxFetch() }).generateFromText(
      makeRequest({ transparentBackground: true }),
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toContain('transparentBackground is not supported by flux-schnell');
    expect(result.warnings![0]).toContain('ignoring');
  });

  it('has no warnings when transparentBackground is false or omitted', async () => {
    const r1 = await makeFluxProvider({ fetch: makeFluxFetch() }).generateFromText(
      makeRequest({ transparentBackground: false }),
    );
    expect(r1.warnings).toHaveLength(0);

    const r2 = await makeFluxProvider({ fetch: makeFluxFetch() }).generateFromText(makeRequest());
    expect(r2.warnings).toHaveLength(0);
  });

  // Case 12: validation — empty prompt and invalid dimensions
  it('rejects an empty prompt with PROVIDER_INVALID_REQUEST', async () => {
    // Validation is synchronous (before fetch) — mock not consumed, single call is fine
    const err = await catchErr(
      makeFluxProvider({ fetch: vi.fn() }).generateFromText(makeRequest({ prompt: '' })),
    );
    expect(err).toBeInstanceOf(AIProviderError);
    expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
    expect((err as AIProviderError).provider).toBe('flux');
  });

  it('rejects a whitespace-only prompt with PROVIDER_INVALID_REQUEST', async () => {
    const err = await catchErr(
      makeFluxProvider({ fetch: vi.fn() }).generateFromText(makeRequest({ prompt: '   ' })),
    );
    expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
  });

  it('rejects width of 0 with PROVIDER_INVALID_REQUEST', async () => {
    const err = await catchErr(
      makeFluxProvider({ fetch: vi.fn() }).generateFromText(makeRequest({ width: 0 })),
    );
    expect(err).toBeInstanceOf(AIProviderError);
    expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
  });

  it('rejects negative height with PROVIDER_INVALID_REQUEST', async () => {
    const err = await catchErr(
      makeFluxProvider({ fetch: vi.fn() }).generateFromText(makeRequest({ height: -100 })),
    );
    expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
  });

  it('rejects NaN width with PROVIDER_INVALID_REQUEST', async () => {
    const err = await catchErr(
      makeFluxProvider({ fetch: vi.fn() }).generateFromText(makeRequest({ width: NaN })),
    );
    expect(err).toBeInstanceOf(AIProviderError);
    expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
  });

  // Case 13: handles provider 4xx safely
  it('throws PROVIDER_HTTP_ERROR with retryable=false for submit 4xx', async () => {
    const err = await catchErr(
      makeFluxProvider({ fetch: makeFluxFetch({ submitStatus: 400 }) }).generateFromText(makeRequest()),
    );
    expect(err).toBeInstanceOf(AIProviderError);
    expect((err as AIProviderError).code).toBe('PROVIDER_HTTP_ERROR');
    expect((err as AIProviderError).retryable).toBe(false);
    expect((err as AIProviderError).message).toContain('400');
    expect((err as AIProviderError).message).not.toContain('test-api-key');
  });

  it('throws PROVIDER_HTTP_ERROR with retryable=false for poll 4xx', async () => {
    const err = await catchErr(
      makeFluxProvider({ fetch: makeFluxFetch({ pollStatus: 404 }) }).generateFromText(makeRequest()),
    );
    expect((err as AIProviderError).code).toBe('PROVIDER_HTTP_ERROR');
    expect((err as AIProviderError).retryable).toBe(false);
  });

  // Case 14: handles provider 5xx safely
  it('throws PROVIDER_HTTP_ERROR with retryable=true for submit 5xx', async () => {
    const err = await catchErr(
      makeFluxProvider({ fetch: makeFluxFetch({ submitStatus: 503 }) }).generateFromText(makeRequest()),
    );
    expect((err as AIProviderError).code).toBe('PROVIDER_HTTP_ERROR');
    expect((err as AIProviderError).retryable).toBe(true);
  });

  it('throws PROVIDER_HTTP_ERROR with retryable=true for poll 5xx', async () => {
    const err = await catchErr(
      makeFluxProvider({ fetch: makeFluxFetch({ pollStatus: 500 }) }).generateFromText(makeRequest()),
    );
    expect((err as AIProviderError).code).toBe('PROVIDER_HTTP_ERROR');
    expect((err as AIProviderError).retryable).toBe(true);
  });

  // Case 15: handles malformed response safely
  it('throws PROVIDER_INVALID_RESPONSE when submit returns non-JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    } as unknown as Response);
    const err = await catchErr(makeFluxProvider({ fetch: mockFetch }).generateFromText(makeRequest()));
    expect(err).toBeInstanceOf(AIProviderError);
    expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_RESPONSE');
    expect((err as AIProviderError).provider).toBe('flux');
  });

  it('throws PROVIDER_INVALID_RESPONSE when submit returns JSON without id field', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }), // missing 'id'
    } as Response);
    const err = await catchErr(makeFluxProvider({ fetch: mockFetch }).generateFromText(makeRequest()));
    expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_RESPONSE');
  });

  it('throws PROVIDER_INVALID_RESPONSE when poll returns malformed JSON', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, json: async () => ({ id: MOCK_JOB_ID }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('bad json'); },
      } as unknown as Response);
    const err = await catchErr(makeFluxProvider({ fetch: mockFetch }).generateFromText(makeRequest()));
    expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_RESPONSE');
  });

  it('throws PROVIDER_TIMEOUT when all poll attempts return non-Ready status', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, json: async () => ({ id: MOCK_JOB_ID }),
      } as Response)
      .mockResolvedValue({
        ok: true, status: 200, json: async () => ({ status: 'Pending', result: null }),
      } as Response);
    const err = await catchErr(makeFluxProvider({ fetch: mockFetch }).generateFromText(makeRequest()));
    expect(err).toBeInstanceOf(AIProviderError);
    expect((err as AIProviderError).code).toBe('PROVIDER_TIMEOUT');
    expect((err as AIProviderError).retryable).toBe(true);
  });

  // Case 16: handles network failure safely
  it('throws PROVIDER_UNAVAILABLE on network failure during submit', async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed'));
    const err = await catchErr(makeFluxProvider({ fetch: mockFetch }).generateFromText(makeRequest()));
    expect(err).toBeInstanceOf(AIProviderError);
    expect((err as AIProviderError).code).toBe('PROVIDER_UNAVAILABLE');
    expect((err as AIProviderError).retryable).toBe(true);
  });

  it('throws PROVIDER_TIMEOUT on AbortError during submit', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const mockFetch = vi.fn().mockRejectedValueOnce(abortErr);
    const err = await catchErr(makeFluxProvider({ fetch: mockFetch }).generateFromText(makeRequest()));
    expect(err).toBeInstanceOf(AIProviderError);
    expect((err as AIProviderError).code).toBe('PROVIDER_TIMEOUT');
    expect((err as AIProviderError).retryable).toBe(true);
  });

  it('throws PROVIDER_UNAVAILABLE on network failure during poll', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, json: async () => ({ id: MOCK_JOB_ID }),
      } as Response)
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const err = await catchErr(makeFluxProvider({ fetch: mockFetch }).generateFromText(makeRequest()));
    expect((err as AIProviderError).code).toBe('PROVIDER_UNAVAILABLE');
  });

  // Case 17: no live network calls — enforced by injectable fetch (all tests above use vi.fn())
  // Case 18: no real API key required — all tests above use 'test-api-key'

  // Case 19: no secret leakage in errors
  it('error messages never contain the API key value', async () => {
    const apiKey = 'super-secret-key-12345';
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 500, json: async () => ({}),
    } as Response);
    const err = await catchErr(
      new FluxImageProvider({ apiKey, fetch: mockFetch, sleep: async () => {} }).generateFromText(
        makeRequest(),
      ),
    );
    expect((err as Error).message).not.toContain(apiKey);
  });

  it('error messages do not include raw prompt text', async () => {
    const sensitivePrompt = 'confidential brand campaign brief 2026';
    const err = await catchErr(
      makeFluxProvider({ fetch: vi.fn() }).generateFromText(
        makeRequest({ prompt: sensitivePrompt, width: 0 }),
      ),
    );
    expect((err as Error).message).not.toContain(sensitivePrompt);
  });

  // Case 20: no prompt/raw bytes/API key leakage in observer events
  it('observer events do not include prompt, API key, or raw image bytes', async () => {
    const { observer, events } = makeObserver();
    const provider = new FluxImageProvider({
      apiKey: 'my-secret-api-key',
      fetch: makeFluxFetch(),
      sleep: async () => {},
      maxPollAttempts: 3,
      observer,
    });
    await provider.generateFromText(makeRequest({ prompt: 'sensitive brief content' }));

    for (const event of events) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain('sensitive brief content');
      expect(serialized).not.toContain('my-secret-api-key');
      expect(serialized).not.toContain('"data"');
    }
  });

  it('observer emits started then succeeded on a valid request', async () => {
    const { observer, events } = makeObserver();
    const provider = new FluxImageProvider({
      apiKey: 'test-key',
      fetch: makeFluxFetch(),
      sleep: async () => {},
      maxPollAttempts: 3,
      observer,
    });
    await provider.generateFromText(makeRequest({ width: 512, height: 768 }));

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('started');
    expect(events[0].operation).toBe('generateFromText');
    expect(events[0].provider).toBe('flux');
    expect(events[1].status).toBe('succeeded');
    expect(events[1].requestWidth).toBe(512);
    expect(events[1].requestHeight).toBe(768);
    expect(events[1].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('observer emits started then failed on an error', async () => {
    const { observer, events } = makeObserver();
    const provider = new FluxImageProvider({
      apiKey: 'test-key',
      fetch: vi.fn(),
      sleep: async () => {},
      observer,
    });
    await catchErr(provider.generateFromText(makeRequest({ prompt: '' })));

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('started');
    expect(events[1].status).toBe('failed');
    expect(events[1].errorCode).toBe('PROVIDER_INVALID_REQUEST');
  });

  it('failed observer event does not include prompt text or API key', async () => {
    const { observer, events } = makeObserver();
    await catchErr(
      new FluxImageProvider({
        apiKey: 'my-key-value',
        fetch: vi.fn().mockRejectedValueOnce(new TypeError('network down')),
        sleep: async () => {},
        observer,
      }).generateFromText(makeRequest({ prompt: 'sensitive prompt text' })),
    );
    const failedEvent = events.find((e) => e.status === 'failed')!;
    const serialized = JSON.stringify(failedEvent);
    expect(serialized).not.toContain('sensitive prompt text');
    expect(serialized).not.toContain('my-key-value');
  });

  // Additional: FluxImageProvider id
  it('id is "flux"', () => {
    expect(new FluxImageProvider({ apiKey: 'test' }).id).toBe('flux');
  });

  // Additional: respects configurable baseUrl and model
  it('uses configured baseUrl and model in the submit request URL', async () => {
    const mockFetch = makeFluxFetch();
    const provider = makeFluxProvider({
      fetch: mockFetch,
      baseUrl: 'https://custom.api.example.com',
      model: 'flux-pro',
    });
    await provider.generateFromText(makeRequest());

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('custom.api.example.com');
    expect(url).toContain('flux-pro');
  });
});
