import { AIProviderError } from './errors.js';
import { TextPlanResultSchema } from './schemas.js';
import type { TextPlanResult } from './types.js';

const MAX_TITLE_LEN = 200;
const MAX_SUMMARY_LEN = 2000;
const MAX_BODY_LEN = 5000;
const MAX_STYLE_NOTE_LEN = 300;
const MAX_STYLE_NOTES = 8;
const MIN_CARD_COUNT = 1;
const MAX_CARD_COUNT = 10;

export function normalizeTextPlanResult(input: unknown, provider = 'unknown'): TextPlanResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Plan result is not an object',
    });
  }

  const obj = input as Record<string, unknown>;

  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const body = typeof obj.body === 'string' ? obj.body.trim() : '';

  if (!title) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Plan title is missing or empty after trim',
    });
  }
  if (!summary) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Plan summary is missing or empty after trim',
    });
  }
  if (!body) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Plan body is missing or empty after trim',
    });
  }

  if (typeof obj.cardCount !== 'number' || !isFinite(obj.cardCount)) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Plan cardCount must be a finite number',
    });
  }
  const cardCount = Math.max(MIN_CARD_COUNT, Math.min(MAX_CARD_COUNT, Math.floor(obj.cardCount)));

  let styleNotes: string[];
  if (obj.styleNotes == null) {
    styleNotes = [];
  } else if (!Array.isArray(obj.styleNotes)) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Plan styleNotes must be an array',
    });
  } else {
    styleNotes = (obj.styleNotes as unknown[])
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter((n) => n.length > 0)
      .slice(0, MAX_STYLE_NOTES)
      .map((n) => n.slice(0, MAX_STYLE_NOTE_LEN));
  }

  const normalized = {
    title: title.slice(0, MAX_TITLE_LEN),
    summary: summary.slice(0, MAX_SUMMARY_LEN),
    cardCount,
    body: body.slice(0, MAX_BODY_LEN),
    styleNotes,
  };

  const result = TextPlanResultSchema.safeParse(normalized);
  if (!result.success) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Normalized plan result did not pass schema validation',
    });
  }

  return result.data;
}
