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
  SourceImageInput,
} from '../types.js';
import { AIProviderError } from '../errors.js';
import { extractJsonObjectFromText } from '../json.js';
import { normalizeTextPlanResult } from '../normalization.js';
import { PromptEnhancementResultSchema } from '../schemas.js';
import type { AIProviderObserver } from '../observability.js';
import { NoopAIProviderObserver } from '../observability.js';
import { buildTextPlanPrompt, buildEnhancementPrompt } from '../prompts.js';
import { uint8ArrayToBase64 } from '../base64.js';

export interface OpenAITextProviderConfig {
  apiKey: string;
  /** Text model. Defaults to 'gpt-4o-mini' at the router level if not specified. */
  model: string;
  /** API base URL. Defaults to https://api.openai.com/v1 */
  baseUrl?: string;
  timeoutMs?: number;
  observer?: AIProviderObserver;
  /** Injectable for testing. */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

const ORRA_CHAT_SYSTEM_PROMPT = `You are Orra's creative assistant. Help the user think through their visual content creation. Be brief and conversational. Do not start generating content — wait until the user explicitly asks to create or generate something. Respond in 1-3 sentences.`;

// ---------------------------------------------------------------------------
// JSON schemas for OpenAI Responses API strict structured output
// ---------------------------------------------------------------------------

const TEXT_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    cardCount: { type: 'integer' },
    body: { type: 'string' },
    styleNotes: { type: 'array', items: { type: 'string' } },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          headline: { type: 'string' },
          body: { type: 'string' },
          cta: { type: ['string', 'null'] },
        },
        required: ['headline', 'body', 'cta'],
        additionalProperties: false,
      },
    },
    layoutDirection: { type: ['string', 'null'] },
    visualDirection: { type: ['string', 'null'] },
  },
  required: [
    'title',
    'summary',
    'cardCount',
    'body',
    'styleNotes',
    'cards',
    'layoutDirection',
    'visualDirection',
  ],
  additionalProperties: false,
};

const ENHANCEMENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    enhancedPrompt: { type: 'string' },
    inferredType: { type: 'string', enum: ['single_post', 'carousel', 'generic_visual'] },
    cardCount: { type: ['integer', 'null'] },
  },
  required: ['enhancedPrompt', 'inferredType', 'cardCount'],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Response envelope schemas
// ---------------------------------------------------------------------------

const OpenAITextResponseEnvelopeSchema = z.object({
  output: z
    .array(
      z.object({
        content: z
          .array(z.object({ text: z.string() }))
          .min(1)
          .optional(),
      }),
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null));
}

function mapHttpError(status: number, provider: string): AIProviderError {
  if (status === 429) {
    return new AIProviderError({
      code: 'PROVIDER_HTTP_ERROR',
      provider,
      message: `OpenAI returned HTTP 429`,
      retryable: true,
    });
  }
  if (status === 401 || status === 403) {
    return new AIProviderError({
      code: 'PROVIDER_HTTP_ERROR',
      provider,
      message: `OpenAI returned HTTP ${status}`,
      retryable: false,
    });
  }
  return new AIProviderError({
    code: 'PROVIDER_HTTP_ERROR',
    provider,
    message: `OpenAI returned HTTP ${status}`,
    retryable: status >= 500,
  });
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class OpenAITextProvider implements AIProvider {
  readonly name: AIProviderName = 'openai';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly observer: AIProviderObserver;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: OpenAITextProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.observer = config.observer ?? new NoopAIProviderObserver();
    this.fetchFn = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async planText(input: TextPlanRequest): Promise<TextPlanResult> {
    const prompt = buildTextPlanPrompt(input);
    const t0 = Date.now();

    this.observer.observe({
      provider: 'openai',
      operation: 'planText',
      status: 'started',
      model: this.model,
      promptChars: prompt.length,
    });

    try {
      const rawText = await this.callResponsesApi(prompt, 'text_plan_result', TEXT_PLAN_JSON_SCHEMA);

      const extracted = extractJsonObjectFromText(rawText, 'openai');
      const cleaned = stripNulls(extracted as Record<string, unknown>);
      const result = normalizeTextPlanResult(cleaned, 'openai');

      this.observer.observe({
        provider: 'openai',
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
      this.observer.observe({
        provider: 'openai',
        operation: 'planText',
        status: 'failed',
        durationMs: Date.now() - t0,
        errorCode: err instanceof AIProviderError ? err.code : 'PROVIDER_UNKNOWN',
        retryable: err instanceof AIProviderError ? err.retryable : false,
      });
      throw err;
    }
  }

  async generateImageOrDocument(_input: MockDocumentRequest): Promise<MockDocumentResult> {
    throw new AIProviderError({
      code: 'PROVIDER_UNAVAILABLE',
      provider: 'openai',
      message: 'OpenAITextProvider does not support image generation',
      retryable: false,
    });
  }

  async chat(input: ChatInput): Promise<ChatOutput> {
    const url = `${this.baseUrl}/responses`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: [
            { role: 'system', content: ORRA_CHAT_SYSTEM_PROMPT },
            { role: 'user', content: input.userMessage },
          ],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AIProviderError({
          code: 'PROVIDER_TIMEOUT',
          provider: 'openai',
          message: `OpenAI chat request timed out after ${this.timeoutMs}ms`,
          retryable: true,
        });
      }
      throw new AIProviderError({
        code: 'PROVIDER_HTTP_ERROR',
        provider: 'openai',
        message: `OpenAI chat network error: ${err instanceof Error ? err.message : 'unknown'}`,
        retryable: true,
      });
    }
    clearTimeout(timer);

    if (!response.ok) {
      throw mapHttpError(response.status, 'openai');
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'openai',
        message: 'OpenAI chat response body was not valid JSON',
      });
    }

    const envelope = OpenAITextResponseEnvelopeSchema.safeParse(raw);
    if (!envelope.success) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'openai',
        message: 'OpenAI chat response did not match expected envelope shape',
      });
    }

    const content = envelope.data.output[0].content;
    if (!content || content.length === 0) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'openai',
        message: 'OpenAI chat response output[0].content was missing or empty',
      });
    }

    return { reply: content[0].text };
  }

  async analyzeImage(input: { prompt: string; sourceImages: SourceImageInput[] }): Promise<ChatOutput> {
    if (!input.sourceImages || input.sourceImages.length === 0) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_REQUEST',
        provider: 'openai',
        message: 'analyzeImage requires at least one source image',
      });
    }

    const url = `${this.baseUrl}/responses`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const content: Array<Record<string, unknown>> = input.sourceImages.map((img) => {
      const base64 = uint8ArrayToBase64(img.bytes);
      return {
        type: 'image_url',
        image_url: { url: `data:${img.contentType};base64,${base64}` },
      };
    });
    content.push({ type: 'input_text', text: input.prompt });

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: [{ role: 'user', content }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AIProviderError({
          code: 'PROVIDER_TIMEOUT',
          provider: 'openai',
          message: `OpenAI analyzeImage request timed out after ${this.timeoutMs}ms`,
          retryable: true,
        });
      }
      throw new AIProviderError({
        code: 'PROVIDER_HTTP_ERROR',
        provider: 'openai',
        message: `OpenAI analyzeImage network error: ${err instanceof Error ? err.message : 'unknown'}`,
        retryable: true,
      });
    }
    clearTimeout(timer);

    if (!response.ok) {
      throw mapHttpError(response.status, 'openai');
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'openai',
        message: 'OpenAI analyzeImage response body was not valid JSON',
      });
    }

    const envelope = OpenAITextResponseEnvelopeSchema.safeParse(raw);
    if (!envelope.success) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'openai',
        message: 'OpenAI analyzeImage response did not match expected envelope shape',
      });
    }

    const responseContent = envelope.data.output[0].content;
    if (!responseContent || responseContent.length === 0) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'openai',
        message: 'OpenAI analyzeImage response output[0].content was missing or empty',
      });
    }

    return { reply: responseContent[0].text };
  }

  async enhancePrompt(input: PromptEnhancementInput): Promise<PromptEnhancementOutput> {
    const prompt = buildEnhancementPrompt(input);
    const t0 = Date.now();

    this.observer.observe({
      provider: 'openai',
      operation: 'enhancePrompt',
      status: 'started',
      model: this.model,
      promptChars: prompt.length,
    });

    try {
      const rawText = await this.callResponsesApi(
        prompt,
        'prompt_enhancement_result',
        ENHANCEMENT_JSON_SCHEMA,
      );

      const extracted = extractJsonObjectFromText(rawText, 'openai') as Record<string, unknown>;
      const cleaned = stripNulls(extracted);

      const parsed = PromptEnhancementResultSchema.safeParse(cleaned);
      if (!parsed.success) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'openai',
          message: 'OpenAI enhancement response failed schema validation',
        });
      }

      const result = parsed.data;

      this.observer.observe({
        provider: 'openai',
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
      this.observer.observe({
        provider: 'openai',
        operation: 'enhancePrompt',
        status: 'failed',
        durationMs: Date.now() - t0,
        errorCode: err instanceof AIProviderError ? err.code : 'PROVIDER_UNKNOWN',
        retryable: err instanceof AIProviderError ? err.retryable : false,
      });
      throw err;
    }
  }

  private async callResponsesApi(
    prompt: string,
    schemaName: string,
    schema: object,
  ): Promise<string> {
    const url = `${this.baseUrl}/responses`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: prompt,
          text: {
            format: {
              type: 'json_schema',
              name: schemaName,
              strict: true,
              schema,
            },
          },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AIProviderError({
          code: 'PROVIDER_TIMEOUT',
          provider: 'openai',
          message: `OpenAI request timed out after ${this.timeoutMs}ms`,
          retryable: true,
        });
      }
      throw new AIProviderError({
        code: 'PROVIDER_HTTP_ERROR',
        provider: 'openai',
        message: `OpenAI network error: ${err instanceof Error ? err.message : 'unknown'}`,
        retryable: true,
      });
    }
    clearTimeout(timer);

    if (!response.ok) {
      throw mapHttpError(response.status, 'openai');
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'openai',
        message: 'OpenAI response body was not valid JSON',
      });
    }

    const envelope = OpenAITextResponseEnvelopeSchema.safeParse(raw);
    if (!envelope.success) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'openai',
        message: 'OpenAI response did not match expected envelope shape',
      });
    }

    const content = envelope.data.output[0].content;
    if (!content || content.length === 0) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'openai',
        message: 'OpenAI response output[0].content was missing or empty',
      });
    }

    return content[0].text;
  }
}
