import { describe, it, expect, vi } from 'vitest';
import { OpenAIImageProvider } from '../providers/openAIImageProvider.js';
import { AIProviderError } from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_KEY = 'sk-test-openai-image-key-never-logged';
const FAKE_MODEL = 'gpt-image-2';

const FAKE_BASE64 = btoa('fake-image-bytes');

function makeProvider(overrides?: Partial<ConstructorParameters<typeof OpenAIImageProvider>[0]>) {
  return new OpenAIImageProvider({
    apiKey: FAKE_KEY,
    model: FAKE_MODEL,
    fetch: vi.fn(),
    ...overrides,
  });
}

function makeImageRequest() {
  return {
    prompt: 'A serene mountain landscape at dawn',
    width: 1024,
    height: 1024,
  };
}

function makeEnvelope(base64?: string) {
  return {
    output: [
      {
        type: 'image_generation_call',
        status: 'completed',
        result: base64 ?? FAKE_BASE64,
      },
    ],
  };
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
// generateImage tests
// ---------------------------------------------------------------------------

describe('OpenAIImageProvider — generateImage', () => {
  it('returns ImageGenerationResult with Uint8Array data on success', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope());

    const result = await provider.generateImage(makeImageRequest());
    expect(result.provider).toBe('openai');
    expect(result.model).toBe(FAKE_MODEL);
    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('uses Responses API with image_generation tool', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope());

    await provider.generateImage(makeImageRequest());

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/responses');
    const body = JSON.parse(init.body as string);
    expect(body.tools).toEqual([{ type: 'image_generation' }]);
  });

  it('sends Authorization: Bearer header (key not in URL or body)', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeEnvelope());

    await provider.generateImage(makeImageRequest());

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${FAKE_KEY}`);
    expect(url).not.toContain(FAKE_KEY);
    const body = JSON.parse(init.body as string);
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it('maps HTTP 429 to PROVIDER_HTTP_ERROR with retryable: true', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'rate limited' }, 429);

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_HTTP_ERROR' &&
        err.retryable === true &&
        err.message.includes('429')
      );
    });
  });

  it('maps HTTP 503 to PROVIDER_HTTP_ERROR with retryable: true', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'unavailable' }, 503);

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
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

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_TIMEOUT' &&
        err.retryable === true
      );
    });
  });

  it('maps output with no image_generation_call to PROVIDER_INVALID_RESPONSE', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { output: [{ type: 'message', content: [{ text: 'hello' }] }] });

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE';
    });
  });

  it('maps image_generation_call with missing result to PROVIDER_INVALID_RESPONSE', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { output: [{ type: 'image_generation_call', status: 'completed' }] });

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE';
    });
  });

  it('maps wrong envelope shape to PROVIDER_INVALID_RESPONSE', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { data: [{ url: 'https://example.com/img.png' }] });

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE';
    });
  });

  it('API key never appears in thrown error messages', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'unauthorized' }, 401);

    let caughtMessage = '';
    try {
      await provider.generateImage(makeImageRequest());
    } catch (err) {
      caughtMessage = err instanceof Error ? err.message : String(err);
    }
    expect(caughtMessage).not.toContain(FAKE_KEY);
  });

  it('throws PROVIDER_INVALID_REQUEST for empty prompt', async () => {
    const provider = makeProvider();
    await expect(
      provider.generateImage({ ...makeImageRequest(), prompt: '' }),
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_REQUEST';
    });
  });
});

// ---------------------------------------------------------------------------
// provider identity
// ---------------------------------------------------------------------------

describe('OpenAIImageProvider — identity', () => {
  it('id is "openai"', () => {
    const provider = makeProvider();
    expect(provider.id).toBe('openai');
  });
});

// ---------------------------------------------------------------------------
// default fetch safe wrapper (Cloudflare Workers binding regression)
// ---------------------------------------------------------------------------

describe('OpenAIImageProvider — default fetch safe wrapper', () => {
  it('resolves globalThis.fetch at call time, not construction time', async () => {
    // Create provider with NO injected fetch — exercises the wrapper path.
    const provider = new OpenAIImageProvider({ apiKey: FAKE_KEY, model: FAKE_MODEL });

    // Spy installed AFTER construction. With the old detached-reference pattern
    // (this.fetchFn = globalThis.fetch), this spy would never be called because
    // the constructor already captured the original reference. The wrapper
    // ((input, init) => globalThis.fetch(input, init)) re-reads globalThis.fetch
    // on every call, so the spy IS called.
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeEnvelope(),
    } as Response);

    try {
      await provider.generateImage(makeImageRequest());
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
});
