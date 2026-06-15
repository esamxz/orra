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

function makeImageRequest(overrides?: Partial<{ prompt: string; width: number; height: number; size?: string }>) {
  return {
    prompt: 'A serene mountain landscape at dawn',
    width: 1080,
    height: 1350,
    ...overrides,
  };
}

function makeImageApiResponse(base64?: string) {
  return {
    created: Date.now(),
    data: [
      {
        b64_json: base64 ?? FAKE_BASE64,
        revised_prompt: 'A serene mountain landscape at dawn, illustrated in a premium style',
      },
    ],
  };
}

function mockFetch(fetchFn: ReturnType<typeof vi.fn>, body: unknown, status = 200) {
  fetchFn.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
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
    mockFetch(fetchFn, makeImageApiResponse());

    const result = await provider.generateImage(makeImageRequest());
    expect(result.provider).toBe('openai');
    expect(result.model).toBe(FAKE_MODEL);
    expect(result.mimeType).toBe('image/png');
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('uses Images API /v1/images/generations', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest());

    const [url] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/images/generations');
    expect(url).not.toContain('/responses');
  });

  it('request body contains only model, prompt, size for minimal path', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest());

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(['model', 'prompt', 'size']);
    expect(body.model).toBe(FAKE_MODEL);
    expect(body.prompt).toBe('A serene mountain landscape at dawn');
    expect(body.size).toBe('1024x1536');
  });

  it('does not send background transparent', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest());

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.background).toBeUndefined();
  });

  it('does not send width/height', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest());

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.width).toBeUndefined();
    expect(body.height).toBeUndefined();
  });

  it('does not send Responses API tool fields', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest());

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.input).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.response_format).toBeUndefined();
    expect(body.n).toBeUndefined();
  });

  it('4:5 document results in size 1024x1536 by default', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest({ width: 4, height: 5 }));

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.size).toBe('1024x1536');
  });

  it('sends size override when request.size is provided', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest({ width: 4, height: 5, size: '1024x1024' }));

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.size).toBe('1024x1024');
  });

  it('sends size override when provider is constructed with size option', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn, size: '1024x1024' });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest({ width: 4, height: 5 }));

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.size).toBe('1024x1024');
  });

  it('request-level size override beats provider-level size override', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn, size: '1024x1024' });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest({ width: 4, height: 5, size: '1536x1024' }));

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.size).toBe('1536x1024');
  });

  it('sends quality low and output_format jpeg when configured', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({
      fetch: fetchFn,
      size: '1024x1024',
      quality: 'low',
      outputFormat: 'jpeg',
    });
    mockFetch(fetchFn, makeImageApiResponse());

    const result = await provider.generateImage(makeImageRequest({ width: 4, height: 5 }));

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.size).toBe('1024x1024');
    expect(body.quality).toBe('low');
    expect(body.output_format).toBe('jpeg');
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('sends Authorization: Bearer header (key not in URL or body)', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, makeImageApiResponse());

    await provider.generateImage(makeImageRequest());

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${FAKE_KEY}`);
    expect(url).not.toContain(FAKE_KEY);
    const body = JSON.parse(init.body as string);
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it('maps HTTP 400 to safe rejected message without leaking raw prompt/key/response', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(
      fetchFn,
      { error: { message: 'Invalid request', type: 'invalid_request_error' } },
      400,
    );

    let caught: AIProviderError | undefined;
    try {
      await provider.generateImage(makeImageRequest());
    } catch (err) {
      if (err instanceof AIProviderError) caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('PROVIDER_HTTP_ERROR');
    expect(caught!.retryable).toBe(false);
    expect(caught!.message).toContain('rejected');
    expect(caught!.message).not.toContain(FAKE_KEY);
    expect(caught!.message).not.toContain('A serene mountain');
    expect(caught!.message).not.toContain('Invalid request');
    expect(caught!.message).not.toContain('size:');
  });

  it('maps HTTP 429 to PROVIDER_RATE_LIMITED with retryable: true', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'rate limited' }, 429);

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_RATE_LIMITED' &&
        err.retryable === true
      );
    });
  });

  it('maps HTTP 401 to PROVIDER_AUTH_FAILED with retryable: false', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'unauthorized' }, 401);

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_AUTH_FAILED' &&
        err.retryable === false
      );
    });
  });

  it('maps HTTP 403 to PROVIDER_AUTH_FAILED with retryable: false', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { error: 'forbidden' }, 403);

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_AUTH_FAILED' &&
        err.retryable === false
      );
    });
  });

  it('maps HTTP 404 to PROVIDER_NOT_FOUND with model name in message', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn, model: 'gpt-image-2' });
    mockFetch(fetchFn, { error: 'not found' }, 404);

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_NOT_FOUND' &&
        err.retryable === false &&
        err.message.includes('gpt-image-2')
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

  it('maps AbortError to PROVIDER_TIMEOUT with configured timeout message', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn, timeoutMs: 5000 });
    mockFetchError(fetchFn, 'AbortError', 'The operation was aborted');

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AIProviderError &&
        err.code === 'PROVIDER_TIMEOUT' &&
        err.retryable === true &&
        err.message.includes('5000ms')
      );
    });
  });

  it('maps response with no b64_json to PROVIDER_INVALID_RESPONSE', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { data: [{ url: 'https://example.com/img.png' }] });

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE';
    });
  });

  it('maps empty data array to PROVIDER_INVALID_RESPONSE', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { data: [] });

    await expect(provider.generateImage(makeImageRequest())).rejects.toSatisfy((err: unknown) => {
      return err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE';
    });
  });

  it('maps wrong envelope shape to PROVIDER_INVALID_RESPONSE', async () => {
    const fetchFn = vi.fn();
    const provider = makeProvider({ fetch: fetchFn });
    mockFetch(fetchFn, { output: [{ type: 'image_generation_call', result: FAKE_BASE64 }] });

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
      json: async () => makeImageApiResponse(),
      headers: new Headers(),
    } as Response);

    try {
      await provider.generateImage(makeImageRequest());
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
});
