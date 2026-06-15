import { z } from 'zod';
import type { ImageProvider, ImageGenerationRequest, ImageGenerationResult } from '../imageTypes.js';
import { AIProviderError } from '../errors.js';
import type { AIProviderObserver } from '../observability.js';
import { NoopAIProviderObserver } from '../observability.js';
import { base64ToUint8Array } from '../base64.js';

export interface OpenAIImageProviderConfig {
  apiKey: string;
  /** Image model — REQUIRED. Set via OPENAI_IMAGE_MODEL env var. Recommended: gpt-image-2. */
  model: string;
  /** API base URL. Defaults to https://api.openai.com/v1 */
  baseUrl?: string;
  timeoutMs?: number;
  observer?: AIProviderObserver;
  /** Injectable for testing. */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Response envelope: Responses API with image_generation tool
//
// POST /v1/responses
// { "model": "...", "input": "...", "tools": [{"type":"image_generation"}] }
//
// Response output entries where type === "image_generation_call" hold the
// base64-encoded image in the "result" field.
// ---------------------------------------------------------------------------

const OpenAIImageResponseEnvelopeSchema = z.object({
  output: z
    .array(
      z.object({
        type: z.string(),
        status: z.string().optional(),
        result: z.string().optional(),
      }),
    )
    .min(1),
});

export class OpenAIImageProvider implements ImageProvider {
  readonly id = 'openai';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly observer: AIProviderObserver;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: OpenAIImageProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.observer = config.observer ?? new NoopAIProviderObserver();
    this.fetchFn = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (!request.prompt?.trim()) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_REQUEST',
        provider: 'openai',
        message: 'Prompt must not be empty',
      });
    }

    const t0 = Date.now();

    this.observer.observe({
      provider: 'openai',
      operation: 'generateImage',
      status: 'started',
      model: this.model,
      requestWidth: request.width,
      requestHeight: request.height,
    });

    const url = `${this.baseUrl}/responses`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
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
            input: request.prompt,
            tools: [{ type: 'image_generation' }],
          }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new AIProviderError({
            code: 'PROVIDER_TIMEOUT',
            provider: 'openai',
            message: `OpenAI image request timed out after ${this.timeoutMs}ms`,
            retryable: true,
          });
        }
        throw new AIProviderError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'openai',
          message: `OpenAI image network error: ${err instanceof Error ? err.message : 'unknown'}`,
          retryable: true,
        });
      }
      clearTimeout(timer);

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new AIProviderError({
          code: 'PROVIDER_HTTP_ERROR',
          provider: 'openai',
          message: `OpenAI image returned HTTP ${response.status}`,
          retryable,
        });
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'openai',
          message: 'OpenAI image response body was not valid JSON',
        });
      }

      const envelope = OpenAIImageResponseEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'openai',
          message: 'OpenAI image response did not match expected envelope shape',
        });
      }

      const imageEntry = envelope.data.output.find(
        (item) => item.type === 'image_generation_call' && item.result,
      );

      if (!imageEntry?.result) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'openai',
          message: 'OpenAI image response contained no image_generation_call result',
        });
      }

      const imageBytes = base64ToUint8Array(imageEntry.result, 'openai');

      const result: ImageGenerationResult = {
        provider: 'openai',
        model: this.model,
        mimeType: 'image/png',
        width: request.width,
        height: request.height,
        data: imageBytes,
      };

      this.observer.observe({
        provider: 'openai',
        operation: 'generateImage',
        status: 'succeeded',
        durationMs: Date.now() - t0,
        model: this.model,
        requestWidth: request.width,
        requestHeight: request.height,
      });

      return result;
    } catch (err) {
      this.observer.observe({
        provider: 'openai',
        operation: 'generateImage',
        status: 'failed',
        durationMs: Date.now() - t0,
        errorCode: err instanceof AIProviderError ? err.code : 'PROVIDER_UNKNOWN',
        retryable: err instanceof AIProviderError ? err.retryable : false,
      });
      throw err;
    }
  }
}
