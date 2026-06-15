import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeAIProvider } from '../providers/fakeProvider.js';
import { GeminiTextProvider } from '../providers/geminiTextProvider.js';
import { AIProviderError } from '../errors.js';
import { PromptEnhancementResultSchema } from '../schemas.js';
import { createAIProviderRouter } from '../router.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGeminiConfig() {
  return { apiKey: 'test-key', model: 'gemini-2.0-flash-lite' };
}

function makeEnhancementEnvelope(result: unknown) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
  };
}

function mockFetchOk(body: unknown) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

function mockFetchError(status: number) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({}),
  } as Response);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// FakeAIProvider — no network
// ---------------------------------------------------------------------------

describe('FakeAIProvider.enhancePrompt()', () => {
  it('returns a non-empty enhancedPrompt for a short prompt', async () => {
    const provider = new FakeAIProvider();
    const result = await provider.enhancePrompt({ prompt: 'Post about coffee' });
    expect(result.enhancedPrompt.trim()).not.toBe('');
    expect(result.inferredType).toBeTruthy();
  });

  it('preserves single_post for "post about discipline"', async () => {
    const provider = new FakeAIProvider();
    const result = await provider.enhancePrompt({ prompt: 'Make a post about discipline' });
    expect(result.inferredType).toBe('single_post');
    expect(result.cardCount).toBeUndefined();
  });

  it('preserves carousel for "5-card carousel about focus" with cardCount=5', async () => {
    const provider = new FakeAIProvider();
    const result = await provider.enhancePrompt({ prompt: 'Create a 5-card carousel about focus' });
    expect(result.inferredType).toBe('carousel');
    expect(result.cardCount).toBe(5);
  });

  it('respects selectedType override: carousel overrides keyword absence', async () => {
    const provider = new FakeAIProvider();
    const result = await provider.enhancePrompt({
      prompt: 'Tips for better sleep',
      selectedType: 'carousel',
    });
    expect(result.inferredType).toBe('carousel');
  });

  it('respects selectedType override: single_post beats carousel keyword', async () => {
    const provider = new FakeAIProvider();
    // "slides" keyword would normally trigger carousel, but selectedType wins
    const result = await provider.enhancePrompt({
      prompt: 'Create slides about nutrition',
      selectedType: 'single_post',
    });
    expect(result.inferredType).toBe('single_post');
    expect(result.cardCount).toBeUndefined();
  });

  it('includes aspect ratio in enhanced prompt when provided', async () => {
    const provider = new FakeAIProvider();
    const result = await provider.enhancePrompt({
      prompt: 'Post about mindset',
      aspectRatio: '4:5',
    });
    expect(result.enhancedPrompt).toContain('4:5');
  });

  it('mentions attached image when hasAssets is true', async () => {
    const provider = new FakeAIProvider();
    const result = await provider.enhancePrompt({ prompt: 'Create a visual', hasAssets: true });
    expect(result.enhancedPrompt.toLowerCase()).toContain('attached image');
  });

  it('output validates against PromptEnhancementResultSchema', async () => {
    const provider = new FakeAIProvider();
    const result = await provider.enhancePrompt({ prompt: 'A carousel about routines', selectedType: 'carousel' });
    expect(() => PromptEnhancementResultSchema.parse(result)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GeminiTextProvider — mocked fetch
// ---------------------------------------------------------------------------

describe('GeminiTextProvider.enhancePrompt()', () => {
  it('parses a valid Gemini response correctly', async () => {
    const geminiResult = {
      enhancedPrompt: 'Create a bold 4:5 post about discipline for driven individuals.',
      inferredType: 'single_post',
    };
    mockFetchOk(makeEnhancementEnvelope(geminiResult));

    const provider = new GeminiTextProvider(makeGeminiConfig());
    const result = await provider.enhancePrompt({ prompt: 'Post about discipline' });

    expect(result.enhancedPrompt).toBe(geminiResult.enhancedPrompt);
    expect(result.inferredType).toBe('single_post');
    expect(result.cardCount).toBeUndefined();
  });

  it('parses carousel response with cardCount', async () => {
    const geminiResult = {
      enhancedPrompt: 'Create a 5-card carousel about focus for creators.',
      inferredType: 'carousel',
      cardCount: 5,
    };
    mockFetchOk(makeEnhancementEnvelope(geminiResult));

    const provider = new GeminiTextProvider(makeGeminiConfig());
    const result = await provider.enhancePrompt({ prompt: '5-card carousel about focus' });

    expect(result.inferredType).toBe('carousel');
    expect(result.cardCount).toBe(5);
  });

  it('throws PROVIDER_RATE_LIMITED on 429', async () => {
    mockFetchError(429);
    const provider = new GeminiTextProvider(makeGeminiConfig());

    await expect(provider.enhancePrompt({ prompt: 'Post about focus' })).rejects.toSatisfy(
      (err: unknown) => err instanceof AIProviderError && err.code === 'PROVIDER_RATE_LIMITED',
    );
  });

  it('throws PROVIDER_INVALID_RESPONSE when schema validation fails', async () => {
    const badResult = { notAValidField: 'oops', inferredType: 'single_post' };
    mockFetchOk(makeEnhancementEnvelope(badResult));

    const provider = new GeminiTextProvider(makeGeminiConfig());

    await expect(provider.enhancePrompt({ prompt: 'Post about focus' })).rejects.toSatisfy(
      (err: unknown) => err instanceof AIProviderError && err.code === 'PROVIDER_INVALID_RESPONSE',
    );
  });

  it('sends the user prompt inside the request body', async () => {
    const geminiResult = {
      enhancedPrompt: 'Create a clean post about mindset.',
      inferredType: 'single_post',
    };
    mockFetchOk(makeEnhancementEnvelope(geminiResult));

    const provider = new GeminiTextProvider(makeGeminiConfig());
    await provider.enhancePrompt({ prompt: 'Post about mindset' });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const text = (body.contents as Array<{ parts: Array<{ text: string }> }>)[0].parts[0].text;
    expect(text).toContain('Post about mindset');
  });
});

// ---------------------------------------------------------------------------
// Router — missing API key
// ---------------------------------------------------------------------------

describe('createAIProviderRouter — gemini without key', () => {
  it('throws PROVIDER_CONFIG_MISSING when geminiApiKey is absent', () => {
    expect(() =>
      createAIProviderRouter({ provider: 'gemini', geminiApiKey: undefined }),
    ).toThrow();
  });
});
