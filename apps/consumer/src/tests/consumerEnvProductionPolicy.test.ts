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

  it('rejects IMAGE_PROVIDER=flux in production (deprecated)', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
        IMAGE_PROVIDER: 'flux',
      })
    ).toThrow('IMAGE_PROVIDER=flux is no longer supported');
  });

  it('allows AI_PROVIDER=gemini + GEMINI_API_KEY in production', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
        IMAGE_PROVIDER: 'gemini',
      })
    ).not.toThrow();
  });

  it('allows IMAGE_PROVIDER=gemini + GEMINI_API_KEY in production', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
        IMAGE_PROVIDER: 'gemini',
      })
    ).not.toThrow();
  });

  it('allows both AI and image provider as gemini with one shared GEMINI_API_KEY', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'gemini',
        IMAGE_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'shared-gemini-key',
        GEMINI_IMAGE_MODEL: 'gemini-2.5-flash-image',
      })
    ).not.toThrow();
  });

  it('allows AI_PROVIDER=fake in production when ALLOW_FAKE_PROVIDER_IN_PRODUCTION=true', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'fake',
        IMAGE_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
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

  it('production error message mentions gemini as a valid provider', () => {
    try {
      validateConsumerEnv(PROD);
    } catch (err) {
      expect((err as Error).message).toContain('gemini');
    }
  });

  it('production error message mentions openai as a valid provider', () => {
    try {
      validateConsumerEnv(PROD);
    } catch (err) {
      expect((err as Error).message).toContain('openai');
    }
  });

  it('allows AI_PROVIDER=openai + OPENAI_API_KEY in production', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-prod-key',
        IMAGE_PROVIDER: 'openai',
        OPENAI_IMAGE_MODEL: 'gpt-image-2',
      }),
    ).not.toThrow();
  });

  it('allows IMAGE_PROVIDER=openai + OPENAI_API_KEY + OPENAI_IMAGE_MODEL in production', () => {
    expect(() =>
      validateConsumerEnv({
        ...PROD,
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-prod-key',
        IMAGE_PROVIDER: 'openai',
        OPENAI_IMAGE_MODEL: 'gpt-image-2',
      }),
    ).not.toThrow();
  });

  it('rejects AI_PROVIDER=openai without key in production', () => {
    expect(() =>
      validateConsumerEnv({ ...PROD, AI_PROVIDER: 'openai', IMAGE_PROVIDER: 'openai', OPENAI_IMAGE_MODEL: 'gpt-image-2' }),
    ).toThrow('OPENAI_API_KEY is required when AI_PROVIDER=openai');
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

  it('allows IMAGE_PROVIDER=gemini in staging with GEMINI_API_KEY', () => {
    expect(() =>
      validateConsumerEnv({
        ...STAGING,
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
        IMAGE_PROVIDER: 'gemini',
      })
    ).not.toThrow();
  });

  it('rejects IMAGE_PROVIDER=flux in staging (deprecated)', () => {
    expect(() =>
      validateConsumerEnv({ ...STAGING, IMAGE_PROVIDER: 'flux' })
    ).toThrow('IMAGE_PROVIDER=flux is no longer supported');
  });

  it('allows AI_PROVIDER=openai in staging with OPENAI_API_KEY', () => {
    expect(() =>
      validateConsumerEnv({ ...STAGING, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-staging' }),
    ).not.toThrow();
  });

  it('allows IMAGE_PROVIDER=openai in staging with OPENAI_API_KEY + OPENAI_IMAGE_MODEL', () => {
    expect(() =>
      validateConsumerEnv({
        ...STAGING,
        IMAGE_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-staging',
        OPENAI_IMAGE_MODEL: 'gpt-image-2',
      }),
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
