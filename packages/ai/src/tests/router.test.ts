import { describe, it, expect } from 'vitest';
import { createAIProviderRouter } from '../router.js';
import { FakeAIProvider } from '../providers/fakeProvider.js';
import { GeminiTextProvider } from '../providers/geminiTextProvider.js';
import { OpenAITextProvider } from '../providers/openAITextProvider.js';
import { AIProviderError } from '../errors.js';

describe('AIProviderRouter', () => {
  it('getProvider() returns a FakeAIProvider instance', () => {
    const router = createAIProviderRouter();
    const provider = router.getProvider();
    expect(provider).toBeInstanceOf(FakeAIProvider);
  });

  it('provider name is "fake"', () => {
    const router = createAIProviderRouter();
    expect(router.getProvider().name).toBe('fake');
  });

  it('returns fake provider when called with no config', () => {
    const router = createAIProviderRouter();
    expect(router.getProvider().name).toBe('fake');
  });

  it('returns fake when AI_PROVIDER is undefined', () => {
    const router = createAIProviderRouter({ provider: undefined });
    expect(router.getProvider()).toBeInstanceOf(FakeAIProvider);
  });

  it('returns fake when AI_PROVIDER is "fake"', () => {
    const router = createAIProviderRouter({ provider: 'fake' });
    expect(router.getProvider()).toBeInstanceOf(FakeAIProvider);
  });

  it('returns GeminiTextProvider when AI_PROVIDER is "gemini" with key', () => {
    const router = createAIProviderRouter({ provider: 'gemini', geminiApiKey: 'test-key' });
    const provider = router.getProvider();
    expect(provider).toBeInstanceOf(GeminiTextProvider);
    expect(provider.name).toBe('gemini');
  });

  it('throws PROVIDER_CONFIG_MISSING when AI_PROVIDER is "gemini" without key', () => {
    expect(() => createAIProviderRouter({ provider: 'gemini' })).toThrow(AIProviderError);
    try {
      createAIProviderRouter({ provider: 'gemini' });
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
      expect((err as AIProviderError).provider).toBe('gemini');
    }
  });

  it('throws AIProviderError for unknown provider string', () => {
    expect(() => createAIProviderRouter({ provider: 'gemini-2.5-flash-lite' })).toThrow(
      AIProviderError,
    );
    try {
      createAIProviderRouter({ provider: 'gemini-2.5-flash-lite' });
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
    }
  });
});

describe('AIProviderRouter — openai', () => {
  it('returns OpenAITextProvider when provider=openai with key', () => {
    const router = createAIProviderRouter({ provider: 'openai', openaiApiKey: 'sk-test' });
    const provider = router.getProvider();
    expect(provider).toBeInstanceOf(OpenAITextProvider);
    expect(provider.name).toBe('openai');
  });

  it('defaults model to gpt-4o-mini when openaiModel is not set', () => {
    const router = createAIProviderRouter({ provider: 'openai', openaiApiKey: 'sk-test' });
    expect(router.getProvider()).toBeInstanceOf(OpenAITextProvider);
  });

  it('accepts custom openaiModel', () => {
    const router = createAIProviderRouter({
      provider: 'openai',
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-4o',
    });
    expect(router.getProvider()).toBeInstanceOf(OpenAITextProvider);
  });

  it('throws PROVIDER_CONFIG_MISSING when provider=openai without key', () => {
    expect(() => createAIProviderRouter({ provider: 'openai' })).toThrow(AIProviderError);
    try {
      createAIProviderRouter({ provider: 'openai' });
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe('PROVIDER_CONFIG_MISSING');
      expect((err as AIProviderError).provider).toBe('openai');
      expect((err as AIProviderError).message).toContain('OPENAI_API_KEY');
    }
  });

  it('error message for missing key never contains a key value', () => {
    try {
      createAIProviderRouter({ provider: 'openai' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      expect(msg).not.toMatch(/^sk-/);
    }
  });

  it('getProvider() returns a new instance on each call', () => {
    const router = createAIProviderRouter({ provider: 'openai', openaiApiKey: 'sk-test' });
    expect(router.getProvider()).not.toBe(router.getProvider());
  });
});
