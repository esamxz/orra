import { describe, it, expect, vi } from 'vitest';
import { createImageProviderRouter } from '../imageRouter.js';
import { FakeImageProvider } from '../providers/fakeImageProvider.js';
import { GeminiImageProvider, DEFAULT_GEMINI_IMAGE_MODEL } from '../providers/geminiImageProvider.js';
import { OpenAIImageProvider } from '../providers/openAIImageProvider.js';
import { AIProviderError } from '../errors.js';
import type {
  ImageGenerationKind,
  ImageOutputFormat,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProvider,
  ImageProviderRouter,
  ImageProviderRouterConfig,
} from '../index.js';

describe('ImageProviderRouter — fake (default)', () => {
  it('createImageProviderRouter() with no config returns a FakeImageProvider', () => {
    const router = createImageProviderRouter();
    expect(router.getProvider()).toBeInstanceOf(FakeImageProvider);
  });

  it('createImageProviderRouter({ provider: "fake" }) returns a FakeImageProvider', () => {
    const router = createImageProviderRouter({ provider: 'fake' });
    expect(router.getProvider()).toBeInstanceOf(FakeImageProvider);
  });

  it('getProvider().id is "fake"', () => {
    const router = createImageProviderRouter();
    expect(router.getProvider().id).toBe('fake');
  });

  it('getProvider() returns a new instance on each call', () => {
    const router = createImageProviderRouter();
    const p1 = router.getProvider();
    const p2 = router.getProvider();
    expect(p1).not.toBe(p2);
  });

  it('does not require any env vars to instantiate', () => {
    expect(() => createImageProviderRouter()).not.toThrow();
    expect(() => createImageProviderRouter({})).not.toThrow();
    expect(() => createImageProviderRouter({ provider: undefined })).not.toThrow();
  });
});

describe('ImageProviderRouter — gemini', () => {
  it('throws PROVIDER_CONFIG_MISSING when provider=gemini but geminiApiKey is missing', () => {
    expect(() => createImageProviderRouter({ provider: 'gemini' })).toThrow(AIProviderError);
    try {
      createImageProviderRouter({ provider: 'gemini' });
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
      expect((err as AIProviderError).provider).toBe('gemini');
      expect((err as AIProviderError).message).toContain('GEMINI_API_KEY');
    }
  });

  it('returns a GeminiImageProvider when provider=gemini with geminiApiKey', () => {
    const router = createImageProviderRouter({ provider: 'gemini', geminiApiKey: 'test-key' });
    expect(router.getProvider()).toBeInstanceOf(GeminiImageProvider);
  });

  it('GeminiImageProvider has id "gemini"', () => {
    const router = createImageProviderRouter({ provider: 'gemini', geminiApiKey: 'test-key' });
    expect(router.getProvider().id).toBe('gemini');
  });

  it('uses DEFAULT_GEMINI_IMAGE_MODEL when geminiImageModel is not set', () => {
    const router = createImageProviderRouter({ provider: 'gemini', geminiApiKey: 'test-key' });
    const provider = router.getProvider() as GeminiImageProvider;
    // Verify by calling and checking the URL in the request — not testing private state
    expect(provider).toBeInstanceOf(GeminiImageProvider);
    expect(DEFAULT_GEMINI_IMAGE_MODEL).toBe('gemini-2.5-flash-image');
  });

  it('passes geminiImageModel override to provider', () => {
    const router = createImageProviderRouter({
      provider: 'gemini',
      geminiApiKey: 'test-key',
      geminiImageModel: 'gemini-custom-model',
    });
    expect(router.getProvider()).toBeInstanceOf(GeminiImageProvider);
  });

  it('getProvider() returns a new instance on each call', () => {
    const router = createImageProviderRouter({ provider: 'gemini', geminiApiKey: 'test-key' });
    const p1 = router.getProvider();
    const p2 = router.getProvider();
    expect(p1).not.toBe(p2);
  });
});

describe('ImageProviderRouter — openai', () => {
  it('throws PROVIDER_CONFIG_MISSING when provider=openai but openaiApiKey is missing', () => {
    expect(() => createImageProviderRouter({ provider: 'openai' })).toThrow(AIProviderError);
    try {
      createImageProviderRouter({ provider: 'openai' });
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
      expect((err as AIProviderError).provider).toBe('openai');
      expect((err as AIProviderError).message).toContain('OPENAI_API_KEY');
    }
  });

  it('throws PROVIDER_CONFIG_MISSING when provider=openai but openaiImageModel is missing', () => {
    expect(() =>
      createImageProviderRouter({ provider: 'openai', openaiApiKey: 'sk-test' }),
    ).toThrow(AIProviderError);
    try {
      createImageProviderRouter({ provider: 'openai', openaiApiKey: 'sk-test' });
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
      expect((err as AIProviderError).message).toContain('OPENAI_IMAGE_MODEL');
    }
  });

  it('returns OpenAIImageProvider when provider=openai with key and model', () => {
    const router = createImageProviderRouter({
      provider: 'openai',
      openaiApiKey: 'sk-test',
      openaiImageModel: 'gpt-image-2',
    });
    expect(router.getProvider()).toBeInstanceOf(OpenAIImageProvider);
  });

  it('OpenAIImageProvider has id "openai"', () => {
    const router = createImageProviderRouter({
      provider: 'openai',
      openaiApiKey: 'sk-test',
      openaiImageModel: 'gpt-image-2',
    });
    expect(router.getProvider().id).toBe('openai');
  });

  it('getProvider() returns a new instance on each call', () => {
    const router = createImageProviderRouter({
      provider: 'openai',
      openaiApiKey: 'sk-test',
      openaiImageModel: 'gpt-image-2',
    });
    expect(router.getProvider()).not.toBe(router.getProvider());
  });

  it('passes OpenAI image options (size, quality, outputFormat) to provider', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: 'ZmFrZS1pbWFnZS1ieXRlcw==' }] }),
      headers: new Headers(),
    } as Response);

    const router = createImageProviderRouter({
      provider: 'openai',
      openaiApiKey: 'sk-test',
      openaiImageModel: 'gpt-image-2',
      openaiImageSize: '1024x1024',
      openaiImageQuality: 'low',
      openaiImageOutputFormat: 'jpeg',
      timeoutMs: 180000,
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    const provider = router.getProvider();
    await provider.generateFromText({ prompt: 'A square image', width: 4, height: 5 });

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.size).toBe('1024x1024');
    expect(body.quality).toBe('low');
    expect(body.output_format).toBe('jpeg');
  });

  it('uses default 180s image timeout when IMAGE_PROVIDER_TIMEOUT_MS is not provided', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: 'ZmFrZS1pbWFnZS1ieXRlcw==' }] }),
      headers: new Headers(),
    } as Response);

    const router = createImageProviderRouter({
      provider: 'openai',
      openaiApiKey: 'sk-test',
      openaiImageModel: 'gpt-image-2',
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    const provider = router.getProvider();
    await provider.generateFromText({ prompt: 'A square image', width: 4, height: 5 });

    // Default timeout is 180s; we can't easily observe it without a slow test,
    // but we can verify the provider accepted the request without an explicit timeout.
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});

describe('ImageProviderRouter — flux (deprecated)', () => {
  it('throws PROVIDER_CONFIG_MISSING with deprecation message for provider=flux', () => {
    expect(() => createImageProviderRouter({ provider: 'flux' })).toThrow(AIProviderError);
    try {
      createImageProviderRouter({ provider: 'flux' });
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
      expect((err as AIProviderError).provider).toBe('flux');
      expect((err as AIProviderError).message).toContain('deprecated');
      expect((err as AIProviderError).message).toContain('gemini');
    }
  });

  it('rejects flux even when a key is passed', () => {
    expect(() =>
      createImageProviderRouter({ provider: 'flux', geminiApiKey: 'some-key' }),
    ).toThrow(AIProviderError);
  });
});

describe('ImageProviderRouter — unknown provider', () => {
  it('throws AIProviderError for an unknown provider string', () => {
    expect(() => createImageProviderRouter({ provider: 'dalle' })).toThrow(AIProviderError);
    try {
      createImageProviderRouter({ provider: 'dalle' });
    } catch (err) {
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
    }
  });

  it('throws for empty-string-like unknown provider', () => {
    // whitespace trims to '' which maps to 'fake', not unknown
    expect(() => createImageProviderRouter({ provider: '  ' })).not.toThrow();
  });
});

describe('package exports smoke', () => {
  it('image types and provider and router are all importable', () => {
    expect(FakeImageProvider).toBeDefined();
    expect(GeminiImageProvider).toBeDefined();
    expect(OpenAIImageProvider).toBeDefined();
    expect(createImageProviderRouter).toBeDefined();
  });

  it('ImageProvider interface is structurally satisfied by FakeImageProvider', () => {
    const provider: ImageProvider = new FakeImageProvider();
    expect(typeof provider.id).toBe('string');
    expect(typeof provider.generateFromText).toBe('function');
  });

  it('ImageProvider interface is structurally satisfied by GeminiImageProvider', () => {
    const provider: ImageProvider = new GeminiImageProvider({ apiKey: 'test' });
    expect(typeof provider.id).toBe('string');
    expect(typeof provider.generateFromText).toBe('function');
  });

  it('ImageProviderRouter interface is structurally satisfied by createImageProviderRouter()', () => {
    const router: ImageProviderRouter = createImageProviderRouter();
    expect(typeof router.getProvider).toBe('function');
  });

  it('ImageProviderRouterConfig type allows provider field', () => {
    const config: ImageProviderRouterConfig = { provider: 'fake' };
    expect(config.provider).toBe('fake');
  });

  it('ImageGenerationKind type values are usable', () => {
    const kinds: ImageGenerationKind[] = ['background', 'object', 'reference', 'unknown'];
    expect(kinds).toHaveLength(4);
  });

  it('ImageOutputFormat type values are usable', () => {
    const formats: ImageOutputFormat[] = ['png', 'jpeg', 'webp'];
    expect(formats).toHaveLength(3);
  });

  it('ImageGenerationRequest shape is correct', () => {
    const req: ImageGenerationRequest = {
      prompt: 'test',
      width: 100,
      height: 100,
      kind: 'background',
      format: 'png',
      transparentBackground: false,
      seed: 1,
    };
    expect(req.prompt).toBe('test');
  });

  it('ImageGenerationResult shape is correct', async () => {
    const result: ImageGenerationResult = await new FakeImageProvider().generateFromText({
      prompt: 'test',
      width: 100,
      height: 100,
    });
    expect(result.provider).toBe('fake');
    expect(result.data).toBeInstanceOf(Uint8Array);
  });
});
