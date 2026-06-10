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

// ---------------------------------------------------------------------------
// Phase 14A: cards and direction fields
// ---------------------------------------------------------------------------

describe('normalizeTextPlanResult — Phase 14A: cards and direction fields', () => {
  function expectInvalidResponse(input: unknown) {
    let caught: unknown;
    try {
      normalizeTextPlanResult(input);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AIProviderError);
    expect((caught as AIProviderError).code).toBe('PROVIDER_INVALID_RESPONSE');
  }

  it('valid cards array round-trips', () => {
    const result = normalizeTextPlanResult(
      makeValidInput({
        cards: [{ headline: 'H1', body: 'B1', cta: 'CTA' }, { headline: 'H2', body: 'B2' }],
      })
    );
    expect(result.cards).toHaveLength(2);
    expect(result.cards![0].headline).toBe('H1');
    expect(result.cards![0].body).toBe('B1');
    expect(result.cards![0].cta).toBe('CTA');
    expect(result.cards![1].cta).toBeUndefined();
  });

  it('trims whitespace in card headline, body, and cta', () => {
    const result = normalizeTextPlanResult(
      makeValidInput({
        cards: [{ headline: '  Headline  ', body: '  Body  ', cta: '  CTA  ' }],
      })
    );
    expect(result.cards![0].headline).toBe('Headline');
    expect(result.cards![0].body).toBe('Body');
    expect(result.cards![0].cta).toBe('CTA');
  });

  it('skips cards with empty headline after trim', () => {
    const result = normalizeTextPlanResult(
      makeValidInput({
        cards: [
          { headline: '   ', body: 'Valid body' },
          { headline: 'Valid', body: 'Also valid' },
        ],
      })
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards![0].headline).toBe('Valid');
  });

  it('skips cards with empty body after trim', () => {
    const result = normalizeTextPlanResult(
      makeValidInput({
        cards: [
          { headline: 'Valid', body: '   ' },
          { headline: 'Also valid', body: 'Good body' },
        ],
      })
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards![0].headline).toBe('Also valid');
  });

  it('truncates card headline to 200 chars', () => {
    const long = 'A'.repeat(300);
    const result = normalizeTextPlanResult(
      makeValidInput({ cards: [{ headline: long, body: 'body' }] })
    );
    expect(result.cards![0].headline).toHaveLength(200);
  });

  it('truncates card body to 2000 chars', () => {
    const long = 'B'.repeat(3000);
    const result = normalizeTextPlanResult(
      makeValidInput({ cards: [{ headline: 'h', body: long }] })
    );
    expect(result.cards![0].body).toHaveLength(2000);
  });

  it('truncates card cta to 100 chars', () => {
    const long = 'C'.repeat(200);
    const result = normalizeTextPlanResult(
      makeValidInput({ cards: [{ headline: 'h', body: 'b', cta: long }] })
    );
    expect(result.cards![0].cta).toHaveLength(100);
  });

  it('clamps cards array to 10 entries', () => {
    const manyCards = Array.from({ length: 15 }, (_, i) => ({
      headline: `H${i}`,
      body: `B${i}`,
    }));
    const result = normalizeTextPlanResult(makeValidInput({ cards: manyCards }));
    expect(result.cards).toHaveLength(10);
  });

  it('returns undefined cards when field is absent', () => {
    const result = normalizeTextPlanResult(makeValidInput());
    expect(result.cards).toBeUndefined();
  });

  it('returns undefined cards when field is null', () => {
    const result = normalizeTextPlanResult(makeValidInput({ cards: null }));
    expect(result.cards).toBeUndefined();
  });

  it('throws PROVIDER_INVALID_RESPONSE when cards is a non-array value', () => {
    expectInvalidResponse(makeValidInput({ cards: 'not an array' }));
  });

  it('returns undefined cards when all entries are invalid objects', () => {
    const result = normalizeTextPlanResult(
      makeValidInput({
        cards: [
          { headline: '   ', body: '   ' },
          { headline: '   ', body: 'valid but headline empty' },
        ],
      })
    );
    expect(result.cards).toBeUndefined();
  });

  it('normalizes layoutDirection — trims and truncates to 200 chars', () => {
    const long = 'L'.repeat(300);
    const result = normalizeTextPlanResult(makeValidInput({ layoutDirection: `  ${long}  ` }));
    expect(result.layoutDirection).toHaveLength(200);
  });

  it('returns undefined layoutDirection when absent', () => {
    const result = normalizeTextPlanResult(makeValidInput());
    expect(result.layoutDirection).toBeUndefined();
  });

  it('returns undefined layoutDirection when empty after trim', () => {
    const result = normalizeTextPlanResult(makeValidInput({ layoutDirection: '   ' }));
    expect(result.layoutDirection).toBeUndefined();
  });

  it('normalizes visualDirection — trims and truncates to 200 chars', () => {
    const long = 'V'.repeat(300);
    const result = normalizeTextPlanResult(makeValidInput({ visualDirection: `  ${long}  ` }));
    expect(result.visualDirection).toHaveLength(200);
  });

  it('returns undefined visualDirection when absent', () => {
    const result = normalizeTextPlanResult(makeValidInput());
    expect(result.visualDirection).toBeUndefined();
  });

  it('returns undefined visualDirection when empty after trim', () => {
    const result = normalizeTextPlanResult(makeValidInput({ visualDirection: '' }));
    expect(result.visualDirection).toBeUndefined();
  });

  it('full object with all new fields passes schema validation', () => {
    const result = normalizeTextPlanResult(
      makeValidInput({
        cards: [{ headline: 'H', body: 'B', cta: 'CTA' }],
        layoutDirection: 'full-bleed',
        visualDirection: 'minimal',
      })
    );
    expect(result.cards).toHaveLength(1);
    expect(result.layoutDirection).toBe('full-bleed');
    expect(result.visualDirection).toBe('minimal');
  });
});
