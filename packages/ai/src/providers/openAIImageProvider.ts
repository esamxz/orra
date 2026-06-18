import { z } from 'zod';
import type { ImageProvider, ImageGenerationRequest, ImageGenerationResult, ImageEditRequest } from '../imageTypes.js';
import { AIProviderError } from '../errors.js';
import type { AIProviderObserver } from '../observability.js';
import { NoopAIProviderObserver } from '../observability.js';
import { base64ToUint8Array } from '../base64.js';
import { resolveImageRequestSize } from '../imageSize.js';

export interface OpenAIImageProviderConfig {
  apiKey: string;
  /** Image model — REQUIRED. Set via OPENAI_IMAGE_MODEL env var. Recommended: gpt-image-2. */
  model: string;
  /** Optional size override, e.g. "1024x1024". Set via OPENAI_IMAGE_SIZE. */
  size?: string;
  /** Optional quality. Set via OPENAI_IMAGE_QUALITY. */
  quality?: string;
  /** Optional output format. Set via OPENAI_IMAGE_OUTPUT_FORMAT. */
  outputFormat?: string;
  /** API base URL. Defaults to https://api.openai.com/v1 */
  baseUrl?: string;
  /** Timeout in ms. Defaults to 180_000 for image generation. */
  timeoutMs?: number;
  observer?: AIProviderObserver;
  /** Injectable for testing. */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
// Image generation can take significantly longer than text generation.
// B0.4: default 3 minutes so staging has enough wall-clock time.
const DEFAULT_TIMEOUT_MS = 180_000;
const ENDPOINT_FAMILY = 'images';

// ---------------------------------------------------------------------------
// Response envelope: OpenAI Images API
//
// POST /v1/images/generations
// { "model": "...", "prompt": "...", "size": "1024x1024", "quality": "low", "output_format": "jpeg" }
//
// Response: { "data": [{ "b64_json": "..." }] }
// ---------------------------------------------------------------------------

const OpenAIImageResponseEnvelopeSchema = z.object({
  data: z
    .array(
      z.object({
        b64_json: z.string().optional(),
        url: z.string().optional(),
        revised_prompt: z.string().optional(),
      }),
    )
    .min(1),
});

function splitSize(size: string): { width: number; height: number } {
  if (size === 'auto') {
    return { width: 1024, height: 1536 };
  }
  const [w, h] = size.split('x').map((s) => parseInt(s, 10));
  return { width: w ?? 0, height: h ?? 0 };
}

// Extract a safe subset of an OpenAI error body. Returns null if the message
// might contain prompt text or other sensitive content.
function safeProviderErrorMessage(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const err = (raw as Record<string, unknown>).error;
  if (typeof err !== 'object' || err === null) return null;
  const msg = (err as Record<string, unknown>).message;
  if (typeof msg !== 'string') return null;
  if (msg.includes('prompt') || msg.includes('key') || msg.includes('Bearer')) return null;
  if (msg.length > 120) return null;
  return msg;
}

// Maps OpenAI image HTTP status codes to typed AIProviderError codes.
function mapImageHttpError(status: number, model: string): AIProviderError {
  if (status === 400) {
    return new AIProviderError({
      code: 'PROVIDER_HTTP_ERROR',
      provider: 'openai',
      message: 'OpenAI image request was rejected. Check image request configuration.',
      retryable: false,
    });
  }
  if (status === 401 || status === 403) {
    return new AIProviderError({
      code: 'PROVIDER_AUTH_FAILED',
      provider: 'openai',
      message: `OpenAI image returned HTTP ${status} — check OPENAI_API_KEY`,
      retryable: false,
    });
  }
  if (status === 404) {
    return new AIProviderError({
      code: 'PROVIDER_NOT_FOUND',
      provider: 'openai',
      message: `OpenAI image returned HTTP 404 — model not found. Check OPENAI_IMAGE_MODEL (used: ${model}).`,
      retryable: false,
    });
  }
  if (status === 429) {
    return new AIProviderError({
      code: 'PROVIDER_RATE_LIMITED',
      provider: 'openai',
      message: `OpenAI image returned HTTP 429 — rate limited`,
      retryable: true,
    });
  }
  return new AIProviderError({
    code: 'PROVIDER_HTTP_ERROR',
    provider: 'openai',
    message: `OpenAI image returned HTTP ${status}`,
    retryable: status >= 500,
  });
}

// Maps OpenAI image edit HTTP status codes to typed AIProviderError codes.
function mapEditHttpError(status: number, model: string): AIProviderError {
  if (status === 400) {
    return new AIProviderError({
      code: 'PROVIDER_HTTP_ERROR',
      provider: 'openai',
      message: 'OpenAI image edit request was rejected. Check image/model configuration.',
      retryable: false,
    });
  }
  if (status === 401 || status === 403) {
    return new AIProviderError({
      code: 'PROVIDER_AUTH_FAILED',
      provider: 'openai',
      message: `OpenAI image edit returned HTTP ${status} — check OPENAI_API_KEY`,
      retryable: false,
    });
  }
  if (status === 404) {
    return new AIProviderError({
      code: 'PROVIDER_NOT_FOUND',
      provider: 'openai',
      message: `OpenAI image edit returned HTTP 404 — model not found. Check OPENAI_IMAGE_MODEL (used: ${model}).`,
      retryable: false,
    });
  }
  if (status === 429) {
    return new AIProviderError({
      code: 'PROVIDER_RATE_LIMITED',
      provider: 'openai',
      message: `OpenAI image edit returned HTTP 429 — rate limited`,
      retryable: true,
    });
  }
  return new AIProviderError({
    code: 'PROVIDER_HTTP_ERROR',
    provider: 'openai',
    message: `OpenAI image edit returned HTTP ${status}`,
    retryable: status >= 500,
  });
}

export class OpenAIImageProvider implements ImageProvider {
  readonly id = 'openai';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly size?: string;
  private readonly quality?: string;
  private readonly outputFormat?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly observer: AIProviderObserver;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: OpenAIImageProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.size = config.size;
    this.quality = config.quality;
    this.outputFormat = config.outputFormat;
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
    const requestSize = resolveImageRequestSize({
      provider: 'openai',
      ratio: { w: request.width, h: request.height },
      requestedSize: request.size ?? this.size,
    });
    const requestQuality = this.quality;
    const requestOutputFormat = this.outputFormat;

    // Safe start metadata — never prompt, key, raw bytes, or response text.
    console.info('[openai_image]', {
      provider: 'openai',
      endpointFamily: ENDPOINT_FAMILY,
      model: this.model,
      size: requestSize,
      ...(requestQuality && { quality: requestQuality }),
      ...(requestOutputFormat && { outputFormat: requestOutputFormat }),
      timeoutMs: this.timeoutMs,
    });

    this.observer.observe({
      provider: 'openai',
      operation: 'generateImage',
      status: 'started',
      model: this.model,
      requestWidth: request.width,
      requestHeight: request.height,
      requestSize,
    });

    const url = `${this.baseUrl}/images/generations`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const requestBody: Record<string, unknown> = {
      model: this.model,
      prompt: request.prompt,
      size: requestSize,
    };
    if (requestQuality) {
      requestBody.quality = requestQuality;
    }
    if (requestOutputFormat) {
      requestBody.output_format = requestOutputFormat;
    }

    try {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestBody),
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
        let errorBody: unknown = null;
        try {
          errorBody = await response.clone().json();
        } catch {
          // Ignore; we only use it for safe diagnostics.
        }
        const safeMessage = safeProviderErrorMessage(errorBody);
        const requestId = response.headers.get('x-request-id') ?? undefined;
        const durationMs = Date.now() - t0;

        // Safe debug metadata only — never log prompt, key, raw body, or response text.
        console.error('[openai_image]', {
          provider: 'openai',
          endpointFamily: ENDPOINT_FAMILY,
          model: this.model,
          status: response.status,
          size: requestSize,
          ...(requestQuality && { quality: requestQuality }),
          ...(requestOutputFormat && { outputFormat: requestOutputFormat }),
          sentFields: Object.keys(requestBody).sort(),
          durationMs,
          ...(requestId && { requestId }),
          ...(safeMessage && { providerMessage: safeMessage }),
          errorCode: response.status === 400 ? 'IMAGE_REQUEST_REJECTED' : 'PROVIDER_HTTP_ERROR',
        });
        throw mapImageHttpError(response.status, this.model);
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

      const imageEntry = envelope.data.data.find((item) => item.b64_json);

      if (!imageEntry?.b64_json) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'openai',
          message: 'OpenAI image response contained no b64_json image data',
        });
      }

      const { width, height } = splitSize(requestSize);
      const imageBytes = base64ToUint8Array(imageEntry.b64_json, 'openai');
      const mimeType = requestOutputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

      const result: ImageGenerationResult = {
        provider: 'openai',
        model: this.model,
        mimeType,
        width,
        height,
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
        requestSize,
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - t0;
      this.observer.observe({
        provider: 'openai',
        operation: 'generateImage',
        status: 'failed',
        durationMs,
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
        provider: 'openai',
        message: 'Prompt must not be empty',
      });
    }
    if (!request.image || request.image.length === 0) {
      throw new AIProviderError({
        code: 'PROVIDER_INVALID_REQUEST',
        provider: 'openai',
        message: 'Source image bytes must not be empty',
      });
    }

    // OpenAI image edits require a multipart upload. Some runtimes (older Node,
    // certain test environments) do not expose FormData/Blob globally. Fail
    // cleanly with a capability error instead of crashing mid-flight.
    if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
      throw new AIProviderError({
        code: 'PROVIDER_CAPABILITY_UNSUPPORTED',
        provider: 'openai',
        message: 'OpenAI image edits require runtime FormData/Blob support',
        retryable: false,
      });
    }

    const t0 = Date.now();
    const requestSize = resolveImageRequestSize({
      provider: 'openai',
      ratio: { w: request.width, h: request.height },
      requestedSize: this.size,
    });
    const requestQuality = this.quality;
    const requestOutputFormat = this.outputFormat;
    const sourceMimeType = request.mimeType ?? 'image/png';

    console.info('[openai_image_edit]', {
      provider: 'openai',
      endpointFamily: ENDPOINT_FAMILY,
      model: this.model,
      size: requestSize,
      sourceMimeType,
      sourceByteLength: request.image.length,
      ...(requestQuality && { quality: requestQuality }),
      ...(requestOutputFormat && { outputFormat: requestOutputFormat }),
      timeoutMs: this.timeoutMs,
    });

    this.observer.observe({
      provider: 'openai',
      operation: 'editImage',
      status: 'started',
      model: this.model,
      requestWidth: request.width,
      requestHeight: request.height,
      requestSize,
    });

    const url = `${this.baseUrl}/images/edits`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const formData = new FormData();
    // TypeScript's lib.dom types are strict about BlobPart, but every runtime
    // we target accepts an ArrayBuffer here. Use the underlying buffer.
    const sourceBlob = new Blob([request.image.buffer as ArrayBuffer], { type: sourceMimeType });
    const fileExtension = sourceMimeType === 'image/jpeg' ? 'jpg' : 'png';
    formData.append('image', sourceBlob, `source.${fileExtension}`);
    formData.append('model', this.model);
    formData.append('prompt', request.prompt);
    if (requestSize) {
      formData.append('size', requestSize);
    }
    if (requestQuality) {
      formData.append('quality', requestQuality);
    }
    if (requestOutputFormat) {
      formData.append('output_format', requestOutputFormat);
    }

    try {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: formData,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new AIProviderError({
            code: 'PROVIDER_TIMEOUT',
            provider: 'openai',
            message: `OpenAI image edit request timed out after ${this.timeoutMs}ms`,
            retryable: true,
          });
        }
        throw new AIProviderError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'openai',
          message: `OpenAI image edit network error: ${err instanceof Error ? err.message : 'unknown'}`,
          retryable: true,
        });
      }
      clearTimeout(timer);

      if (!response.ok) {
        let errorBody: unknown = null;
        try {
          errorBody = await response.clone().json();
        } catch {
          // Ignore; we only use it for safe diagnostics.
        }
        const safeMessage = safeProviderErrorMessage(errorBody);
        const requestId = response.headers.get('x-request-id') ?? undefined;
        const durationMs = Date.now() - t0;

        console.error('[openai_image_edit]', {
          provider: 'openai',
          endpointFamily: ENDPOINT_FAMILY,
          model: this.model,
          status: response.status,
          size: requestSize,
          ...(requestQuality && { quality: requestQuality }),
          ...(requestOutputFormat && { outputFormat: requestOutputFormat }),
          durationMs,
          ...(requestId && { requestId }),
          ...(safeMessage && { providerMessage: safeMessage }),
          errorCode: response.status === 400 ? 'IMAGE_EDIT_REQUEST_REJECTED' : 'PROVIDER_HTTP_ERROR',
        });
        throw mapEditHttpError(response.status, this.model);
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'openai',
          message: 'OpenAI image edit response body was not valid JSON',
        });
      }

      const envelope = OpenAIImageResponseEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'openai',
          message: 'OpenAI image edit response did not match expected envelope shape',
        });
      }

      const imageEntry = envelope.data.data.find((item) => item.b64_json);

      if (!imageEntry?.b64_json) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'openai',
          message: 'OpenAI image edit response contained no b64_json image data',
        });
      }

      const { width, height } = splitSize(requestSize);
      const imageBytes = base64ToUint8Array(imageEntry.b64_json, 'openai');
      const mimeType = requestOutputFormat === 'jpeg' ? 'image/jpeg' : sourceMimeType;

      const result: ImageGenerationResult = {
        provider: 'openai',
        model: this.model,
        mimeType,
        width,
        height,
        data: imageBytes,
      };

      this.observer.observe({
        provider: 'openai',
        operation: 'editImage',
        status: 'succeeded',
        durationMs: Date.now() - t0,
        model: this.model,
        requestWidth: request.width,
        requestHeight: request.height,
        requestSize,
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - t0;
      this.observer.observe({
        provider: 'openai',
        operation: 'editImage',
        status: 'failed',
        durationMs,
        errorCode: err instanceof AIProviderError ? err.code : 'PROVIDER_UNKNOWN',
        retryable: err instanceof AIProviderError ? err.retryable : false,
      });
      throw err;
    }
  }
}
