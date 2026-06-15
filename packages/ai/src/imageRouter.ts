import type { ImageProvider } from './imageTypes.js';
import { FakeImageProvider } from './providers/fakeImageProvider.js';
import { GeminiImageProvider, DEFAULT_GEMINI_IMAGE_MODEL } from './providers/geminiImageProvider.js';
import { OpenAIImageProvider } from './providers/openAIImageProvider.js';
import { AIProviderError } from './errors.js';
import type { AIProviderObserver } from './observability.js';

// ---------------------------------------------------------------------------
// Image provider router — D5.2 / B0.4
// ---------------------------------------------------------------------------
// Separate from the text AIProviderRouter — image providers have different
// config requirements (separate model names, different capability tiers,
// longer default timeouts).
//
// Supported providers:
//   'fake'   — FakeImageProvider (default; no API key required)
//   'gemini' — GeminiImageProvider (requires geminiApiKey)
//   'openai' — OpenAIImageProvider (requires openaiApiKey, openaiImageModel)
//
// Deprecated:
//   'flux'   — IMAGE_PROVIDER=flux is no longer supported. Use IMAGE_PROVIDER=gemini or openai.

export interface ImageProviderRouter {
  getProvider(): ImageProvider;
}

export interface ImageProviderRouterConfig {
  /** 'fake' (default), 'gemini', or 'openai'. 'flux' is deprecated and throws. Unknown values throw PROVIDER_CONFIG_MISSING. */
  provider?: string;
  /** Required when provider='gemini'. Shared with AI text provider (GEMINI_API_KEY). */
  geminiApiKey?: string;
  /** Gemini image model name. Defaults to DEFAULT_GEMINI_IMAGE_MODEL. */
  geminiImageModel?: string;
  /** Optional Gemini API base URL override (useful for tests). */
  geminiBaseUrl?: string;
  /** Required when provider='openai'. Set via OPENAI_API_KEY. */
  openaiApiKey?: string;
  /** Required when provider='openai'. Set via OPENAI_IMAGE_MODEL. Recommended: gpt-image-2. */
  openaiImageModel?: string;
  /** Optional OpenAI image size override, e.g. "1024x1024". Set via OPENAI_IMAGE_SIZE. */
  openaiImageSize?: string;
  /** Optional OpenAI image quality. Set via OPENAI_IMAGE_QUALITY. */
  openaiImageQuality?: string;
  /** Optional OpenAI image output format. Set via OPENAI_IMAGE_OUTPUT_FORMAT. */
  openaiImageOutputFormat?: string;
  /** Optional OpenAI API base URL override (useful for tests). */
  openaiBaseUrl?: string;
  /** Timeout in ms passed to the selected provider. Defaults to 180s for image generation. */
  timeoutMs?: number;
  /** Observer wired to the selected provider for observability events. */
  observer?: AIProviderObserver;
  /** Injectable fetch for testing. */
  fetch?: typeof globalThis.fetch;
}

export function createImageProviderRouter(config?: ImageProviderRouterConfig): ImageProviderRouter {
  const name = (config?.provider ?? 'fake').trim().toLowerCase();

  if (name === '' || name === 'fake') {
    return {
      getProvider: () => new FakeImageProvider(config?.observer),
    };
  }

  if (name === 'gemini') {
    if (!config?.geminiApiKey) {
      throw new AIProviderError({
        code: 'PROVIDER_CONFIG_MISSING',
        provider: 'gemini',
        message: 'GEMINI_API_KEY is required when IMAGE_PROVIDER=gemini',
      });
    }
    return {
      getProvider: () => new GeminiImageProvider({
        apiKey: config.geminiApiKey!,
        model: config.geminiImageModel ?? DEFAULT_GEMINI_IMAGE_MODEL,
        baseUrl: config.geminiBaseUrl,
        timeoutMs: config.timeoutMs,
        observer: config.observer,
        fetch: config.fetch,
      }),
    };
  }

  if (name === 'openai') {
    if (!config?.openaiApiKey) {
      throw new AIProviderError({
        code: 'PROVIDER_CONFIG_MISSING',
        provider: 'openai',
        message: 'OPENAI_API_KEY is required when IMAGE_PROVIDER=openai',
      });
    }
    if (!config?.openaiImageModel) {
      throw new AIProviderError({
        code: 'PROVIDER_CONFIG_MISSING',
        provider: 'openai',
        message: 'OPENAI_IMAGE_MODEL is required when IMAGE_PROVIDER=openai',
      });
    }
    return {
      getProvider: () => new OpenAIImageProvider({
        apiKey: config.openaiApiKey!,
        model: config.openaiImageModel!,
        size: config.openaiImageSize,
        quality: config.openaiImageQuality,
        outputFormat: config.openaiImageOutputFormat,
        baseUrl: config.openaiBaseUrl,
        timeoutMs: config.timeoutMs,
        observer: config.observer,
        fetch: config.fetch,
      }),
    };
  }

  if (name === 'flux') {
    throw new AIProviderError({
      code: 'PROVIDER_CONFIG_MISSING',
      provider: 'flux',
      message: 'IMAGE_PROVIDER=flux is deprecated. Use IMAGE_PROVIDER=gemini or IMAGE_PROVIDER=openai.',
    });
  }

  throw new AIProviderError({
    code: 'PROVIDER_CONFIG_MISSING',
    provider: name,
    message: `Unknown image provider: ${name}`,
  });
}
