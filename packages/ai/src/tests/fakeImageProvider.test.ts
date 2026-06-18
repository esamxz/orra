import { describe, it, expect } from 'vitest';
import { FakeImageProvider } from '../providers/fakeImageProvider.js';
import { AIProviderError } from '../errors.js';
import type { AIProviderObserver, AIProviderObservation } from '../observability.js';
import type { ImageGenerationRequest, ImageEditRequest } from '../imageTypes.js';

function makeRequest(overrides: Partial<ImageGenerationRequest> = {}): ImageGenerationRequest {
  return {
    prompt: 'a calm blue gradient background',
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

describe('FakeImageProvider', () => {
  describe('determinism', () => {
    it('returns identical output for the same request called twice', async () => {
      const provider = new FakeImageProvider();
      const req = makeRequest({ seed: 42 });
      const r1 = await provider.generateImage(req);
      const r2 = await provider.generateImage(req);
      expect(r1.provider).toBe(r2.provider);
      expect(r1.model).toBe(r2.model);
      expect(r1.width).toBe(r2.width);
      expect(r1.height).toBe(r2.height);
      expect(r1.seed).toBe(r2.seed);
      expect(Array.from(r1.data)).toEqual(Array.from(r2.data));
    });
  });

  describe('result fields', () => {
    it('uses provider id "fake" and model "fake-image-v1"', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest());
      expect(result.provider).toBe('fake');
      expect(result.model).toBe('fake-image-v1');
    });

    it('preserves requested width and height', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest({ width: 800, height: 600 }));
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });

    it('preserves seed when provided', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest({ seed: 99 }));
      expect(result.seed).toBe(99);
    });

    it('uses seed 0 when no seed is provided', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest());
      expect(result.seed).toBe(0);
    });

    it('returns a non-empty Uint8Array as data', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest());
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('defaults mimeType to image/png when no format given', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest());
      expect(result.mimeType).toBe('image/png');
    });

    it('reflects the requested format in mimeType', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest({ format: 'jpeg' }));
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('includes kind in metadata, defaulting to "unknown"', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest());
      expect((result.metadata as Record<string, unknown>)?.kind).toBe('unknown');
    });

    it('reflects the requested kind in metadata', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest({ kind: 'background' }));
      expect((result.metadata as Record<string, unknown>)?.kind).toBe('background');
    });
  });

  describe('transparentBackground', () => {
    it('returns a warning when transparentBackground is true', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest({ transparentBackground: true }));
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings![0]).toContain('transparent background not encoded');
    });

    it('returns no warnings when transparentBackground is false', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest({ transparentBackground: false }));
      expect(result.warnings).toHaveLength(0);
    });

    it('returns no warnings when transparentBackground is omitted', async () => {
      const result = await new FakeImageProvider().generateImage(makeRequest());
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects an empty prompt string', async () => {
      const provider = new FakeImageProvider();
      await expect(provider.generateImage(makeRequest({ prompt: '' }))).rejects.toThrow(AIProviderError);
      try {
        await provider.generateImage(makeRequest({ prompt: '' }));
      } catch (err) {
        expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
        expect((err as AIProviderError).provider).toBe('fake');
      }
    });

    it('rejects a whitespace-only prompt', async () => {
      const provider = new FakeImageProvider();
      await expect(provider.generateImage(makeRequest({ prompt: '   ' }))).rejects.toThrow(AIProviderError);
      try {
        await provider.generateImage(makeRequest({ prompt: '   ' }));
      } catch (err) {
        expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
      }
    });

    it('rejects width of 0', async () => {
      const provider = new FakeImageProvider();
      await expect(provider.generateImage(makeRequest({ width: 0 }))).rejects.toThrow(AIProviderError);
      try {
        await provider.generateImage(makeRequest({ width: 0 }));
      } catch (err) {
        expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
      }
    });

    it('rejects negative width', async () => {
      await expect(new FakeImageProvider().generateImage(makeRequest({ width: -1 }))).rejects.toThrow(AIProviderError);
    });

    it('rejects width of NaN', async () => {
      const provider = new FakeImageProvider();
      await expect(provider.generateImage(makeRequest({ width: NaN }))).rejects.toThrow(AIProviderError);
      try {
        await provider.generateImage(makeRequest({ width: NaN }));
      } catch (err) {
        expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
      }
    });

    it('rejects height of 0', async () => {
      await expect(new FakeImageProvider().generateImage(makeRequest({ height: 0 }))).rejects.toThrow(AIProviderError);
    });

    it('rejects negative height', async () => {
      await expect(new FakeImageProvider().generateImage(makeRequest({ height: -100 }))).rejects.toThrow(AIProviderError);
    });
  });

  describe('privacy — error messages do not leak prompt text', () => {
    it('empty prompt error message does not include the prompt value', async () => {
      const secretPrompt = 'my secret prompt content';
      try {
        await new FakeImageProvider().generateImage(makeRequest({ prompt: '' }));
      } catch (err) {
        expect((err as Error).message).not.toContain(secretPrompt);
      }
    });

    it('dimension error message does not include prompt text', async () => {
      const sensitivePrompt = 'confidential campaign brief';
      try {
        await new FakeImageProvider().generateImage(makeRequest({ prompt: sensitivePrompt, width: -1 }));
      } catch (err) {
        expect((err as Error).message).not.toContain(sensitivePrompt);
      }
    });
  });

  describe('observer', () => {
    it('emits started then succeeded on a valid request', async () => {
      const { observer, events } = makeObserver();
      const provider = new FakeImageProvider(observer);
      await provider.generateImage(makeRequest({ width: 1080, height: 1350 }));
      expect(events).toHaveLength(2);
      expect(events[0].status).toBe('started');
      expect(events[1].status).toBe('succeeded');
      expect(events[0].operation).toBe('generateImage');
      expect(events[1].operation).toBe('generateImage');
    });

    it('emits started then failed on an invalid request', async () => {
      const { observer, events } = makeObserver();
      const provider = new FakeImageProvider(observer);
      await expect(provider.generateImage(makeRequest({ prompt: '' }))).rejects.toThrow();
      expect(events).toHaveLength(2);
      expect(events[0].status).toBe('started');
      expect(events[1].status).toBe('failed');
    });

    it('succeeded observation includes requestWidth and requestHeight', async () => {
      const { observer, events } = makeObserver();
      const provider = new FakeImageProvider(observer);
      await provider.generateImage(makeRequest({ width: 512, height: 768 }));
      const succeeded = events.find((e) => e.status === 'succeeded')!;
      expect(succeeded.requestWidth).toBe(512);
      expect(succeeded.requestHeight).toBe(768);
    });

    it('succeeded observation does not include prompt or raw image bytes', async () => {
      const { observer, events } = makeObserver();
      const provider = new FakeImageProvider(observer);
      await provider.generateImage(makeRequest({ prompt: 'top secret brief' }));
      const succeeded = events.find((e) => e.status === 'succeeded')!;
      const eventStr = JSON.stringify(succeeded);
      expect(eventStr).not.toContain('top secret brief');
      expect(eventStr).not.toContain('data');
    });

    it('failed observation does not include prompt text', async () => {
      const { observer, events } = makeObserver();
      const provider = new FakeImageProvider(observer);
      await expect(
        provider.generateImage(makeRequest({ prompt: 'confidential brief', width: 0 })),
      ).rejects.toThrow();
      const failed = events.find((e) => e.status === 'failed')!;
      const eventStr = JSON.stringify(failed);
      expect(eventStr).not.toContain('confidential brief');
    });

    it('succeeded observation includes provider "fake" and model "fake-image-v1"', async () => {
      const { observer, events } = makeObserver();
      await new FakeImageProvider(observer).generateImage(makeRequest());
      const succeeded = events.find((e) => e.status === 'succeeded')!;
      expect(succeeded.provider).toBe('fake');
      expect(succeeded.model).toBe('fake-image-v1');
    });

    it('failed observation includes errorCode from AIProviderError', async () => {
      const { observer, events } = makeObserver();
      const provider = new FakeImageProvider(observer);
      await expect(provider.generateImage(makeRequest({ prompt: '' }))).rejects.toThrow();
      const failed = events.find((e) => e.status === 'failed')!;
      expect(failed.errorCode).toBe('PROVIDER_INVALID_REQUEST');
    });
  });

  describe('FakeImageProvider id', () => {
    it('id is "fake"', () => {
      expect(new FakeImageProvider().id).toBe('fake');
    });
  });

  describe('editImage', () => {
    function makeEditRequest(overrides: Partial<ImageEditRequest> = {}): ImageEditRequest {
      return {
        prompt: 'make this image Minecraft style',
        image: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        mimeType: 'image/png',
        width: 1080,
        height: 1350,
        ...overrides,
      };
    }

    it('returns deterministic fake bytes with edit metadata', async () => {
      const result = await new FakeImageProvider().editImage(makeEditRequest());
      expect(result.provider).toBe('fake');
      expect(result.model).toBe('fake-image-v1');
      expect(result.mimeType).toBe('image/png');
      expect(result.data.length).toBeGreaterThan(0);
      expect((result.metadata as Record<string, unknown>)?.edit).toBe(true);
      expect((result.metadata as Record<string, unknown>)?.sourceByteLength).toBe(4);
    });

    it('preserves requested width, height, and format', async () => {
      const result = await new FakeImageProvider().editImage(makeEditRequest({ width: 800, height: 600, format: 'jpeg' }));
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('rejects an empty prompt', async () => {
      await expect(new FakeImageProvider().editImage(makeEditRequest({ prompt: '' }))).rejects.toThrow(AIProviderError);
      try {
        await new FakeImageProvider().editImage(makeEditRequest({ prompt: '' }));
      } catch (err) {
        expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
      }
    });

    it('rejects an empty source image', async () => {
      await expect(new FakeImageProvider().editImage(makeEditRequest({ image: new Uint8Array() }))).rejects.toThrow(AIProviderError);
      try {
        await new FakeImageProvider().editImage(makeEditRequest({ image: new Uint8Array() }));
      } catch (err) {
        expect((err as AIProviderError).code).toBe('PROVIDER_INVALID_REQUEST');
      }
    });

    it('rejects non-positive dimensions', async () => {
      await expect(new FakeImageProvider().editImage(makeEditRequest({ width: 0 }))).rejects.toThrow(AIProviderError);
      await expect(new FakeImageProvider().editImage(makeEditRequest({ height: -1 }))).rejects.toThrow(AIProviderError);
    });

    it('emits editImage observations', async () => {
      const { observer, events } = makeObserver();
      await new FakeImageProvider(observer).editImage(makeEditRequest());
      expect(events).toHaveLength(2);
      expect(events[0].operation).toBe('editImage');
      expect(events[0].status).toBe('started');
      expect(events[1].operation).toBe('editImage');
      expect(events[1].status).toBe('succeeded');
    });
  });
});
