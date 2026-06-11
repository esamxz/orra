import type { ImageProvider } from './imageTypes.js';
import { FakeImageProvider } from './providers/fakeImageProvider.js';
import { FluxImageProvider } from './providers/fluxImageProvider.js';
import { AIProviderError } from './errors.js';
import type { AIProviderObserver } from './observability.js';

// ---------------------------------------------------------------------------
// Image provider router — Phase 15A / 15B
// ---------------------------------------------------------------------------
// Separate from the text AIProviderRouter — image providers have different
// config requirements (separate API keys, different capability tiers).
//
// Phase 15A: only 'fake' supported.
// Phase 15B: 'flux' (FLUX Schnell via Black Forest Labs) added behind
//   IMAGE_PROVIDER=flux + FLUX_API_KEY configuration.
//
// Fake remains the default. Real provider selection requires explicit config.
// Generated image R2 storage and artifact integration come in later phases.

export interface ImageProviderRouter {
  getProvider(): ImageProvider;
}

export interface ImageProviderRouterConfig {
  /** 'fake' (default) or 'flux'. Unknown values throw PROVIDER_CONFIG_MISSING. */
  provider?: string;
  /** Required when provider='flux'. */
  fluxApiKey?: string;
  /** Optional FLUX API base URL override (useful for tests). */
  fluxBaseUrl?: string;
  /** Optional FLUX model name override. Defaults to 'flux-schnell'. */
  fluxModel?: string;
  /** Timeout in ms passed to the selected provider. */
  timeoutMs?: number;
  /** Observer wired to the selected provider for observability events. */
  observer?: AIProviderObserver;
}

export function createImageProviderRouter(config?: ImageProviderRouterConfig): ImageProviderRouter {
  const name = (config?.provider ?? 'fake').trim().toLowerCase();

  if (name === '' || name === 'fake') {
    return {
      getProvider: () => new FakeImageProvider(config?.observer),
    };
  }

  if (name === 'flux') {
    if (!config?.fluxApiKey) {
      throw new AIProviderError({
        code: 'PROVIDER_CONFIG_MISSING',
        provider: 'flux',
        message: 'FLUX_API_KEY is required when IMAGE_PROVIDER=flux',
      });
    }
    return {
      getProvider: () =>
        new FluxImageProvider({
          apiKey: config.fluxApiKey!,
          baseUrl: config.fluxBaseUrl,
          model: config.fluxModel,
          timeoutMs: config.timeoutMs,
          observer: config.observer,
        }),
    };
  }

  throw new AIProviderError({
    code: 'PROVIDER_CONFIG_MISSING',
    provider: name,
    message: `Unknown image provider: ${name}`,
  });
}
