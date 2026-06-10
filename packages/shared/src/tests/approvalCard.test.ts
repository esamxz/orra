import { describe, it, expect } from 'vitest';
import { ApprovalCardSchema } from '../schemas.js';

// ---------------------------------------------------------------------------
// Minimal valid card (pre-Phase-14D fields only)
// ---------------------------------------------------------------------------

function makeMinimalCard(overrides: Record<string, unknown> = {}) {
  return {
    summaryLine: 'Ready to create a post about focus.',
    style: 'calm, premium, focused',
    format: '4:5',
    brand: 'No brand selected',
    cta: 'Not set',
    assumptions: ['Using a clean visual direction.'],
    actions: ['approve_and_create', 'cancel'],
    ...overrides,
  };
}

describe('ApprovalCardSchema: backward compatibility', () => {
  it('validates a card with only the original 7 fields', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard());
    expect(result.success).toBe(true);
  });

  it('rejects a card missing summaryLine', () => {
    const { summaryLine: _, ...rest } = makeMinimalCard();
    const result = ApprovalCardSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a card with empty summaryLine', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ summaryLine: '' }));
    expect(result.success).toBe(false);
  });
});

describe('ApprovalCardSchema: Phase 14D optional fields', () => {
  it('accepts cardCount as a positive integer', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ cardCount: 5 }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.cardCount).toBe(5);
  });

  it('accepts cardCount of 1 (minimum)', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ cardCount: 1 }));
    expect(result.success).toBe(true);
  });

  it('rejects cardCount of 0', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ cardCount: 0 }));
    expect(result.success).toBe(false);
  });

  it('rejects cardCount over 50', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ cardCount: 51 }));
    expect(result.success).toBe(false);
  });

  it('rejects non-integer cardCount', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ cardCount: 2.5 }));
    expect(result.success).toBe(false);
  });

  it('accepts visualDirection as a string up to 80 chars', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ visualDirection: 'clean minimal editorial' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visualDirection).toBe('clean minimal editorial');
  });

  it('rejects visualDirection longer than 80 chars', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ visualDirection: 'x'.repeat(81) }));
    expect(result.success).toBe(false);
  });

  it('accepts styleNotes as an array of strings up to 80 chars each', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ styleNotes: ['Keep it minimal.', 'Use brand colors.'] }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.styleNotes).toHaveLength(2);
  });

  it('rejects styleNotes with an item longer than 80 chars', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ styleNotes: ['x'.repeat(81)] }));
    expect(result.success).toBe(false);
  });

  it('rejects styleNotes array with more than 5 items', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ styleNotes: ['a', 'b', 'c', 'd', 'e', 'f'] }));
    expect(result.success).toBe(false);
  });

  it('accepts memorySummary as a string up to 120 chars', () => {
    const summary = 'User is creating content about fitness for LinkedIn audience.';
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ memorySummary: summary }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.memorySummary).toBe(summary);
  });

  it('rejects memorySummary longer than 120 chars', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({ memorySummary: 'x'.repeat(121) }));
    expect(result.success).toBe(false);
  });

  it('accepts a card with all 4 new optional fields', () => {
    const result = ApprovalCardSchema.safeParse(makeMinimalCard({
      cardCount: 5,
      visualDirection: 'clean minimal editorial',
      styleNotes: ['Keep it calm.'],
      memorySummary: 'Project about sleep wellness for Instagram.',
    }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cardCount).toBe(5);
      expect(result.data.visualDirection).toBe('clean minimal editorial');
      expect(result.data.styleNotes).toEqual(['Keep it calm.']);
      expect(result.data.memorySummary).toBe('Project about sleep wellness for Instagram.');
    }
  });
});
