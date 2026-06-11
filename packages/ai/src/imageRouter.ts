import type { ImageProvider } from './imageTypes.js';
import { FakeImageProvider } from './providers/fakeImageProvider.js';
import { AIProviderError } from './errors.js';

// ---------------------------------------------------------------------------
// Image provider router — Phase 15A
// ---------------------------------------------------------------------------
// Separate from the text AIProviderRouter — image providers have different
// config requirements (separate API keys, different capability tiers).
// Only 'fake' is supported in Phase 15A. Real provider adapters come in Phase 15B.

export interface ImageProviderRouter {
  getProvider(): ImageProvider;
}

export interface ImageProviderRouterConfig {
  provider?: string; // defaults to 'fake'; unknown names throw PROVIDER_CONFIG_MISSING
}

export function createImageProviderRouter(config?: ImageProviderRouterConfig): ImageProviderRouter {
  const name = config?.provider ?? 'fake';

  if (name !== 'fake') {
    throw new AIProviderError({
      code: 'PROVIDER_CONFIG_MISSING',
      provider: name,
      message: `Unknown image provider: ${name}`,
    });
  }

  return {
    getProvider: () => new FakeImageProvider(),
  };
}
