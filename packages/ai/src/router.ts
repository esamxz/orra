import type { AIProvider } from './types.js';
import { FakeAIProvider } from './providers/fakeProvider.js';
import { GeminiTextProvider } from './providers/geminiTextProvider.js';
import { OpenAITextProvider } from './providers/openAITextProvider.js';
import { AIProviderError } from './errors.js';
import type { AIProviderObserver } from './observability.js';

export interface AIProviderRouter {
  getProvider(): AIProvider;
}

export interface AIProviderRouterConfig {
  provider?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiBaseUrl?: string;
  openaiApiKey?: string;
  /** OpenAI text model. Defaults to 'gpt-4o-mini' if not provided. */
  openaiModel?: string;
  openaiBaseUrl?: string;
  timeoutMs?: number;
  observer?: AIProviderObserver;
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
          observer: config.observer,
        }),
    };
  }

  if (providerName === 'openai') {
    if (!config?.openaiApiKey) {
      throw new AIProviderError({
        code: 'PROVIDER_CONFIG_MISSING',
        provider: 'openai',
        message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai',
      });
    }
    const key = config.openaiApiKey;
    return {
      getProvider: () =>
        new OpenAITextProvider({
          apiKey: key,
          model: config.openaiModel ?? 'gpt-4o-mini',
          baseUrl: config.openaiBaseUrl,
          timeoutMs: config.timeoutMs,
          observer: config.observer,
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
