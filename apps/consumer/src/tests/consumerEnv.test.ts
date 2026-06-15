import { describe, it, expect } from 'vitest';
import { validateConsumerEnv } from '../env.js';

// Minimal valid env that satisfies all required fields
const BASE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

describe('validateConsumerEnv — IMAGE_PROVIDER=gemini validation', () => {
  it('accepts IMAGE_PROVIDER=gemini with GEMINI_API_KEY', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'gemini', GEMINI_API_KEY: 'sk-gemini-key' }),
    ).not.toThrow();
  });

  it('throws when IMAGE_PROVIDER=gemini but GEMINI_API_KEY is missing', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'gemini' }),
    ).toThrow('GEMINI_API_KEY is required when IMAGE_PROVIDER=gemini');
  });

  it('error for missing GEMINI_API_KEY mentions the field name', () => {
    try {
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'gemini' });
    } catch (err) {
      expect((err as Error).message).toContain('GEMINI_API_KEY');
    }
  });

  it('error message never contains the GEMINI_API_KEY value', () => {
    try {
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'gemini' });
    } catch (err) {
      expect((err as Error).message).not.toContain('sk-gemini-key');
    }
  });

  it('accepts optional GEMINI_IMAGE_MODEL field', () => {
    expect(() =>
      validateConsumerEnv({
        ...BASE_ENV,
        IMAGE_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'sk-gemini-key',
        GEMINI_IMAGE_MODEL: 'gemini-2.5-flash-image',
      }),
    ).not.toThrow();
  });

  it('GEMINI_IMAGE_MODEL is optional — not required when IMAGE_PROVIDER=gemini', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'gemini', GEMINI_API_KEY: 'sk-gemini-key' }),
    ).not.toThrow();
  });
});

describe('validateConsumerEnv — IMAGE_PROVIDER=fake validation', () => {
  it('accepts env with no IMAGE_PROVIDER set (fake default)', () => {
    expect(() => validateConsumerEnv(BASE_ENV)).not.toThrow();
  });

  it('accepts IMAGE_PROVIDER=fake without any GEMINI vars', () => {
    expect(() => validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'fake' })).not.toThrow();
  });

  it('does not require GEMINI_API_KEY when IMAGE_PROVIDER is unset', () => {
    expect(() => validateConsumerEnv(BASE_ENV)).not.toThrow();
  });

  it('does not require GEMINI_API_KEY when IMAGE_PROVIDER=fake', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'fake' }),
    ).not.toThrow();
  });
});

describe('validateConsumerEnv — IMAGE_PROVIDER=flux (deprecated)', () => {
  it('throws when IMAGE_PROVIDER=flux with deprecation message', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'flux' }),
    ).toThrow('IMAGE_PROVIDER=flux is no longer supported');
  });

  it('deprecation message points to gemini', () => {
    try {
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'flux' });
    } catch (err) {
      expect((err as Error).message).toContain('gemini');
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

describe('validateConsumerEnv — GEMINI_API_KEY shared between text and image', () => {
  it('accepts AI_PROVIDER=gemini and IMAGE_PROVIDER=gemini with a single GEMINI_API_KEY', () => {
    expect(() =>
      validateConsumerEnv({
        ...BASE_ENV,
        AI_PROVIDER: 'gemini',
        IMAGE_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'shared-key',
      }),
    ).not.toThrow();
  });
});

describe('validateConsumerEnv — AI_PROVIDER=openai validation', () => {
  it('accepts AI_PROVIDER=openai with OPENAI_API_KEY', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' }),
    ).not.toThrow();
  });

  it('throws when AI_PROVIDER=openai but OPENAI_API_KEY is missing', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, AI_PROVIDER: 'openai' }),
    ).toThrow('OPENAI_API_KEY is required when AI_PROVIDER=openai');
  });

  it('error message does not contain key value', () => {
    try {
      validateConsumerEnv({ ...BASE_ENV, AI_PROVIDER: 'openai' });
    } catch (err) {
      expect((err as Error).message).not.toMatch(/^sk-/);
    }
  });

  it('accepts optional OPENAI_TEXT_MODEL', () => {
    expect(() =>
      validateConsumerEnv({
        ...BASE_ENV,
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test',
        OPENAI_TEXT_MODEL: 'gpt-4o',
      }),
    ).not.toThrow();
  });
});

describe('validateConsumerEnv — IMAGE_PROVIDER=openai validation', () => {
  it('accepts IMAGE_PROVIDER=openai with OPENAI_API_KEY and OPENAI_IMAGE_MODEL', () => {
    expect(() =>
      validateConsumerEnv({
        ...BASE_ENV,
        IMAGE_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test',
        OPENAI_IMAGE_MODEL: 'gpt-image-2',
      }),
    ).not.toThrow();
  });

  it('throws when IMAGE_PROVIDER=openai but OPENAI_API_KEY is missing', () => {
    expect(() =>
      validateConsumerEnv({
        ...BASE_ENV,
        IMAGE_PROVIDER: 'openai',
        OPENAI_IMAGE_MODEL: 'gpt-image-2',
      }),
    ).toThrow('OPENAI_API_KEY is required when IMAGE_PROVIDER=openai');
  });

  it('throws when IMAGE_PROVIDER=openai but OPENAI_IMAGE_MODEL is missing', () => {
    expect(() =>
      validateConsumerEnv({ ...BASE_ENV, IMAGE_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' }),
    ).toThrow('OPENAI_IMAGE_MODEL is required when IMAGE_PROVIDER=openai');
  });
});

describe('validateConsumerEnv — OPENAI_API_KEY shared between text and image', () => {
  it('accepts AI_PROVIDER=openai and IMAGE_PROVIDER=openai with a single OPENAI_API_KEY', () => {
    expect(() =>
      validateConsumerEnv({
        ...BASE_ENV,
        AI_PROVIDER: 'openai',
        IMAGE_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-shared',
        OPENAI_IMAGE_MODEL: 'gpt-image-2',
      }),
    ).not.toThrow();
  });
});
