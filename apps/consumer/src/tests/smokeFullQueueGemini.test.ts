import { describe, it, expect } from 'vitest';
import {
  validateSmokeConfig,
  buildSafeConfigSummary,
} from '../scripts/smokeFullQueueGemini.js';

const validEnv: NodeJS.ProcessEnv = {
  ORRA_SMOKE_FULL_QUEUE: '1',
  AI_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'test-api-key-value',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  ENVIRONMENT: 'staging',
};

describe('validateSmokeConfig', () => {
  it('throws if ORRA_SMOKE_FULL_QUEUE is not set', () => {
    const env = { ...validEnv };
    delete env['ORRA_SMOKE_FULL_QUEUE'];
    expect(() => validateSmokeConfig(env)).toThrow('ORRA_SMOKE_FULL_QUEUE=1');
  });

  it('throws if ENVIRONMENT is production', () => {
    const env = { ...validEnv, ENVIRONMENT: 'production' };
    expect(() => validateSmokeConfig(env)).toThrow('production');
  });

  it('throws if AI_PROVIDER is not gemini', () => {
    const env = { ...validEnv, AI_PROVIDER: 'fake' };
    expect(() => validateSmokeConfig(env)).toThrow('AI_PROVIDER=gemini');
  });

  it('throws if GEMINI_API_KEY is missing', () => {
    const env = { ...validEnv };
    delete env['GEMINI_API_KEY'];
    expect(() => validateSmokeConfig(env)).toThrow('GEMINI_API_KEY');
  });

  it('throws if SUPABASE_URL is missing', () => {
    const env = { ...validEnv };
    delete env['SUPABASE_URL'];
    expect(() => validateSmokeConfig(env)).toThrow('SUPABASE_URL');
  });

  it('throws if SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const env = { ...validEnv };
    delete env['SUPABASE_SERVICE_ROLE_KEY'];
    expect(() => validateSmokeConfig(env)).toThrow('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('does not throw when all required vars are present', () => {
    expect(() => validateSmokeConfig(validEnv)).not.toThrow();
  });
});

describe('buildSafeConfigSummary', () => {
  it('output never contains the API key value', () => {
    const summary = buildSafeConfigSummary(validEnv);
    expect(summary).not.toContain('test-api-key-value');
  });

  it('reports gemini_key_present: true when key is set', () => {
    const summary = buildSafeConfigSummary(validEnv);
    expect(summary).toContain('gemini_key_present: true');
  });

  it('reports gemini_key_present: false when key is absent', () => {
    const env = { ...validEnv };
    delete env['GEMINI_API_KEY'];
    const summary = buildSafeConfigSummary(env);
    expect(summary).toContain('gemini_key_present: false');
  });

  it('includes provider and environment in summary', () => {
    const summary = buildSafeConfigSummary(validEnv);
    expect(summary).toContain('provider: gemini');
    expect(summary).toContain('environment: staging');
  });
});
