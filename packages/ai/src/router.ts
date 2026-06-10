import type { AIProvider } from './types.js';
import { FakeAIProvider } from './providers/fakeProvider.js';
import { GeminiTextProvider } from './providers/geminiTextProvider.js';
import { AIProviderError } from './errors.js';

export interface AIProviderRouter {
  getProvider(): AIProvider;
}

export interface AIProviderRouterConfig {
  provider?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiBaseUrl?: string;
  timeoutMs?: number;
}

export function createAIProviderRouter(config?: AIProviderRouterConfig): AIProviderRouter {
  const providerName = config?.provider ?? 'fake';

  if (providerName === 'gemini') {
    if (!config?.geminiApiKey) {
      throw new AIProviderError({
        code: 'PROVIDER_CONFIG_MISSING',
        provider: 'gemini',
        message: 'GEMINI_API_KEY is required when AI_PROVIDER=gemini',
      });
    }
    const key = config.geminiApiKey;
    return {
      getProvider: () =>
        new GeminiTextProvider({
          apiKey: key,
          model: config.geminiModel ?? 'gemini-2.0-flash-lite',
          baseUrl: config.geminiBaseUrl,
          timeoutMs: config.timeoutMs,
        }),
    };
  }

  if (providerName !== 'fake') {
    throw new AIProviderError({
      code: 'PROVIDER_CONFIG_MISSING',
      provider: providerName,
      message: `Unknown AI provider: ${providerName}`,
    });
  }

  return {
    getProvider: () => new FakeAIProvider(),
  };
}
