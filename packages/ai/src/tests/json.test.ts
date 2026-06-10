import { describe, it, expect } from 'vitest';
import { extractJsonObjectFromText } from '../json.js';
import { AIProviderError } from '../errors.js';

function expectInvalidResponse(raw: string, provider?: string): void {
  let caught: unknown;
  try {
    extractJsonObjectFromText(raw, provider);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(AIProviderError);
  expect((caught as AIProviderError).code).toBe('PROVIDER_INVALID_RESPONSE');
}

describe('extractJsonObjectFromText', () => {
  it('parses pure JSON object', () => {
    const result = extractJsonObjectFromText('{"title":"hello","cardCount":1}');
    expect(result).toEqual({ title: 'hello', cardCount: 1 });
  });

  it('parses fenced ```json block', () => {
    const result = extractJsonObjectFromText('```json\n{"title":"hello","cardCount":1}\n```');
    expect(result).toEqual({ title: 'hello', cardCount: 1 });
  });

  it('parses generic ``` fenced block', () => {
    const result = extractJsonObjectFromText('```\n{"title":"hello","cardCount":1}\n```');
    expect(result).toEqual({ title: 'hello', cardCount: 1 });
  });

  it('parses JSON with surrounding whitespace', () => {
    const result = extractJsonObjectFromText('  \n  {"title":"hello"}  \n  ');
    expect(result).toEqual({ title: 'hello' });
  });

  it('throws PROVIDER_INVALID_RESPONSE for empty string', () => {
    expectInvalidResponse('');
  });

  it('throws PROVIDER_INVALID_RESPONSE for whitespace-only string', () => {
    expectInvalidResponse('   \n\t  ');
  });

  it('throws PROVIDER_INVALID_RESPONSE for malformed JSON', () => {
    expectInvalidResponse('{title: "no quotes"}');
  });

  it('throws PROVIDER_INVALID_RESPONSE for prose plus unfenced JSON', () => {
    expectInvalidResponse('Here is the JSON: {"title":"hello"}');
  });

  it('throws PROVIDER_INVALID_RESPONSE for JSON with trailing text', () => {
    expectInvalidResponse('{"title":"hello"} and some more text');
  });

  it('throws PROVIDER_INVALID_RESPONSE for two fenced JSON blocks', () => {
    expectInvalidResponse('```json\n{"a":1}\n```\n\n```json\n{"b":2}\n```');
  });

  it('throws PROVIDER_INVALID_RESPONSE for JSON array (not object)', () => {
    expectInvalidResponse('[1, 2, 3]');
  });

  it('throws PROVIDER_INVALID_RESPONSE for JavaScript object syntax', () => {
    expectInvalidResponse('{foo: "bar"}');
  });

  it('throws PROVIDER_INVALID_RESPONSE for null JSON', () => {
    expectInvalidResponse('null');
  });

  it('includes provider name in thrown error', () => {
    let caught: unknown;
    try {
      extractJsonObjectFromText('', 'gemini');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AIProviderError);
    expect((caught as AIProviderError).provider).toBe('gemini');
  });
});
