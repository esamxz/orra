import { AIProviderError } from './errors.js';

export function extractJsonObjectFromText(raw: string, provider = 'unknown'): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Provider returned empty text',
    });
  }

  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  const fenceMatches = [...trimmed.matchAll(fenceRegex)];

  if (fenceMatches.length > 1) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Provider response contained multiple JSON blocks',
    });
  }

  const candidate = fenceMatches.length === 1 ? fenceMatches[0][1].trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Provider response was not valid JSON',
    });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Provider response was not a JSON object',
    });
  }

  return parsed;
}
