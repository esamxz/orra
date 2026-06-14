import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks so vi.mock factories can reference them
// ---------------------------------------------------------------------------
const { mockCaptureException, mockCapture, mockShutdown, mockPostHogConstructor } = vi.hoisted(() => {
  const mockCapture = vi.fn();
  const mockShutdown = vi.fn().mockResolvedValue(undefined);
  const mockPostHogConstructor = vi.fn().mockImplementation(() => ({
    capture: mockCapture,
    shutdown: mockShutdown,
  }));
  const mockCaptureException = vi.fn();
  return { mockCaptureException, mockCapture, mockShutdown, mockPostHogConstructor };
});

vi.mock('@sentry/cloudflare', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  withSentry: (_cb: unknown, handler: unknown) => handler,
}));

vi.mock('posthog-node', () => ({ PostHog: mockPostHogConstructor }));

import {
  isConsumerObservabilityEnabled,
  captureConsumerError,
  trackConsumerEvent,
} from '../observability.js';
import type { ConsumerEnv } from '../../env.js';

function makeEnv(overrides: Partial<ConsumerEnv> = {}): ConsumerEnv {
  return {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ENVIRONMENT: 'development',
    OBSERVABILITY_ENABLED: 'true',
    SENTRY_DSN: 'https://abc@sentry.io/1',
    POSTHOG_PROJECT_TOKEN: 'ph_test',
    ...overrides,
  } as ConsumerEnv;
}

describe('isConsumerObservabilityEnabled', () => {
  it('returns false when OBSERVABILITY_ENABLED is missing', () => {
    expect(isConsumerObservabilityEnabled({ OBSERVABILITY_ENABLED: undefined, SENTRY_DSN: 'https://...' })).toBe(false);
  });

  it('returns false when SENTRY_DSN is missing', () => {
    expect(isConsumerObservabilityEnabled({ OBSERVABILITY_ENABLED: 'true', SENTRY_DSN: undefined })).toBe(false);
  });

  it('returns true when both are set', () => {
    expect(isConsumerObservabilityEnabled({ OBSERVABILITY_ENABLED: 'true', SENTRY_DSN: 'https://abc@sentry.io/1' })).toBe(true);
  });
});

describe('captureConsumerError', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends jobId, errorCode, and retryable — not prompt or API key', () => {
    const err = new Error('provider failed');
    captureConsumerError(err, {
      jobId: 'job-abc-123',
      errorCode: 'PROVIDER_ERROR',
      retryable: true,
    });
    expect(mockCaptureException).toHaveBeenCalledWith(err, {
      tags: { jobId: 'job-abc-123', errorCode: 'PROVIDER_ERROR', retryable: true },
    });
    // No prompt or API key in the call
    const callArgs = JSON.stringify(mockCaptureException.mock.calls);
    expect(callArgs).not.toContain('prompt');
    expect(callArgs).not.toContain('GEMINI_API_KEY');
  });

  it('does not throw if captureException throws (fail open)', () => {
    mockCaptureException.mockImplementationOnce(() => { throw new Error('sentry down'); });
    expect(() => captureConsumerError(new Error('test'), { jobId: 'job-1' })).not.toThrow();
  });
});

describe('trackConsumerEvent', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('is a no-op when OBSERVABILITY_ENABLED is missing', () => {
    const env = makeEnv({ OBSERVABILITY_ENABLED: undefined });
    trackConsumerEvent(env, 'generation_job_failed', { jobId: 'job-1' });
    expect(mockPostHogConstructor).not.toHaveBeenCalled();
  });

  it('is a no-op when POSTHOG_PROJECT_TOKEN is missing', () => {
    const env = makeEnv({ POSTHOG_PROJECT_TOKEN: undefined });
    trackConsumerEvent(env, 'generation_job_succeeded', { jobId: 'job-1' });
    expect(mockPostHogConstructor).not.toHaveBeenCalled();
  });

  it('tracks generation_job_succeeded with safe props', () => {
    const env = makeEnv();
    trackConsumerEvent(env, 'generation_job_succeeded', { jobId: 'job-abc' });
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'consumer',
      event: 'generation_job_succeeded',
      properties: { jobId: 'job-abc' },
    });
    const callArgs = JSON.stringify(mockCapture.mock.calls);
    expect(callArgs).not.toContain('prompt');
    expect(callArgs).not.toContain('GEMINI_API_KEY');
  });

  it('tracks generation_job_failed with errorCode but not prompt or API response', () => {
    const env = makeEnv();
    trackConsumerEvent(env, 'generation_job_failed', { jobId: 'job-abc', errorCode: 'PROVIDER_429' });
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'consumer',
      event: 'generation_job_failed',
      properties: { jobId: 'job-abc', errorCode: 'PROVIDER_429' },
    });
    const callArgs = JSON.stringify(mockCapture.mock.calls);
    expect(callArgs).not.toContain('apiResponse');
    expect(callArgs).not.toContain('imageBytes');
  });

  it('does not throw if PostHog throws (fail open — job processing continues)', () => {
    mockPostHogConstructor.mockImplementationOnce(() => { throw new Error('posthog down'); });
    const env = makeEnv();
    expect(() => trackConsumerEvent(env, 'generation_job_failed', { jobId: 'job-1' })).not.toThrow();
  });
});

describe('scrubSentryEvent', () => {
  it('removes prompt and GEMINI_API_KEY from events', async () => {
    const { scrubSentryEvent } = await import('../observability.js');
    const event = {
      extra: { prompt: 'secret prompt text', GEMINI_API_KEY: 'key-123', safe: 'keep' },
    };
    const result = scrubSentryEvent(event);
    const extra = (result as typeof event).extra;
    expect(extra.prompt).toBe('[scrubbed]');
    expect(extra.GEMINI_API_KEY).toBe('[scrubbed]');
    expect(extra.safe).toBe('keep');
  });
});
