import { z } from 'zod';
import type {
  AIProvider,
  AIProviderName,
  TextPlanRequest,
  TextPlanResult,
  MockDocumentRequest,
  MockDocumentResult,
  PromptEnhancementInput,
  PromptEnhancementOutput,
  ChatInput,
  ChatOutput,
} from '../types.js';
import { AIProviderError } from '../errors.js';
import { extractJsonObjectFromText } from '../json.js';
import { normalizeTextPlanResult } from '../normalization.js';
import { PromptEnhancementResultSchema } from '../schemas.js';
import type { AIProviderObserver } from '../observability.js';
import { NoopAIProviderObserver } from '../observability.js';
import { buildTextPlanPrompt, buildEnhancementPrompt } from '../prompts.js';

export interface GeminiTextProviderConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  baseUrl?: string;
  observer?: AIProviderObserver;
  /** Injectable for testing — matches the pattern from D6.2.1 fix. */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_TIMEOUT_MS = 30_000;

const ORRA_CHAT_SYSTEM_PROMPT = `You are Orra's creative assistant. Help the user think through their visual content creation. Be brief and conversational. Do not start generating content — wait until the user explicitly asks to create or generate something. Respond in 1-3 sentences.`;

const GeminiEnvelopeSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string() })),
        }),
      }),
    )
    .min(1),
});

// Maps Gemini HTTP status codes to typed AIProviderError codes.
// Keeps provider errors actionable without leaking API key or raw response body.
function mapGeminiHttpError(status: number): AIProviderError {
  if (status === 401 || status === 403) {
    return new AIProviderError({
      code: 'PROVIDER_AUTH_FAILED',
      provider: 'gemini',
      message: `Gemini returned HTTP ${status} — check GEMINI_API_KEY`,
      retryable: false,
    });
  }
  if (status === 404) {
    return new AIProviderError({
      code: 'PROVIDER_NOT_FOUND',
      provider: 'gemini',
      message: `Gemini returned HTTP 404 — check GEMINI_TEXT_MODEL`,
      retryable: false,
    });
  }
  if (status === 429) {
    return new AIProviderError({
      code: 'PROVIDER_RATE_LIMITED',
      provider: 'gemini',
      message: `Gemini returned HTTP 429 — rate limited`,
      retryable: true,
    });
  }
  return new AIProviderError({
    code: 'PROVIDER_HTTP_ERROR',
    provider: 'gemini',
    message: `Gemini returned HTTP ${status}`,
    retryable: status >= 500,
  });
}

export class GeminiTextProvider implements AIProvider {
  readonly name: AIProviderName = 'gemini';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly observer: AIProviderObserver;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: GeminiTextProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.observer = config.observer ?? new NoopAIProviderObserver();
    // Use wrapper so globalThis.fetch is resolved at call time, not construction
    // time. This is required for Cloudflare Workers fetch binding compatibility.
    this.fetchFn = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async planText(input: TextPlanRequest): Promise<TextPlanResult> {
    const prompt = buildTextPlanPrompt(input);
    const t0 = Date.now();

    this.observer.observe({
      provider: 'gemini',
      operation: 'planText',
      status: 'started',
      model: this.model,
      promptChars: prompt.length,
    });

    const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new AIProviderError({
            code: 'PROVIDER_TIMEOUT',
            provider: 'gemini',
            message: `Gemini request timed out after ${this.timeoutMs}ms`,
            retryable: true,
          });
        }
        throw new AIProviderError({
          code: 'PROVIDER_HTTP_ERROR',
          provider: 'gemini',
          message: `Gemini network error: ${err instanceof Error ? err.message : 'unknown'}`,
          retryable: true,
        });
      }
      clearTimeout(timer);

      if (!response.ok) {
        throw mapGeminiHttpError(response.status);
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini response body was not valid JSON',
        });
      }

      const envelope = GeminiEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini response did not match expected envelope shape',
        });
      }

      const rawText = envelope.data.candidates[0].content.parts[0].text;

      const extracted = extractJsonObjectFromText(rawText, 'gemini');
      const result = normalizeTextPlanResult(extracted, 'gemini');

      this.observer.observe({
        provider: 'gemini',
        operation: 'planText',
        status: 'succeeded',
        durationMs: Date.now() - t0,
        model: this.model,
        promptChars: prompt.length,
        responseChars: rawText.length,
        normalizedCardCount: result.cardCount,
        layoutDirection: result.layoutDirection,
        visualDirection: result.visualDirection,
      });

      return result;

    } catch (err) {
      const durationMs = Date.now() - t0;
      this.observer.observe({
        provider: 'gemini',
        operation: 'planText',
        status: 'failed',
        durationMs,
        errorCode: err instanceof AIProviderError ? err.code : 'PROVIDER_UNKNOWN',
        retryable: err instanceof AIProviderError ? err.retryable : false,
      });
      throw err;
    }
  }

  async generateImageOrDocument(_input: MockDocumentRequest): Promise<MockDocumentResult> {
    throw new AIProviderError({
      code: 'PROVIDER_UNAVAILABLE',
      provider: 'gemini',
      message: 'GeminiTextProvider does not support image generation',
      retryable: false,
    });
  }

  async chat(input: ChatInput): Promise<ChatOutput> {
    const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: ORRA_CHAT_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: input.userMessage }] }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AIProviderError({
          code: 'PROVIDER_TIMEOUT',
          provider: 'gemini',
          message: `Gemini chat request timed out after ${this.timeoutMs}ms`,
          retryable: true,
        });
      }
      throw new AIProviderError({
        code: 'PROVIDER_HTTP_ERROR',
        provider: 'gemini',
        message: `Gemini chat network error: ${err instanceof Error ? err.message : 'unknown'}`,
        retryable: true,
      });
    }
    clearTimeout(timer);

    if (!response.ok) {
      throw mapGeminiHttpError(response.status);
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'gemini',
        message: 'Gemini chat response body was not valid JSON',
      });
    }

    const envelope = GeminiEnvelopeSchema.safeParse(raw);
    if (!envelope.success) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'gemini',
        message: 'Gemini chat response did not match expected envelope shape',
      });
    }

    return { reply: envelope.data.candidates[0].content.parts[0].text };
  }

  async enhancePrompt(input: PromptEnhancementInput): Promise<PromptEnhancementOutput> {
    const prompt = buildEnhancementPrompt(input);
    const t0 = Date.now();

    this.observer.observe({
      provider: 'gemini',
      operation: 'enhancePrompt',
      status: 'started',
      model: this.model,
      promptChars: prompt.length,
    });

    const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new AIProviderError({
            code: 'PROVIDER_TIMEOUT',
            provider: 'gemini',
            message: `Gemini request timed out after ${this.timeoutMs}ms`,
            retryable: true,
          });
        }
        throw new AIProviderError({
          code: 'PROVIDER_HTTP_ERROR',
          provider: 'gemini',
          message: `Gemini network error: ${err instanceof Error ? err.message : 'unknown'}`,
          retryable: true,
        });
      }
      clearTimeout(timer);

      if (!response.ok) {
        throw mapGeminiHttpError(response.status);
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini response body was not valid JSON',
        });
      }

      const envelope = GeminiEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini response did not match expected envelope shape',
        });
      }

      const rawText = envelope.data.candidates[0].content.parts[0].text;
      const extracted = extractJsonObjectFromText(rawText, 'gemini');

      const parsed = PromptEnhancementResultSchema.safeParse(extracted);
      if (!parsed.success) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini enhancement response failed schema validation',
        });
      }

      const result = parsed.data;

      this.observer.observe({
        provider: 'gemini',
        operation: 'enhancePrompt',
        status: 'succeeded',
        durationMs: Date.now() - t0,
        model: this.model,
        promptChars: prompt.length,
        responseChars: rawText.length,
      });

      return {
        enhancedPrompt: result.enhancedPrompt,
        inferredType: result.inferredType,
        ...(result.cardCount !== undefined ? { cardCount: result.cardCount } : {}),
      };
    } catch (err) {
      const durationMs = Date.now() - t0;
      this.observer.observe({
        provider: 'gemini',
        operation: 'enhancePrompt',
        status: 'failed',
        durationMs,
        errorCode: err instanceof AIProviderError ? err.code : 'PROVIDER_UNKNOWN',
        retryable: err instanceof AIProviderError ? err.retryable : false,
      });
      throw err;
    }
  }

}
