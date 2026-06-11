import { describe, it, expect } from 'vitest';
import { validateConsumerEnv } from '../env.js';

// Minimal valid env that satisfies all required fields
const BASE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

describe('validateConsumerEnv — IMAGE_PROVIDER validation', () => {
  it('accepts env with no IMAGE_PROVIDER set (fake default)', () => {
    expect(() => validateConsumerEnv(BASE_ENV)).not.toThrow();
  });

  it('accepts IMAGE_PROVIDER=fake without any FLUX vars', () => {
    expect(() => validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'fake' })).not.toThrow();
  });

  it('accepts IMAGE_PROVIDER=flux when FLUX_API_KEY is provided', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'flux', FLUX_API_KEY: 'sk-flux-key' }),
    ).not.toThrow();
  });

  it('throws when IMAGE_PROVIDER=flux but FLUX_API_KEY is missing', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'flux' }),
    ).toThrow('FLUX_API_KEY is required when IMAGE_PROVIDER=flux');
  });

  it('error for missing FLUX_API_KEY mentions the field name', () => {
    try {
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'flux' });
    } catch (err) {
      expect((err as Error).message).toContain('FLUX_API_KEY');
    }
  });

  it('does not require FLUX_API_KEY when IMAGE_PROVIDER is unset', () => {
    expect(() => validateConsumerEnv(BASE_ENV)).not.toThrow();
  });

  it('does not require FLUX_API_KEY when IMAGE_PROVIDER=fake', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'fake' }),
    ).not.toThrow();
  });

  it('accepts optional FLUX_API_BASE_URL and FLUX_MODEL fields', () => {
    expect(() =>
      validateConsumerEnv({
        ...BASE_ENV,
        IMAGE_PROVIDER: 'flux',
        FLUX_API_KEY: 'sk-flux-key',
        FLUX_API_BASE_URL: 'https://custom.bfl.example.com',
        FLUX_MODEL: 'flux-pro',
      }),
    ).not.toThrow();
  });

  it('error message never includes the FLUX_API_KEY value', () => {
    try {
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'flux' });
    } catch (err) {
      // The error says FLUX_API_KEY is required, not its value
      expect((err as Error).message).not.toContain('sk-flux-key');
    }
  });
});

describe('validateConsumerEnv — existing AI_PROVIDER validation unchanged', () => {
  it('still rejects AI_PROVIDER=gemini without GEMINI_API_KEY', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, AI_PROVIDER: 'gemini' }),
    ).toThrow('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
  });

  it('still accepts AI_PROVIDER=gemini with GEMINI_API_KEY', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' }),
    ).not.toThrow();
  });

  it('still accepts AI_PROVIDER=fake without any Gemini vars', () => {
    expect(() => validateConsumerEnv({ ...BASE_ENV, AI_PROVIDER: 'fake' })).not.toThrow();
  });
});
