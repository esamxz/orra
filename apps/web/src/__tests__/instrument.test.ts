// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ErrorEvent, Breadcrumb } from '@sentry/react';

// ---------------------------------------------------------------------------
// Mock @sentry/react before importing instrument
// ---------------------------------------------------------------------------
const mockInit = vi.fn();
const mockBrowserTracingIntegration = vi.fn(() => ({ name: 'BrowserTracing' }));
const mockReplayIntegration = vi.fn(() => ({ name: 'Replay' }));

vi.mock('@sentry/react', () => ({
  init: mockInit,
  browserTracingIntegration: mockBrowserTracingIntegration,
  replayIntegration: mockReplayIntegration,
  reactErrorHandler: vi.fn(() => () => {}),
}));

describe('Sentry instrument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('Sentry.init() is NOT called when VITE_SENTRY_DSN is absent', async () => {
    vi.stubEnv('VITE_OBSERVABILITY_ENABLED', 'true');
    vi.stubEnv('VITE_SENTRY_DSN', '');
    await import('../instrument.js');
    expect(mockInit).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('Sentry.init() is NOT called when VITE_OBSERVABILITY_ENABLED is not "true"', async () => {
    vi.stubEnv('VITE_OBSERVABILITY_ENABLED', 'false');
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
    await import('../instrument.js');
    expect(mockInit).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe('scrubSentryEvent', () => {
  it('removes prompt and enhancedPrompt from event.extra', async () => {
    const { scrubSentryEvent } = await import('../instrument.js');
    const event = {
      extra: { prompt: 'my prompt text', enhancedPrompt: 'enhanced text', safeField: 'keep me' },
    } as unknown as ErrorEvent;
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed?.extra?.prompt).toBe('[scrubbed]');
    expect(scrubbed?.extra?.enhancedPrompt).toBe('[scrubbed]');
    expect(scrubbed?.extra?.safeField).toBe('keep me');
  });

  it('removes r2Key and apiKey from event.extra', async () => {
    const { scrubSentryEvent } = await import('../instrument.js');
    const event = {
      extra: { r2Key: 'assets/abc/file.png', apiKey: 'sk-secret-key' },
    } as unknown as ErrorEvent;
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed?.extra?.r2Key).toBe('[scrubbed]');
    expect(scrubbed?.extra?.apiKey).toBe('[scrubbed]');
  });

  it('removes signed URL values from request headers', async () => {
    const { scrubSentryEvent } = await import('../instrument.js');
    const event = {
      request: {
        headers: {
          Authorization: 'Bearer my-token',
          'X-Custom': 'safe-value',
        },
      },
    } as unknown as ErrorEvent;
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed?.request?.headers?.['Authorization']).toBe('[scrubbed]');
    expect(scrubbed?.request?.headers?.['X-Custom']).toBe('safe-value');
  });

  it('scrubs signed URLs matching X-Amz pattern', async () => {
    const { scrubSentryEvent } = await import('../instrument.js');
    const event = {
      request: {
        headers: {
          referer: 'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=abc',
          host: 'myapp.com',
        },
      },
    } as unknown as ErrorEvent;
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed?.request?.headers?.['referer']).toBe('[scrubbed]');
    expect(scrubbed?.request?.headers?.['host']).toBe('myapp.com');
  });

  it('scrubs breadcrumb data containing sensitive keys', async () => {
    const { scrubSentryEvent } = await import('../instrument.js');
    const breadcrumbs: Breadcrumb[] = [
      { type: 'http', data: { prompt: 'should be scrubbed', url: '/api/enhance' } },
      { type: 'navigation', data: { to: '/dashboard' } },
    ];
    const event = { breadcrumbs } as unknown as ErrorEvent;
    const scrubbed = scrubSentryEvent(event);
    const scrubBreadcrumbs = scrubbed?.breadcrumbs as Breadcrumb[] | undefined;
    expect(scrubBreadcrumbs?.[0]?.data?.prompt).toBe('[scrubbed]');
    expect(scrubBreadcrumbs?.[0]?.data?.url).toBe('/api/enhance');
    expect(scrubBreadcrumbs?.[1]?.data?.to).toBe('/dashboard');
  });

  it('returns event unchanged when no sensitive data present', async () => {
    const { scrubSentryEvent } = await import('../instrument.js');
    const event = {
      extra: { userId: 'ws-123', environment: 'staging' },
    } as unknown as ErrorEvent;
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed?.extra?.userId).toBe('ws-123');
    expect(scrubbed?.extra?.environment).toBe('staging');
  });
});
