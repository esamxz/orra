import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks so vi.mock factories can reference them
// ---------------------------------------------------------------------------
const { mockCaptureException, mockCapture, mockPostHogConstructor } = vi.hoisted(() => {
  const mockCapture = vi.fn();
  const mockShutdown = vi.fn().mockResolvedValue(undefined);
  const mockPostHogConstructor = vi.fn().mockImplementation(() => ({
    capture: mockCapture,
    shutdown: mockShutdown,
  }));
  const mockCaptureException = vi.fn();
  return { mockCaptureException, mockCapture, mockPostHogConstructor };
});

vi.mock('@sentry/cloudflare', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  withSentry: (_cb: unknown, handler: unknown) => handler,
}));

vi.mock('posthog-node', () => ({ PostHog: mockPostHogConstructor }));

import {
  isObservabilityEnabled,
  captureApiError,
  trackBackendEvent,
  scrubSentryEvent,
} from '../observability.js';
import type { Env } from '../../env.js';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: 'development',
    OBSERVABILITY_ENABLED: 'true',
    SENTRY_DSN: 'https://abc@sentry.io/1',
    POSTHOG_PROJECT_TOKEN: 'ph_test_token',
    ...overrides,
  } as Env;
}

describe('isObservabilityEnabled', () => {
  it('returns false when OBSERVABILITY_ENABLED is missing', () => {
    expect(isObservabilityEnabled({ OBSERVABILITY_ENABLED: undefined, SENTRY_DSN: 'https://...' })).toBe(false);
  });

  it('returns false when SENTRY_DSN is missing', () => {
    expect(isObservabilityEnabled({ OBSERVABILITY_ENABLED: 'true', SENTRY_DSN: undefined })).toBe(false);
  });

  it('returns true when both are set', () => {
    expect(isObservabilityEnabled({ OBSERVABILITY_ENABLED: 'true', SENTRY_DSN: 'https://abc@sentry.io/1' })).toBe(true);
  });
});

describe('captureApiError', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls captureException with safe tags', () => {
    const err = new Error('something failed');
    captureApiError(err, { route: '/v1/prompts/enhance', method: 'POST', status: 500, errorCode: 'INTERNAL', requestId: 'req-abc' });
    expect(mockCaptureException).toHaveBeenCalledWith(err, {
      tags: { route: '/v1/prompts/enhance', method: 'POST', status: 500, errorCode: 'INTERNAL', requestId: 'req-abc' },
    });
  });

  it('does not throw if captureException throws', () => {
    mockCaptureException.mockImplementationOnce(() => { throw new Error('sentry down'); });
    expect(() => captureApiError(new Error('test'), {})).not.toThrow();
  });
});

describe('trackBackendEvent', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('is a no-op when OBSERVABILITY_ENABLED is missing', () => {
    const env = makeEnv({ OBSERVABILITY_ENABLED: undefined });
    trackBackendEvent(env, 'api_error_5xx', { status: 500 });
    expect(mockPostHogConstructor).not.toHaveBeenCalled();
  });

  it('is a no-op when POSTHOG_PROJECT_TOKEN is missing', () => {
    const env = makeEnv({ POSTHOG_PROJECT_TOKEN: undefined });
    trackBackendEvent(env, 'api_error_5xx', { status: 500 });
    expect(mockPostHogConstructor).not.toHaveBeenCalled();
  });

  it('captures event with safe properties only', () => {
    const env = makeEnv();
    trackBackendEvent(env, 'api_error_5xx', { status: 500, errorCode: 'INTERNAL' });
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'backend',
      event: 'api_error_5xx',
      properties: { status: 500, errorCode: 'INTERNAL' },
    });
  });

  it('does not throw if PostHog throws', () => {
    mockPostHogConstructor.mockImplementationOnce(() => { throw new Error('posthog down'); });
    const env = makeEnv();
    expect(() => trackBackendEvent(env, 'generation_job_failed', {})).not.toThrow();
  });
});

describe('scrubSentryEvent', () => {
  it('removes prompt from event extra', () => {
    const event = { extra: { prompt: 'secret prompt', safe: 'keep' } };
    const result = scrubSentryEvent(event);
    expect((result as typeof event).extra.prompt).toBe('[scrubbed]');
    expect((result as typeof event).extra.safe).toBe('keep');
  });

  it('removes r2Key and apiKey', () => {
    const event = { extra: { r2Key: 'assets/abc.png', apiKey: 'sk-secret' } };
    const result = scrubSentryEvent(event);
    expect((result as typeof event).extra.r2Key).toBe('[scrubbed]');
    expect((result as typeof event).extra.apiKey).toBe('[scrubbed]');
  });

  it('removes GEMINI_API_KEY and SUPABASE_SERVICE_ROLE_KEY', () => {
    const event = { extra: { GEMINI_API_KEY: 'ai-key', SUPABASE_SERVICE_ROLE_KEY: 'db-key' } };
    const result = scrubSentryEvent(event);
    const extra = (result as typeof event).extra;
    expect(extra.GEMINI_API_KEY).toBe('[scrubbed]');
    expect(extra.SUPABASE_SERVICE_ROLE_KEY).toBe('[scrubbed]');
  });

  it('removes signed URL values', () => {
    const event = {
      extra: { url: 'https://s3.example.com/key?X-Amz-Signature=abc', safe: 'https://app.com' },
    };
    const result = scrubSentryEvent(event);
    expect((result as typeof event).extra.url).toBe('[scrubbed]');
    expect((result as typeof event).extra.safe).toBe('https://app.com');
  });

  it('removes Bearer token values', () => {
    const event = {
      extra: { auth: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig', other: 'normal value' },
    };
    const result = scrubSentryEvent(event);
    expect((result as typeof event).extra.auth).toBe('[scrubbed]');
    expect((result as typeof event).extra.other).toBe('normal value');
  });
});
