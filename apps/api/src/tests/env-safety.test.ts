import { describe, it, expect } from 'vitest';
import { validateApiEnv } from '../env.js';

const STAGING_BASE = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
  CLERK_JWT_ISSUER: 'https://clerk.example.com',
  ALLOWED_ORIGINS: 'https://app.orra.io',
  ENVIRONMENT: 'staging',
};

const PROD_BASE = {
  ...STAGING_BASE,
  ENVIRONMENT: 'production',
};

describe('validateApiEnv — dev-only flags rejected in staging/production', () => {
  it('rejects DEV_AUTH_ENABLED=true in staging', () => {
    expect(() =>
      validateApiEnv({ ...STAGING_BASE, DEV_AUTH_ENABLED: 'true' })
    ).toThrow('DEV_AUTH_ENABLED is not allowed in staging');
  });

  it('rejects DEV_AUTH_ENABLED=true in production', () => {
    expect(() =>
      validateApiEnv({ ...PROD_BASE, DEV_AUTH_ENABLED: 'true' })
    ).toThrow('DEV_AUTH_ENABLED is not allowed in production');
  });

  it('rejects DEV_GENERATION_QUEUE_DISABLED=true in staging', () => {
    expect(() =>
      validateApiEnv({ ...STAGING_BASE, DEV_GENERATION_QUEUE_DISABLED: 'true' })
    ).toThrow('DEV_GENERATION_QUEUE_DISABLED is not allowed in staging');
  });

  it('rejects DEV_GENERATION_QUEUE_DISABLED=true in production', () => {
    expect(() =>
      validateApiEnv({ ...PROD_BASE, DEV_GENERATION_QUEUE_DISABLED: 'true' })
    ).toThrow('DEV_GENERATION_QUEUE_DISABLED is not allowed in production');
  });

  it('allows DEV_AUTH_ENABLED=true in development', () => {
    expect(() =>
      validateApiEnv({ ENVIRONMENT: 'development', DEV_AUTH_ENABLED: 'true' })
    ).not.toThrow();
  });

  it('allows DEV_GENERATION_QUEUE_DISABLED=true in development', () => {
    expect(() =>
      validateApiEnv({ ENVIRONMENT: 'development', DEV_GENERATION_QUEUE_DISABLED: 'true' })
    ).not.toThrow();
  });
});

describe('validateApiEnv — required vars in staging/production', () => {
  it('throws if CLERK_JWT_ISSUER is missing in staging', () => {
    const env = { ...STAGING_BASE };
    delete (env as Record<string, unknown>)['CLERK_JWT_ISSUER'];
    expect(() => validateApiEnv(env)).toThrow('CLERK_JWT_ISSUER');
  });

  it('throws if ALLOWED_ORIGINS is missing in staging', () => {
    const env = { ...STAGING_BASE };
    delete (env as Record<string, unknown>)['ALLOWED_ORIGINS'];
    expect(() => validateApiEnv(env)).toThrow('ALLOWED_ORIGINS');
  });

  it('throws if SUPABASE_URL is missing in production', () => {
    const env = { ...PROD_BASE };
    delete (env as Record<string, unknown>)['SUPABASE_URL'];
    expect(() => validateApiEnv(env)).toThrow('SUPABASE_URL');
  });

  it('passes with all required vars in staging', () => {
    expect(() => validateApiEnv(STAGING_BASE)).not.toThrow();
  });

  it('passes with all required vars in production', () => {
    expect(() => validateApiEnv(PROD_BASE)).not.toThrow();
  });

  it('INITIAL_CREDIT_GRANT is optional and defaults to 0 when absent', () => {
    const parsed = validateApiEnv(STAGING_BASE);
    expect(parsed.INITIAL_CREDIT_GRANT).toBeUndefined();
  });

  it('PRIVATE_ALPHA_EMAIL_ALLOWLIST is optional', () => {
    expect(() =>
      validateApiEnv({ ...STAGING_BASE, PRIVATE_ALPHA_EMAIL_ALLOWLIST: 'user@example.com,admin@example.com' })
    ).not.toThrow();
  });
});

describe('validateApiEnv — development passes without optional vars', () => {
  it('accepts empty env as development', () => {
    expect(() => validateApiEnv({})).not.toThrow();
  });

  it('accepts development env with only ENVIRONMENT set', () => {
    expect(() => validateApiEnv({ ENVIRONMENT: 'development' })).not.toThrow();
  });
});

describe('validateApiEnv — AI_PROVIDER=openai guards', () => {
  it('accepts PROMPT_ENHANCER_MODE=ai + AI_PROVIDER=openai + OPENAI_API_KEY in development', () => {
    expect(() =>
      validateApiEnv({
        ENVIRONMENT: 'development',
        PROMPT_ENHANCER_MODE: 'ai',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-dev-key',
      }),
    ).not.toThrow();
  });

  it('accepts PROMPT_ENHANCER_MODE=ai + AI_PROVIDER=openai + OPENAI_API_KEY in staging', () => {
    expect(() =>
      validateApiEnv({
        ...STAGING_BASE,
        PROMPT_ENHANCER_MODE: 'ai',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-staging-key',
      }),
    ).not.toThrow();
  });

  it('throws when PROMPT_ENHANCER_MODE=ai + AI_PROVIDER=openai but OPENAI_API_KEY missing', () => {
    expect(() =>
      validateApiEnv({
        ENVIRONMENT: 'development',
        PROMPT_ENHANCER_MODE: 'ai',
        AI_PROVIDER: 'openai',
      }),
    ).toThrow('OPENAI_API_KEY is required when PROMPT_ENHANCER_MODE=ai and AI_PROVIDER=openai');
  });

  it('throws when PROMPT_ENHANCER_MODE=ai + AI_PROVIDER=fake in staging', () => {
    expect(() =>
      validateApiEnv({ ...STAGING_BASE, PROMPT_ENHANCER_MODE: 'ai', AI_PROVIDER: 'fake' }),
    ).toThrow('AI_PROVIDER=fake is not allowed');
  });

  it('staging error message for fake mentions openai as valid alternative', () => {
    try {
      validateApiEnv({ ...STAGING_BASE, PROMPT_ENHANCER_MODE: 'ai', AI_PROVIDER: 'fake' });
    } catch (err) {
      expect((err as Error).message).toContain('openai');
    }
  });

  it('gemini key guard still works alongside openai', () => {
    expect(() =>
      validateApiEnv({
        ENVIRONMENT: 'development',
        PROMPT_ENHANCER_MODE: 'ai',
        AI_PROVIDER: 'gemini',
      }),
    ).toThrow('GEMINI_API_KEY is required');
  });
});
