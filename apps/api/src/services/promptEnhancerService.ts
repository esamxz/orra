import { ApiError } from '../errors.js';
import type { EnhancePromptRequest, EnhancePromptResponse } from '@orra/shared';

// ---------------------------------------------------------------------------
// Prompt enhancer service (P0)
// ---------------------------------------------------------------------------
// Deterministic, rule-based. No AI calls. No DB mutations. No side effects.

type InferredType = 'single_post' | 'carousel' | 'generic_visual';

const TONE_KEYWORDS = [
  'professional', 'clean', 'minimal', 'bold', 'playful', 'fun',
  'motivational', 'serious', 'editorial', 'soft', 'raw', 'vibrant',
];

export function enhancePrompt(input: EnhancePromptRequest): EnhancePromptResponse {
  const normalized = input.prompt.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    throw new ApiError('VALIDATION', 'Prompt cannot be empty.');
  }

  const inferredType = detectType(normalized, input.selectedType);
  const cardCount = inferredType === 'carousel' ? extractCardCount(normalized) : undefined;
  const tone = detectTone(normalized);
  const ratioLabel = input.aspectRatio ? `${input.aspectRatio} ` : '';

  const wordCount = normalized.split(/\s+/).length;
  const isDetailed = wordCount > 80;

  let enhancedPrompt: string;
  let notes: string | undefined;

  if (isDetailed) {
    // Already detailed — preserve intent, just normalize
    enhancedPrompt = normalized;
    notes = 'Prompt was already detailed. Whitespace normalized.';
  } else if (inferredType === 'carousel') {
    const count = cardCount ?? 5;
    const topic = extractTopic(normalized);
    enhancedPrompt =
      `Create a ${count}-card carousel about ${topic}. ` +
      `Use a ${tone} tone and clear visual direction. ` +
      `Structure it as: Card 1 hook, middle cards key points, final card takeaway. ` +
      `Keep each card focused, readable, and visually consistent.`;
  } else {
    const topic = extractTopic(normalized);
    enhancedPrompt =
      `Create a ${tone} ${ratioLabel}social post about ${topic}. ` +
      `Use a bold minimal layout with strong visual contrast. ` +
      `Include a strong headline, short supporting text, and a clear focal point. ` +
      `Keep the design clean and focused.`;
  }

  if (input.hasAssets) {
    enhancedPrompt +=
      ' Use the attached image(s) as visual reference or source material.' +
      ' Preserve important details. Do not alter logos or brand marks.';
  }

  if (input.brandSystemId) {
    enhancedPrompt += ' Keep the result consistent with the selected brand guidelines.';
  }

  enhancedPrompt = enhancedPrompt.trim();

  if (!enhancedPrompt) {
    throw new ApiError('INTERNAL', 'Enhancement produced an empty result. Please try again.');
  }

  const result: EnhancePromptResponse = {
    originalPrompt: normalized,
    enhancedPrompt,
    inferredType,
  };

  if (cardCount !== undefined) {
    result.cardCount = cardCount;
  }

  if (notes) {
    result.notes = notes;
  }

  return result;
}

function detectType(normalized: string, selectedType?: string): InferredType {
  if (selectedType === 'single_post') return 'single_post';
  if (selectedType === 'carousel') return 'carousel';
  if (selectedType === 'generic_visual') return 'generic_visual';
  if (/\b(carousel|slides?|cards?)\b/i.test(normalized)) return 'carousel';
  return 'single_post';
}

function extractCardCount(normalized: string): number {
  const match = normalized.match(/\b(\d+)\s*(?:card|slide|page)s?\b/i);
  if (match) {
    const n = parseInt(match[1], 10);
    return Math.min(10, Math.max(2, n));
  }
  return 5;
}

function detectTone(normalized: string): string {
  for (const kw of TONE_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(normalized)) {
      return kw;
    }
  }
  return 'clean, focused';
}

function extractTopic(normalized: string): string {
  const aboutMatch = normalized.match(/\babout\s+(.+?)(?=\s*(?:\.|,|;|$))/i);
  if (aboutMatch) {
    const topic = aboutMatch[1].trim();
    return topic.length > 120 ? topic.slice(0, 120) : topic;
  }

  const stripped = normalized
    .replace(/^(?:create|make|design|build|generate|write|show|craft|produce)\s+/i, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/^(?:\d+[- ]?(?:card|slide|page)s?\s+)?(?:carousel|post|social post|image|visual)\s+/i, '')
    .trim();

  const result = stripped || normalized;
  return result.length > 120 ? result.slice(0, 120) : result;
}
