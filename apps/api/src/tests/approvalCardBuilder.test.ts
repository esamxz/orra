import { describe, it, expect } from 'vitest';
import { buildApprovalCard } from '../services/approvalCardBuilder.js';
import type { DirectorIntentResult } from '../services/directorIntentService.js';

function makeGenerationIntent(opts: Partial<DirectorIntentResult['generationHint']> = {}): DirectorIntentResult {
  return {
    mode: 'generation',
    confidence: 'high',
    reason: 'Detected clear creation intent.',
    generationHint: {
      artifactType: opts.artifactType ?? 'post',
      requestedCardCount: opts.requestedCardCount,
      rawTopic: opts.rawTopic ?? 'focus',
    },
  };
}


describe('buildApprovalCard', () => {
  it('builds carousel summary from 5-card generation hint', () => {
    const intent = makeGenerationIntent({
      artifactType: 'carousel',
      requestedCardCount: 5,
      rawTopic: 'self-improvement',
    });

    const card = buildApprovalCard({
      content: 'Create a 5-card carousel about self-improvement',
      intent,
      projectType: 'carousel',
      ratioName: '4:5',
    });

    expect(card.summaryLine).toBe('Ready to create a 5-card carousel about self-improvement.');
    expect(card.format).toBe('4:5');
    expect(card.actions).toContain('approve_and_create');
    expect(card.actions).toContain('add_cta');
    expect(card.actions).toContain('edit_direction');
    expect(card.actions).toContain('cancel');
  });

  it('builds post summary from post hint', () => {
    const intent = makeGenerationIntent({
      artifactType: 'post',
      rawTopic: 'morning routines',
    });

    const card = buildApprovalCard({
      content: 'Make a post about morning routines',
      intent,
      projectType: 'post',
      ratioName: '1:1',
    });

    expect(card.summaryLine).toBe('Ready to create a post about morning routines.');
    expect(card.format).toBe('1:1');
  });

  it('uses project ratio in format', () => {
    const intent = makeGenerationIntent({ rawTopic: 'focus' });

    const card9x16 = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '9:16',
    });
    expect(card9x16.format).toBe('9:16');

    const card16x9 = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '16:9',
    });
    expect(card16x9.format).toBe('16:9');
  });

  it('brand text shows brand name when brandContext is provided', () => {
    const intent = makeGenerationIntent();

    const withoutBrand = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      brandContext: null,
    });
    expect(withoutBrand.brand).toBe('No brand selected');
    expect(withoutBrand.assumptions).toContain("Using Orra's default creative direction.");

    const withBrand = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      brandContext: {
        brandSystemId: 'brand-123',
        name: 'Serene Studio',
      },
    });
    expect(withBrand.brand).toBe('Serene Studio');
    expect(withBrand.assumptions).toContain('Using your selected brand direction.');
  });

  it('brand tone and visual direction influence assumptions when provided', () => {
    const intent = makeGenerationIntent();

    const withBrand = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      brandContext: {
        brandSystemId: 'brand-123',
        name: 'Serene Studio',
        tone: 'Calm, reassuring, quietly confident.',
        visualDirection: 'Soft natural light, muted earth tones.',
      },
    });

    expect(withBrand.brand).toBe('Serene Studio');
    expect(withBrand.assumptions).toContain('Using your selected brand direction.');
    expect(withBrand.assumptions.some((a) => a.includes('Tone:'))).toBe(true);
  });

  it('no-brand project does not fail when brandContext is omitted', () => {
    const intent = makeGenerationIntent();

    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
    });

    expect(card.brand).toBe('No brand selected');
    expect(card.assumptions).toContain("Using Orra's default creative direction.");
  });

  it('CTA defaults to Not set', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
    });
    expect(card.cta).toBe('Not set');
  });

  it('actions include approve_and_create, add_cta, edit_direction, cancel', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
    });
    expect(card.actions).toEqual([
      'approve_and_create',
      'add_cta',
      'edit_direction',
      'cancel',
    ]);
  });

  it('copy avoids technical fields like model, prompt, token, provider', () => {
    const intent = makeGenerationIntent({ rawTopic: 'focus' });
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
    });

    const json = JSON.stringify(card).toLowerCase();
    expect(json).not.toContain('model');
    expect(json).not.toContain('prompt');
    expect(json).not.toContain('token');
    expect(json).not.toContain('provider');
    expect(json).not.toContain('layer');
    expect(json).not.toContain('flux');
    expect(json).not.toContain('gemini');
    expect(json).not.toContain('gpt');
  });

  it('uses project name as topic fallback when rawTopic is empty', () => {
    const intent: DirectorIntentResult = {
      mode: 'generation',
      confidence: 'high',
      reason: 'Detected creation intent.',
      generationHint: { artifactType: 'post' },
    };

    const card = buildApprovalCard({
      content: 'Make a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      projectName: 'My Cool Project',
    });

    expect(card.summaryLine).toContain('My Cool Project');
  });

  it('uses generic fallback when no topic and no project name', () => {
    const intent: DirectorIntentResult = {
      mode: 'generation',
      confidence: 'high',
      reason: 'Detected creation intent.',
      generationHint: { artifactType: 'post' },
    };

    const card = buildApprovalCard({
      content: 'Make a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
    });

    expect(card.summaryLine).toContain('your topic');
  });
});

// ---------------------------------------------------------------------------
// Phase 14D: direction hints (cardCount, visualDirection, styleNotes, memorySummary)
// ---------------------------------------------------------------------------

describe('buildApprovalCard: Phase 14D direction hints', () => {
  it('cardCount is set from requestedCardCount in intent hint', () => {
    const intent = makeGenerationIntent({ artifactType: 'carousel', requestedCardCount: 7, rawTopic: 'finance' });
    const card = buildApprovalCard({ content: 'Make 7 finance cards', intent, projectType: 'carousel', ratioName: '4:5' });
    expect(card.cardCount).toBe(7);
  });

  it('cardCount is undefined when intent has no requestedCardCount', () => {
    const intent = makeGenerationIntent({ artifactType: 'post', rawTopic: 'focus' });
    const card = buildApprovalCard({ content: 'Create a post', intent, projectType: 'post', ratioName: '4:5' });
    expect(card.cardCount).toBeUndefined();
  });

  it('visualDirection is set from brandContext.visualDirection', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      brandContext: { brandSystemId: 'b-1', name: 'Studio', visualDirection: 'soft natural light, muted earth tones' },
    });
    expect(card.visualDirection).toBe('soft natural light, muted earth tones');
  });

  it('visualDirection is undefined when brandContext has no visualDirection', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      brandContext: { brandSystemId: 'b-1', name: 'Studio' },
    });
    expect(card.visualDirection).toBeUndefined();
  });

  it('visualDirection is undefined when no brand context', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({ content: 'Create a post', intent, projectType: 'post', ratioName: '4:5' });
    expect(card.visualDirection).toBeUndefined();
  });

  it('visualDirection is sliced to 80 chars if longer', () => {
    const intent = makeGenerationIntent();
    const longDirection = 'x'.repeat(100);
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      brandContext: { brandSystemId: 'b-1', name: 'Studio', visualDirection: longDirection },
    });
    expect(card.visualDirection).toHaveLength(80);
  });

  it('styleNotes is a one-item array from brandContext.rules when set', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      brandContext: { brandSystemId: 'b-1', name: 'Studio', rules: 'Keep backgrounds clean and minimal.' },
    });
    expect(card.styleNotes).toEqual(['Keep backgrounds clean and minimal.']);
  });

  it('styleNotes is undefined when brandContext.rules is null', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      brandContext: { brandSystemId: 'b-1', name: 'Studio', rules: null },
    });
    expect(card.styleNotes).toBeUndefined();
  });

  it('styleNotes is undefined when no brand context', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({ content: 'Create a post', intent, projectType: 'post', ratioName: '4:5' });
    expect(card.styleNotes).toBeUndefined();
  });

  it('memorySummary is set from input.memorySummary', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      memorySummary: 'User focuses on wellness content for Instagram.',
    });
    expect(card.memorySummary).toBe('User focuses on wellness content for Instagram.');
  });

  it('memorySummary is undefined when not provided', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({ content: 'Create a post', intent, projectType: 'post', ratioName: '4:5' });
    expect(card.memorySummary).toBeUndefined();
  });

  it('memorySummary is truncated to 120 chars if longer', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      memorySummary: 'x'.repeat(200),
    });
    expect(card.memorySummary).toHaveLength(120);
  });

  it('no-brand card has no visualDirection or styleNotes', () => {
    const intent = makeGenerationIntent();
    const card = buildApprovalCard({
      content: 'Create a post',
      intent,
      projectType: 'post',
      ratioName: '4:5',
      brandContext: null,
    });
    expect(card.visualDirection).toBeUndefined();
    expect(card.styleNotes).toBeUndefined();
  });
});
