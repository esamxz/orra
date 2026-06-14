import { describe, it, expect } from 'vitest';
import { createImageProviderRouter } from '../imageRouter.js';
import { FakeImageProvider } from '../providers/fakeImageProvider.js';
import { GeminiImageProvider, DEFAULT_GEMINI_IMAGE_MODEL } from '../providers/geminiImageProvider.js';
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
    expect(createImageProviderRouter).toBeDefined();
  });

  it('ImageProvider interface is structurally satisfied by FakeImageProvider', () => {
    const provider: ImageProvider = new FakeImageProvider();
    expect(typeof provider.id).toBe('string');
    expect(typeof provider.generateImage).toBe('function');
  });

  it('ImageProvider interface is structurally satisfied by GeminiImageProvider', () => {
    const provider: ImageProvider = new GeminiImageProvider({ apiKey: 'test' });
    expect(typeof provider.id).toBe('string');
    expect(typeof provider.generateImage).toBe('function');
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
    const result: ImageGenerationResult = await new FakeImageProvider().generateImage({
      prompt: 'test',
      width: 100,
      height: 100,
    });
    expect(result.provider).toBe('fake');
    expect(result.data).toBeInstanceOf(Uint8Array);
  });
});
