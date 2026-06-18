import { z } from 'zod';
import type { ImageProvider, ImageGenerationRequest, ImageGenerationResult, ImageEditRequest } from '../imageTypes.js';
import { AIProviderError } from '../errors.js';
import type { AIProviderObserver } from '../observability.js';
import { NoopAIProviderObserver } from '../observability.js';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../base64.js';

export interface GeminiImageProviderConfig {
  apiKey: string;
  /** Image model name. Defaults to 'gemini-2.5-flash-image'. */
  model?: string;
  /** API base URL. Defaults to https://generativelanguage.googleapis.com */
  baseUrl?: string;
  timeoutMs?: number;
  observer?: AIProviderObserver;
  /** Injectable for testing. */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_TIMEOUT_MS = 60_000;

const GeminiImageEnvelopeSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(
            z.object({
              inlineData: z
                .object({
                  mimeType: z.string(),
                  data: z.string(),
                })
                .optional(),
            }),
          ),
        }),
      }),
    )
    .min(1),
});

export class GeminiImageProvider implements ImageProvider {
  readonly id = 'gemini';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly observer: AIProviderObserver;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: GeminiImageProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_GEMINI_IMAGE_MODEL;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.observer = config.observer ?? new NoopAIProviderObserver();
    this.fetchFn = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (!request.prompt?.trim()) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_REQUEST',
        provider: 'gemini',
        message: 'Prompt must not be empty',
      });
    }

    const t0 = Date.now();

    this.observer.observe({
      provider: 'gemini',
      operation: 'generateImage',
      status: 'started',
      model: this.model,
      requestWidth: request.width,
      requestHeight: request.height,
    });

    const url = `${this.baseUrl}/v1/models/${this.model}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: request.prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new AIProviderError({
            code: 'PROVIDER_TIMEOUT',
            provider: 'gemini',
            message: `Gemini image request timed out after ${this.timeoutMs}ms`,
            retryable: true,
          });
        }
        throw new AIProviderError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'gemini',
          message: `Gemini image network error: ${err instanceof Error ? err.message : 'unknown'}`,
          retryable: true,
        });
      }
      clearTimeout(timer);

      if (!response.ok) {
        throw new AIProviderError({
          code: 'PROVIDER_HTTP_ERROR',
          provider: 'gemini',
          message: `Gemini image returned HTTP ${response.status}`,
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
          message: 'Gemini image response body was not valid JSON',
        });
      }

      const envelope = GeminiImageEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini image response did not match expected envelope shape',
        });
      }

      const parts = envelope.data.candidates[0].content.parts;
      const imagePart = parts.find((p) => p.inlineData);
      if (!imagePart?.inlineData) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini image response contained no image data',
        });
      }

      const { mimeType, data: base64Data } = imagePart.inlineData;
      const imageBytes = base64ToUint8Array(base64Data, 'gemini');

      const result: ImageGenerationResult = {
        provider: 'gemini',
        model: this.model,
        mimeType,
        width: request.width,
        height: request.height,
        data: imageBytes,
      };

      this.observer.observe({
        provider: 'gemini',
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
        provider: 'gemini',
        operation: 'generateImage',
        status: 'failed',
        durationMs: Date.now() - t0,
        errorCode: err instanceof AIProviderError ? err.code : 'PROVIDER_UNKNOWN',
        retryable: err instanceof AIProviderError ? err.retryable : false,
      });
      throw err;
    }
  }

  async editImage(request: ImageEditRequest): Promise<ImageGenerationResult> {
    if (!request.prompt?.trim()) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_REQUEST',
        provider: 'gemini',
        message: 'Prompt must not be empty',
      });
    }

    if (!request.image || request.image.byteLength === 0) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_REQUEST',
        provider: 'gemini',
        message: 'Source image must not be empty',
      });
    }

    const t0 = Date.now();

    this.observer.observe({
      provider: 'gemini',
      operation: 'editImage',
      status: 'started',
      model: this.model,
      requestWidth: request.width,
      requestHeight: request.height,
    });

    const url = `${this.baseUrl}/v1/models/${this.model}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const imageBase64 = uint8ArrayToBase64(request.image);
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: request.mimeType,
                      data: imageBase64,
                    },
                  },
                  { text: request.prompt },
                ],
              },
            ],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new AIProviderError({
            code: 'PROVIDER_TIMEOUT',
            provider: 'gemini',
            message: `Gemini image edit request timed out after ${this.timeoutMs}ms`,
            retryable: true,
          });
        }
        throw new AIProviderError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'gemini',
          message: `Gemini image edit network error: ${err instanceof Error ? err.message : 'unknown'}`,
          retryable: true,
        });
      }
      clearTimeout(timer);

      if (!response.ok) {
        throw new AIProviderError({
          code: 'PROVIDER_HTTP_ERROR',
          provider: 'gemini',
          message: `Gemini image edit returned HTTP ${response.status}`,
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
          message: 'Gemini image edit response body was not valid JSON',
        });
      }

      const envelope = GeminiImageEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini image edit response did not match expected envelope shape',
        });
      }

      const parts = envelope.data.candidates[0].content.parts;
      const imagePart = parts.find((p) => p.inlineData);
      if (!imagePart?.inlineData) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini image edit response contained no image data',
        });
      }

      const { mimeType, data: base64Data } = imagePart.inlineData;
      const imageBytes = base64ToUint8Array(base64Data, 'gemini');

      const result: ImageGenerationResult = {
        provider: 'gemini',
        model: this.model,
        mimeType,
        width: request.width,
        height: request.height,
        data: imageBytes,
      };

      this.observer.observe({
        provider: 'gemini',
        operation: 'editImage',
        status: 'succeeded',
        durationMs: Date.now() - t0,
        model: this.model,
        requestWidth: request.width,
        requestHeight: request.height,
      });

      return result;
    } catch (err) {
      this.observer.observe({
        provider: 'gemini',
        operation: 'editImage',
        status: 'failed',
        durationMs: Date.now() - t0,
        errorCode: err instanceof AIProviderError ? err.code : 'PROVIDER_UNKNOWN',
        retryable: err instanceof AIProviderError ? err.retryable : false,
      });
      throw err;
    }
  }
}
