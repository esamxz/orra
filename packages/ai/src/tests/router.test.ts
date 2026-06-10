import { describe, it, expect } from 'vitest';
import { createAIProviderRouter } from '../router.js';
import { FakeAIProvider } from '../providers/fakeProvider.js';

describe('AIProviderRouter', () => {
  it('getProvider() returns a FakeAIProvider instance', () => {
    const router = createAIProviderRouter();
    const provider = router.getProvider();
    expect(provider).toBeInstanceOf(FakeAIProvider);
  });

  it('provider name is "fake"', () => {
    const router = createAIProviderRouter();
    expect(router.getProvider().name).toBe('fake');
  });

  it('returns fake provider when called with no config', () => {
    const router = createAIProviderRouter();
    expect(router.getProvider().name).toBe('fake');
  });

  it('returns fake provider when called with an unknown provider string', () => {
    const router = createAIProviderRouter({ provider: 'gemini-2.5-flash-lite' });
    expect(router.getProvider().name).toBe('fake');
  });
});
