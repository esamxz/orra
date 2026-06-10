import { z } from 'zod';
import type {
  AIProvider,
  AIProviderName,
  TextPlanRequest,
  TextPlanResult,
  ImageGenerationRequest,
  ImageGenerationResult,
} from '../types.js';
import { TextPlanResultSchema } from '../schemas.js';
import { AIProviderError } from '../errors.js';

export interface GeminiTextProviderConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_TIMEOUT_MS = 30_000;

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

export class GeminiTextProvider implements AIProvider {
  readonly name: AIProviderName = 'gemini';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(config: GeminiTextProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async planText(input: TextPlanRequest): Promise<TextPlanResult> {
    const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: this.buildPrompt(input) }] }],
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
      throw new AIProviderError({
        code: 'PROVIDER_HTTP_ERROR',
        provider: 'gemini',
        message: `Gemini returned HTTP ${response.status}`,
        retryable: response.status >= 500,
      });
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

    const text = envelope.data.candidates[0].content.parts[0].text;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'gemini',
        message: 'Gemini text part was not valid JSON',
      });
    }

    const result = TextPlanResultSchema.safeParse(parsed);
    if (!result.success) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: 'gemini',
        message: 'Gemini plan result did not match expected schema',
      });
    }

    return result.data;
  }

  async generateImageOrDocument(_input: ImageGenerationRequest): Promise<ImageGenerationResult> {
    throw new AIProviderError({
      code: 'PROVIDER_UNAVAILABLE',
      provider: 'gemini',
      message: 'GeminiTextProvider does not support image generation',
      retryable: false,
    });
  }

  private buildPrompt(input: TextPlanRequest): string {
    const brandSection = input.brandContext
      ? `Brand tone: ${input.brandContext.tone ?? 'not specified'}\nVisual direction: ${input.brandContext.visualDirection ?? 'not specified'}`
      : 'No brand context.';

    return `You are a visual content planning assistant.
Request: "${input.prompt}"
Project type: ${input.projectType}
Aspect ratio: ${input.ratio.name} (${input.ratio.w}x${input.ratio.h})
${brandSection}

Return a JSON object with exactly these fields:
- title: string (1-200 chars) short topic title
- summary: string one sentence plan summary
- cardCount: integer 1 for post, 2-5 for carousel, max 10
- body: string main body copy for the first card
- styleNotes: array of strings (max 20 items, each max 300 chars) visual style guidance`;
  }
}
