import type { AIProvider } from './types.js';
import { FakeAIProvider } from './providers/fakeProvider.js';

// ---------------------------------------------------------------------------
// AI provider router
// ---------------------------------------------------------------------------
// Phase 13A: always routes to FakeAIProvider. Config is accepted but ignored
// until real providers are added in Phase 13B/13C.

export interface AIProviderRouter {
  getProvider(): AIProvider;
}

export interface AIProviderRouterConfig {
  provider?: string;
}

export function createAIProviderRouter(_config?: AIProviderRouterConfig): AIProviderRouter {
  return {
    getProvider: () => new FakeAIProvider(),
  };
}
