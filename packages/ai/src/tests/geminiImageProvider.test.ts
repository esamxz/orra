import { describe, it, expect, vi } from 'vitest';
import { GeminiImageProvider, DEFAULT_GEMINI_IMAGE_MODEL } from '../providers/geminiImageProvider.js';
import { AIProviderError } from '../errors.js';
import type { AIProviderObservation, AIProviderObserver } from '../observability.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_KEY = 'test-api-key-value';

function makeFakeBase64Image(): string {
  // 3 bytes → 4 base64 chars: "AAEC"
  return btoa(String.fromCharCode(0, 1, 2));
}

function makeSuccessResponse(
  mimeType = 'image/png',
  base64Data = makeFakeBase64Image(),
): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType, data: base64Data } }],
          },
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeProvider(
  overrides: Partial<{
    apiKey: string;
    model: string;
    baseUrl: string;
    timeoutMs: number;
    observer: AIProviderObserver;
    fetchFn: typeof globalThis.fetch;
  }> = {},
) {
  return new GeminiImageProvider({
    apiKey: overrides.apiKey ?? FAKE_KEY,
    model: overrides.model,
    baseUrl: overrides.baseUrl ?? 'https://gemini.test',
    timeoutMs: overrides.timeoutMs ?? 5_000,
    observer: overrides.observer,
    fetch: overrides.fetchFn ?? vi.fn().mockResolvedValue(makeSuccessResponse()),
  });
}

const VALID_REQUEST = { prompt: 'a calm blue ocean background', width: 1080, height: 1080 };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('GeminiImageProvider — configuration', () => {
  it('uses DEFAULT_GEMINI_IMAGE_MODEL when no model is specified', () => {
    const provider = makeProvider();
    expect(provider.id).toBe('gemini');
    // model is private; verify via the request URL in the fetch call
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse());
    const p = new GeminiImageProvider({
      apiKey: FAKE_KEY,
      baseUrl: 'https://gemini.test',
      fetch: mockFetch,
    });
    return p.generateImage(VALID_REQUEST).then(() => {
      const url = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0] as string;
      expect(url).toContain(DEFAULT_GEMINI_IMAGE_MODEL);
    });
  });

  it('uses a custom model when provided', () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse());
    const p = new GeminiImageProvider({
      apiKey: FAKE_KEY,
      model: 'gemini-custom-model',
      baseUrl: 'https://gemini.test',
      fetch: mockFetch,
    });
    return p.generateImage(VALID_REQUEST).then(() => {
      const url = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0] as string;
      expect(url).toContain('gemini-custom-model');
    });
  });

  it('id is "gemini"', () => {
    expect(makeProvider().id).toBe('gemini');
  });
});

// ---------------------------------------------------------------------------
// Request shape — auth header, never key in URL
// ---------------------------------------------------------------------------

describe('GeminiImageProvider — request shape', () => {
  it('sends POST to /v1/models/{model}:generateContent', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse());
    const p = new GeminiImageProvider({
      apiKey: FAKE_KEY,
      model: 'gemini-2.5-flash-image',
      baseUrl: 'https://gemini.test',
      fetch: mockFetch,
    });
    await p.generateImage(VALID_REQUEST);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gemini.test/v1/models/gemini-2.5-flash-image:generateContent');
    expect((init.method as string).toUpperCase()).toBe('POST');
  });

  it('sends x-goog-api-key header instead of URL query param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse());
    const p = new GeminiImageProvider({
      apiKey: FAKE_KEY,
      baseUrl: 'https://gemini.test',
      fetch: mockFetch,
    });
    await p.generateImage(VALID_REQUEST);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe(FAKE_KEY);
    expect(url).not.toContain(FAKE_KEY);
    expect(url).not.toContain('key=');
  });

  it('request URL never contains the API key value', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse());
    const p = new GeminiImageProvider({
      apiKey: 'super-secret-key-123',
      baseUrl: 'https://gemini.test',
      fetch: mockFetch,
    });
    await p.generateImage(VALID_REQUEST);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).not.toContain('super-secret-key-123');
  });

  it('sends responseModalities IMAGE in generationConfig', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse());
    const p = new GeminiImageProvider({
      apiKey: FAKE_KEY,
      baseUrl: 'https://gemini.test',
      fetch: mockFetch,
    });
    await p.generateImage(VALID_REQUEST);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig: { responseModalities: string[] };
    };
    expect(body.generationConfig.responseModalities).toContain('IMAGE');
  });
});

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('GeminiImageProvider — success', () => {
  it('returns normalized ImageGenerationResult', async () => {
    const base64 = makeFakeBase64Image();
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse('image/png', base64));
    const p = new GeminiImageProvider({
      apiKey: FAKE_KEY,
      model: 'gemini-2.5-flash-image',
      baseUrl: 'https://gemini.test',
      fetch: mockFetch,
    });
    const result = await p.generateImage({ prompt: 'test', width: 512, height: 512 });
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash-image');
    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.data).toBeInstanceOf(Uint8Array);
  });

  it('decodes base64 image data to Uint8Array correctly', async () => {
    const bytes = [0x89, 0x50, 0x4e, 0x47]; // PNG header bytes
    const base64 = btoa(String.fromCharCode(...bytes));
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse('image/png', base64));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    const result = await p.generateImage(VALID_REQUEST);
    expect(Array.from(result.data)).toEqual(bytes);
  });

  it('returns mimeType from response inlineData', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse('image/jpeg'));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    const result = await p.generateImage(VALID_REQUEST);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('finds inlineData in any part position', async () => {
    const base64 = makeFakeBase64Image();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'some text part' },
                  { inlineData: { mimeType: 'image/png', data: base64 } },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    const result = await p.generateImage(VALID_REQUEST);
    expect(result.data).toBeInstanceOf(Uint8Array);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('GeminiImageProvider — input validation', () => {
  it('throws PROVIDER_INVALID_REQUEST for empty prompt', async () => {
    const p = makeProvider();
    await expect(p.generateImage({ prompt: '', width: 100, height: 100 })).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_REQUEST',
      provider: 'gemini',
    });
  });

  it('throws PROVIDER_INVALID_REQUEST for whitespace-only prompt', async () => {
    const p = makeProvider();
    await expect(p.generateImage({ prompt: '   ', width: 100, height: 100 })).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_REQUEST',
    });
  });
});

// ---------------------------------------------------------------------------
// HTTP error handling
// ---------------------------------------------------------------------------

describe('GeminiImageProvider — HTTP errors', () => {
  it('throws PROVIDER_HTTP_ERROR (not retryable) for 4xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Bad request', { status: 400 }));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    await expect(p.generateImage(VALID_REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_ERROR',
      provider: 'gemini',
      retryable: false,
    });
  });

  it('throws PROVIDER_HTTP_ERROR (retryable) for 5xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Server error', { status: 503 }));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    await expect(p.generateImage(VALID_REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_ERROR',
      provider: 'gemini',
      retryable: true,
    });
  });

  it('error message includes HTTP status code', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 }));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    await expect(p.generateImage(VALID_REQUEST)).rejects.toMatchObject({
      message: expect.stringContaining('403'),
    });
  });

  it('error message does not contain API key value', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const p = new GeminiImageProvider({ apiKey: 'my-secret-key', baseUrl: 'https://gemini.test', fetch: mockFetch });
    let caught: Error | null = null;
    try {
      await p.generateImage(VALID_REQUEST);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).not.toContain('my-secret-key');
  });
});

// ---------------------------------------------------------------------------
// Network / timeout errors
// ---------------------------------------------------------------------------

describe('GeminiImageProvider — network and timeout', () => {
  it('throws PROVIDER_UNAVAILABLE on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    await expect(p.generateImage(VALID_REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      provider: 'gemini',
      retryable: true,
    });
  });

  it('throws PROVIDER_TIMEOUT on AbortError', async () => {
    const mockFetch = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch, timeoutMs: 100 });
    await expect(p.generateImage(VALID_REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      provider: 'gemini',
      retryable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Response parsing errors
// ---------------------------------------------------------------------------

describe('GeminiImageProvider — response parsing', () => {
  it('throws PROVIDER_INVALID_RESPONSE for non-JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    await expect(p.generateImage(VALID_REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_RESPONSE',
    });
  });

  it('throws PROVIDER_INVALID_RESPONSE when envelope has no candidates', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    );
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    await expect(p.generateImage(VALID_REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_RESPONSE',
    });
  });

  it('throws PROVIDER_INVALID_RESPONSE when no part has inlineData', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'no image here' }] } }],
        }),
        { status: 200 },
      ),
    );
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    await expect(p.generateImage(VALID_REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_RESPONSE',
    });
  });

  it('throws PROVIDER_INVALID_RESPONSE for malformed base64', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ inlineData: { mimeType: 'image/png', data: '!!!not-base64!!!' } }] } },
          ],
        }),
        { status: 200 },
      ),
    );
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    await expect(p.generateImage(VALID_REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_RESPONSE',
    });
  });
});

// ---------------------------------------------------------------------------
// Observer — privacy guarantees
// ---------------------------------------------------------------------------

describe('GeminiImageProvider — observer privacy', () => {
  function captureObserver(): { events: AIProviderObservation[]; observer: AIProviderObserver } {
    const events: AIProviderObservation[] = [];
    return { events, observer: { observe: (e) => events.push(e) } };
  }

  it('emits started event with no API key', async () => {
    const { events, observer } = captureObserver();
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse());
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch, observer });
    await p.generateImage(VALID_REQUEST);
    const started = events.find((e) => e.status === 'started');
    expect(started).toBeDefined();
    expect(JSON.stringify(started)).not.toContain(FAKE_KEY);
  });

  it('emits succeeded event with durationMs and no API key', async () => {
    const { events, observer } = captureObserver();
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse());
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch, observer });
    await p.generateImage(VALID_REQUEST);
    const succeeded = events.find((e) => e.status === 'succeeded');
    expect(succeeded?.durationMs).toBeTypeOf('number');
    expect(JSON.stringify(succeeded)).not.toContain(FAKE_KEY);
  });

  it('emits failed event with errorCode and no API key', async () => {
    const { events, observer } = captureObserver();
    const mockFetch = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch, observer });
    await p.generateImage(VALID_REQUEST).catch(() => {});
    const failed = events.find((e) => e.status === 'failed');
    expect(failed?.errorCode).toBeDefined();
    expect(JSON.stringify(failed)).not.toContain(FAKE_KEY);
  });

  it('observer events never contain prompt text', async () => {
    const { events, observer } = captureObserver();
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse());
    const sensitivePrompt = 'TOP-SECRET-PROMPT-DO-NOT-LOG';
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch, observer });
    await p.generateImage({ prompt: sensitivePrompt, width: 100, height: 100 });
    const allEvents = JSON.stringify(events);
    expect(allEvents).not.toContain(sensitivePrompt);
  });
});

// ---------------------------------------------------------------------------
// AIProviderError type
// ---------------------------------------------------------------------------

describe('GeminiImageProvider — error types', () => {
  it('all thrown errors are AIProviderError instances', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('err', { status: 500 }));
    const p = new GeminiImageProvider({ apiKey: FAKE_KEY, baseUrl: 'https://gemini.test', fetch: mockFetch });
    let caught: unknown;
    try {
      await p.generateImage(VALID_REQUEST);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AIProviderError);
  });
});
