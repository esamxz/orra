import { describe, it, expect } from 'vitest';
import { createImageProviderRouter } from '../imageRouter.js';
import { FakeImageProvider } from '../providers/fakeImageProvider.js';
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

describe('ImageProviderRouter', () => {
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

  it('throws AIProviderError with PROVIDER_CONFIG_MISSING for an unknown provider', () => {
    expect(() => createImageProviderRouter({ provider: 'flux' })).toThrow(AIProviderError);
    try {
      createImageProviderRouter({ provider: 'flux' });
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
      expect((err as AIProviderError).provider).toBe('flux');
    }
  });

  it('throws AIProviderError for any unknown provider string', () => {
    expect(() => createImageProviderRouter({ provider: 'gemini-image' })).toThrow(AIProviderError);
    try {
      createImageProviderRouter({ provider: 'gemini-image' });
    } catch (err) {
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
    }
  });

  it('does not require any env vars to instantiate', () => {
    expect(() => createImageProviderRouter()).not.toThrow();
    expect(() => createImageProviderRouter({})).not.toThrow();
    expect(() => createImageProviderRouter({ provider: undefined })).not.toThrow();
  });
});

describe('package exports smoke', () => {
  it('image types and provider and router are all importable', () => {
    // Verify all expected exports are accessible at runtime
    expect(FakeImageProvider).toBeDefined();
    expect(createImageProviderRouter).toBeDefined();
  });

  it('ImageProvider interface is structurally satisfied by FakeImageProvider', () => {
    const provider: ImageProvider = new FakeImageProvider();
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
