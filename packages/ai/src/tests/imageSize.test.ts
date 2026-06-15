import { describe, it, expect } from 'vitest';
import { resolveImageRequestSize } from '../imageSize.js';

// ---------------------------------------------------------------------------
// OpenAI size presets
// ---------------------------------------------------------------------------

describe('resolveImageRequestSize — openai', () => {
  it('1:1 → 1024x1024', () => {
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 1, h: 1 } })).toBe('1024x1024');
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 1080, h: 1080 } })).toBe('1024x1024');
  });

  it('4:5 → 1024x1536', () => {
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 4, h: 5 } })).toBe('1024x1536');
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 1080, h: 1350 } })).toBe('1024x1536');
  });

  it('3:4 → 1024x1536', () => {
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 3, h: 4 } })).toBe('1024x1536');
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 768, h: 1024 } })).toBe('1024x1536');
  });

  it('9:16 → 1024x1536', () => {
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 9, h: 16 } })).toBe('1024x1536');
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 1080, h: 1920 } })).toBe('1024x1536');
  });

  it('5:4 → 1536x1024', () => {
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 5, h: 4 } })).toBe('1536x1024');
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 1350, h: 1080 } })).toBe('1536x1024');
  });

  it('4:3 → 1536x1024', () => {
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 4, h: 3 } })).toBe('1536x1024');
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 1024, h: 768 } })).toBe('1536x1024');
  });

  it('16:9 → 1536x1024', () => {
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 16, h: 9 } })).toBe('1536x1024');
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 1920, h: 1080 } })).toBe('1536x1024');
  });

  it('does not return custom sizes like 1024x1280 in OpenAI mode', () => {
    const size = resolveImageRequestSize({ provider: 'openai', ratio: { w: 4, h: 5 } });
    expect(size).not.toBe('1024x1280');
    expect(size).toBe('1024x1536');
  });

  it('uses explicit requestedSize override when provided', () => {
    expect(
      resolveImageRequestSize({ provider: 'openai', ratio: { w: 4, h: 5 }, requestedSize: '1024x1024' }),
    ).toBe('1024x1024');
  });

  it('custom landscape ratio → 1536x1024', () => {
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 7, h: 3 } })).toBe('1536x1024');
  });

  it('custom portrait ratio → 1024x1536', () => {
    expect(resolveImageRequestSize({ provider: 'openai', ratio: { w: 3, h: 7 } })).toBe('1024x1536');
  });
});

// ---------------------------------------------------------------------------
// Fake/Gemini fallback
// ---------------------------------------------------------------------------

describe('resolveImageRequestSize — fake/gemini', () => {
  it('fake provider maps ratios to canonical preset strings', () => {
    expect(resolveImageRequestSize({ provider: 'fake', ratio: { w: 1, h: 1 } })).toBe('1024x1024');
    expect(resolveImageRequestSize({ provider: 'fake', ratio: { w: 4, h: 5 } })).toBe('1024x1536');
    expect(resolveImageRequestSize({ provider: 'fake', ratio: { w: 16, h: 9 } })).toBe('1536x1024');
  });

  it('gemini provider maps ratios to canonical preset strings', () => {
    expect(resolveImageRequestSize({ provider: 'gemini', ratio: { w: 1, h: 1 } })).toBe('1024x1024');
    expect(resolveImageRequestSize({ provider: 'gemini', ratio: { w: 4, h: 5 } })).toBe('1024x1536');
    expect(resolveImageRequestSize({ provider: 'gemini', ratio: { w: 16, h: 9 } })).toBe('1536x1024');
  });

  it('uses explicit requestedSize override for fake/gemini', () => {
    expect(
      resolveImageRequestSize({ provider: 'fake', ratio: { w: 4, h: 5 }, requestedSize: '512x512' }),
    ).toBe('512x512');
  });
});
