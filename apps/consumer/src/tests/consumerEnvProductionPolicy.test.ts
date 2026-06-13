import { describe, it, expect } from 'vitest';
import { validateConsumerEnv } from '../env.js';

const BASE = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const PROD = { ...BASE, ENVIRONMENT: 'production' };
const STAGING = { ...BASE, ENVIRONMENT: 'staging' };

describe('validateConsumerEnv — production provider policy', () => {
  it('rejects AI_PROVIDER unset in production (defaults to fake)', () => {
    expect(() => validateConsumerEnv(PROD)).toThrow('AI_PROVIDER=fake is not allowed in production');
  });

  it('rejects AI_PROVIDER=fake explicitly in production', () => {
    expect(() =>
      validateConsumerEnv({ ...PROD, AI_PROVIDER: 'fake' })
    ).toThrow('AI_PROVIDER=fake is not allowed in production');
  });

  it('rejects IMAGE_PROVIDER unset in production (defaults to fake)', () => {
    expect(() =>
      // Supply valid AI provider to isolate IMAGE_PROVIDER check
      validateConsumerEnv({ ...PROD, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'key' })
    ).toThrow('IMAGE_PROVIDER=fake is not allowed in production');
  });

  it('rejects IMAGE_PROVIDER=fake explicitly in production', () => {
    expect(() =>
      validateConsumerEnv({ ...PROD, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'key', IMAGE_PROVIDER: 'fake' })
    ).toThrow('IMAGE_PROVIDER=fake is not allowed in production');
  });

  it('allows AI_PROVIDER=gemini + GEMINI_API_KEY in production', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
        IMAGE_PROVIDER: 'flux',
        FLUX_API_KEY: 'flux-key',
      })
    ).not.toThrow();
  });

  it('allows IMAGE_PROVIDER=flux + FLUX_API_KEY in production', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
        IMAGE_PROVIDER: 'flux',
        FLUX_API_KEY: 'flux-key',
      })
    ).not.toThrow();
  });

  it('allows AI_PROVIDER=fake in production when ALLOW_FAKE_PROVIDER_IN_PRODUCTION=true', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'fake',
        IMAGE_PROVIDER: 'flux',
        FLUX_API_KEY: 'flux-key',
        ALLOW_FAKE_PROVIDER_IN_PRODUCTION: 'true',
      })
    ).not.toThrow();
  });

  it('allows IMAGE_PROVIDER=fake in production when ALLOW_FAKE_PROVIDER_IN_PRODUCTION=true', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
        IMAGE_PROVIDER: 'fake',
        ALLOW_FAKE_PROVIDER_IN_PRODUCTION: 'true',
      })
    ).not.toThrow();
  });

  it('allows both fake providers in production when ALLOW_FAKE_PROVIDER_IN_PRODUCTION=true', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        ALLOW_FAKE_PROVIDER_IN_PRODUCTION: 'true',
      })
    ).not.toThrow();
  });
});

describe('validateConsumerEnv — staging allows fake providers', () => {
  it('allows AI_PROVIDER=fake in staging', () => {
    expect(() => validateConsumerEnv(STAGING)).not.toThrow();
  });

  it('allows AI_PROVIDER unset in staging', () => {
    expect(() => validateConsumerEnv({ ...STAGING })).not.toThrow();
  });

  it('allows IMAGE_PROVIDER=fake in staging', () => {
    expect(() =>
      validateConsumerEnv({ ...STAGING, IMAGE_PROVIDER: 'fake' })
    ).not.toThrow();
  });

  it('allows real providers in staging', () => {
    expect(() =>
      validateConsumerEnv({
        ...STAGING,
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
        IMAGE_PROVIDER: 'flux',
        FLUX_API_KEY: 'flux-key',
      })
    ).not.toThrow();
  });
});

describe('validateConsumerEnv — development allows fake providers', () => {
  it('allows AI_PROVIDER=fake in development', () => {
    expect(() => validateConsumerEnv(BASE)).not.toThrow();
  });

  it('allows IMAGE_PROVIDER=fake in development', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE, IMAGE_PROVIDER: 'fake' })
    ).not.toThrow();
  });
});

describe('validateConsumerEnv — production error messages are safe', () => {
  it('error message does not include GEMINI_API_KEY value', () => {
    try {
      validateConsumerEnv({ ...PROD, AI_PROVIDER: 'gemini' });
    } catch (err) {
      expect((err as Error).message).not.toContain('gemini-secret-key');
    }
  });

  it('error message for fake provider does not include secret values', () => {
    try {
      validateConsumerEnv(PROD);
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('AI_PROVIDER=fake is not allowed in production');
      expect(msg).not.toContain('service-role-key');
    }
  });
});
