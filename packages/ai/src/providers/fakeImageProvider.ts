import type {
  ImageProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageEditRequest,
} from '../imageTypes.js';
import { AIProviderError } from '../errors.js';
import type { AIProviderObserver } from '../observability.js';
import { NoopAIProviderObserver } from '../observability.js';

// ---------------------------------------------------------------------------
// Fake image provider — Phase 15A
// ---------------------------------------------------------------------------
// Deterministic, no network calls, no API keys, no R2 access.
// Returns a tiny hardcoded byte payload — not a renderable image.
// Used as the default image provider until real adapters are added in Phase 15B.

// PNG file signature (8 bytes) followed by a FAKE-IMG marker.
// These bytes are not a valid PNG — they exist only for determinism testing.
const FAKE_IMAGE_DATA = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature (recognizable)
  0x46, 0x41, 0x4b, 0x45, 0x2d, 0x49, 0x4d, 0x47, // "FAKE-IMG" ASCII marker
  0x01,                                              // version byte
]);

export class FakeImageProvider implements ImageProvider {
  readonly id = 'fake';

  constructor(private readonly observer: AIProviderObserver = new NoopAIProviderObserver()) {}

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const t0 = Date.now();

    this.observer.observe({
      provider: 'fake',
      operation: 'generateImage',
      status: 'started',
      model: 'fake-image-v1',
      ...(Number.isFinite(request.width) ? { requestWidth: request.width } : {}),
      ...(Number.isFinite(request.height) ? { requestHeight: request.height } : {}),
    });

    try {
      if (!request.prompt?.trim()) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_REQUEST',
          provider: 'fake',
          message: 'Prompt must not be empty',
        });
      }

      if (!Number.isFinite(request.width) || request.width <= 0) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_REQUEST',
          provider: 'fake',
          message: 'Width must be a positive finite number',
        });
      }

      if (!Number.isFinite(request.height) || request.height <= 0) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_REQUEST',
          provider: 'fake',
          message: 'Height must be a positive finite number',
        });
      }

      const result: ImageGenerationResult = {
        provider: 'fake',
        model: 'fake-image-v1',
        mimeType: `image/${request.format ?? 'png'}`,
        width: request.width,
        height: request.height,
        data: new Uint8Array(FAKE_IMAGE_DATA),
        seed: request.seed ?? 0,
        warnings: request.transparentBackground
          ? ['fake: transparent background not encoded in image data']
          : [],
        metadata: { kind: request.kind ?? 'unknown' },
      };

      this.observer.observe({
        provider: 'fake',
        operation: 'generateImage',
        status: 'succeeded',
        durationMs: Date.now() - t0,
        model: 'fake-image-v1',
        requestWidth: request.width,
        requestHeight: request.height,
      });

      return result;
    } catch (err) {
      this.observer.observe({
        provider: 'fake',
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
    const t0 = Date.now();

    this.observer.observe({
      provider: 'fake',
      operation: 'editImage',
      status: 'started',
      model: 'fake-image-v1',
      ...(Number.isFinite(request.width) ? { requestWidth: request.width } : {}),
      ...(Number.isFinite(request.height) ? { requestHeight: request.height } : {}),
    });

    try {
      if (!request.prompt?.trim()) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_REQUEST',
          provider: 'fake',
          message: 'Prompt must not be empty',
        });
      }

      if (!request.image || request.image.byteLength === 0) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_REQUEST',
          provider: 'fake',
          message: 'Source image must not be empty',
        });
      }

      if (!Number.isFinite(request.width) || request.width <= 0) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_REQUEST',
          provider: 'fake',
          message: 'Width must be a positive finite number',
        });
      }

      if (!Number.isFinite(request.height) || request.height <= 0) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_REQUEST',
          provider: 'fake',
          message: 'Height must be a positive finite number',
        });
      }

      const result: ImageGenerationResult = {
        provider: 'fake',
        model: 'fake-image-v1',
        mimeType: `image/${request.format ?? 'png'}`,
        width: request.width,
        height: request.height,
        data: new Uint8Array(FAKE_IMAGE_DATA),
        seed: 0,
        metadata: { edit: true, sourceByteLength: request.image.byteLength },
      };

      this.observer.observe({
        provider: 'fake',
        operation: 'editImage',
        status: 'succeeded',
        durationMs: Date.now() - t0,
        model: 'fake-image-v1',
        requestWidth: request.width,
        requestHeight: request.height,
      });

      return result;
    } catch (err) {
      this.observer.observe({
        provider: 'fake',
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
