import { describe, it, expect } from 'vitest';
import { normalizeTextPlanResult } from '../normalization.js';
import { AIProviderError } from '../errors.js';

function makeValidInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'My Plan',
    summary: 'A brief summary.',
    cardCount: 3,
    body: 'The body content.',
    styleNotes: ['minimal', 'clean'],
    ...overrides,
  };
}

function expectInvalidResponse(input: unknown, provider?: string): void {
  let caught: unknown;
  try {
    normalizeTextPlanResult(input, provider);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(AIProviderError);
  expect((caught as AIProviderError).code).toBe('PROVIDER_INVALID_RESPONSE');
}

describe('normalizeTextPlanResult', () => {
  it('returns a valid TextPlanResult from well-formed input', () => {
    const result = normalizeTextPlanResult(makeValidInput());
    expect(result.title).toBe('My Plan');
    expect(result.summary).toBe('A brief summary.');
    expect(result.cardCount).toBe(3);
    expect(result.body).toBe('The body content.');
    expect(result.styleNotes).toEqual(['minimal', 'clean']);
  });

  it('trims whitespace from title, summary, and body', () => {
    const result = normalizeTextPlanResult(
      makeValidInput({ title: '  My Plan  ', summary: '\nA brief summary.\n', body: '  Body.  ' }),
    );
    expect(result.title).toBe('My Plan');
    expect(result.summary).toBe('A brief summary.');
    expect(result.body).toBe('Body.');
  });

  it('trims and removes empty styleNotes', () => {
    const result = normalizeTextPlanResult(
      makeValidInput({ styleNotes: ['  minimal  ', '   ', 'clean', ''] }),
    );
    expect(result.styleNotes).toEqual(['minimal', 'clean']);
  });

  it('clamps cardCount above 10 to 10', () => {
    const result = normalizeTextPlanResult(makeValidInput({ cardCount: 99 }));
    expect(result.cardCount).toBe(10);
  });

  it('clamps cardCount below 1 to 1', () => {
    const result = normalizeTextPlanResult(makeValidInput({ cardCount: 0 }));
    expect(result.cardCount).toBe(1);
  });

  it('clamps negative cardCount to 1', () => {
    const result = normalizeTextPlanResult(makeValidInput({ cardCount: -5 }));
    expect(result.cardCount).toBe(1);
  });

  it('accepts cardCount=5 unchanged', () => {
    const result = normalizeTextPlanResult(makeValidInput({ cardCount: 5 }));
    expect(result.cardCount).toBe(5);
  });

  it('truncates styleNotes array to max 8 items', () => {
    const manyNotes = Array.from({ length: 12 }, (_, i) => `note ${i + 1}`);
    const result = normalizeTextPlanResult(makeValidInput({ styleNotes: manyNotes }));
    expect(result.styleNotes).toHaveLength(8);
    expect(result.styleNotes[0]).toBe('note 1');
    expect(result.styleNotes[7]).toBe('note 8');
  });

  it('truncates long title to 200 chars', () => {
    const longTitle = 'A'.repeat(250);
    const result = normalizeTextPlanResult(makeValidInput({ title: longTitle }));
    expect(result.title).toHaveLength(200);
  });

  it('normalizes missing styleNotes to []', () => {
    const result = normalizeTextPlanResult(makeValidInput({ styleNotes: undefined }));
    expect(result.styleNotes).toEqual([]);
  });

  it('normalizes null styleNotes to []', () => {
    const result = normalizeTextPlanResult(makeValidInput({ styleNotes: null }));
    expect(result.styleNotes).toEqual([]);
  });

  it('strips extra fields not in TextPlanResult', () => {
    const result = normalizeTextPlanResult(makeValidInput({ extraField: 'should be gone' }));
    expect(result).not.toHaveProperty('extraField');
  });

  it('throws PROVIDER_INVALID_RESPONSE when title is empty after trim', () => {
    expectInvalidResponse(makeValidInput({ title: '   ' }));
  });

  it('throws PROVIDER_INVALID_RESPONSE when summary is empty after trim', () => {
    expectInvalidResponse(makeValidInput({ summary: '\n\t' }));
  });

  it('throws PROVIDER_INVALID_RESPONSE when body is empty after trim', () => {
    expectInvalidResponse(makeValidInput({ body: '' }));
  });

  it('throws PROVIDER_INVALID_RESPONSE for non-array styleNotes', () => {
    expectInvalidResponse(makeValidInput({ styleNotes: 'not an array' }));
  });

  it('throws PROVIDER_INVALID_RESPONSE for non-finite cardCount (NaN)', () => {
    expectInvalidResponse(makeValidInput({ cardCount: NaN }));
  });

  it('throws PROVIDER_INVALID_RESPONSE for non-numeric cardCount', () => {
    expectInvalidResponse(makeValidInput({ cardCount: 'three' }));
  });

  it('includes provider name in thrown error', () => {
    let caught: unknown;
    try {
      normalizeTextPlanResult(makeValidInput({ title: '   ' }), 'gemini');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AIProviderError);
    expect((caught as AIProviderError).provider).toBe('gemini');
  });
});
