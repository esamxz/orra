import { describe, it, expect } from 'vitest';
import { buildTextPlanPrompt } from '../prompts.js';
import type { TextPlanRequest } from '../types.js';
import type { BrandContextDto } from '@orra/shared';

function baseRequest(overrides: Partial<TextPlanRequest> = {}): TextPlanRequest {
  return {
    projectId: 'proj-1',
    prompt: 'create a post about discipline',
    projectType: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    brandContext: null,
    ...overrides,
  };
}

function oraBrand(overrides: Partial<BrandContextDto> = {}): BrandContextDto {
  return {
    brandSystemId: 'brand-1',
    name: 'Orra',
    description: 'AI-native, chat-first visual creation app for posts and carousels.',
    tone: 'calm, premium',
    visualDirection: 'minimal dark',
    colors: {
      primary: '#1d2a30',
      secondary: '#354e53',
      accent: '#5e7680',
      background: '#0d1a1f',
      text: '#c8d1d8',
    },
    rules: 'Never use bright neon colors. Keep copy concise.',
    ...overrides,
  };
}

describe('buildTextPlanPrompt', () => {
  it('includes the user prompt verbatim', () => {
    const prompt = buildTextPlanPrompt(baseRequest({ prompt: 'create a post about stoicism' }));
    expect(prompt).toContain('create a post about stoicism');
  });

  it('produces a valid prompt with no brand context', () => {
    const prompt = buildTextPlanPrompt(baseRequest());
    expect(prompt).toBeTruthy();
    expect(prompt).toContain('visual content planning assistant');
    expect(prompt).not.toContain('Brand context:');
  });

  it('includes brand name in the prompt when brandContext is set', () => {
    const prompt = buildTextPlanPrompt(baseRequest({ brandContext: oraBrand() }));
    expect(prompt).toContain('Orra');
  });

  it('includes brand description in the prompt', () => {
    const prompt = buildTextPlanPrompt(baseRequest({ brandContext: oraBrand() }));
    expect(prompt).toContain('AI-native, chat-first visual creation app for posts and carousels.');
  });

  it('includes brand tone of voice', () => {
    const prompt = buildTextPlanPrompt(baseRequest({ brandContext: oraBrand() }));
    expect(prompt).toContain('calm, premium');
  });

  it('includes brand visual direction', () => {
    const prompt = buildTextPlanPrompt(baseRequest({ brandContext: oraBrand() }));
    expect(prompt).toContain('minimal dark');
  });

  it('includes brand rules (truncated to 300 chars)', () => {
    const longRules = 'A'.repeat(400);
    const prompt = buildTextPlanPrompt(baseRequest({ brandContext: oraBrand({ rules: longRules }) }));
    const truncated = longRules.slice(0, 300);
    expect(prompt).toContain(truncated);
    expect(prompt).not.toContain(longRules);
  });

  it('includes anti-hallucination grounding instruction with brand name', () => {
    const prompt = buildTextPlanPrompt(baseRequest({ brandContext: oraBrand() }));
    expect(prompt).toMatch(/do not invent an? unrelated/i);
    expect(prompt).toContain('Orra');
  });

  it('omits description block when brand has no description', () => {
    const brand = oraBrand({ description: undefined });
    const prompt = buildTextPlanPrompt(baseRequest({ brandContext: brand }));
    expect(prompt).toContain('Orra');
    expect(prompt).not.toContain('Brand description:');
  });

  it('regression: "Orra" brand + "create a post about Orra" grounded in brand identity', () => {
    // Before this fix, the AI received only tone/visualDirection and invented an unrelated
    // business (e.g. jewelry store) when the user asked about "Orra."
    const prompt = buildTextPlanPrompt(baseRequest({
      prompt: 'create a post about Orra',
      brandContext: oraBrand(),
    }));

    // Prompt must carry brand name, identity description, and the disambiguation instruction.
    expect(prompt).toContain('Orra');
    expect(prompt).toContain('AI-native, chat-first visual creation app for posts and carousels.');
    expect(prompt).toMatch(/do not invent an? unrelated/i);
    expect(prompt).toContain('create a post about Orra');
  });
});
