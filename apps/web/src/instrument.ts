import * as Sentry from '@sentry/react';

const SENSITIVE_KEYS = new Set(['prompt', 'enhancedPrompt', 'r2Key', 'apiKey', 'providerResponse', 'document']);
const SIGNED_URL_RE = /^https?:\/\/[^?]+\?[^&]*X-Amz/i;
const AUTH_HEADER_RE = /^Bearer /i;

function scrubStringRecord(obj: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k) || SIGNED_URL_RE.test(v) || AUTH_HEADER_RE.test(v)) {
      result[k] = '[scrubbed]';
    } else {
      result[k] = v;
    }
  }
  return result;
}

function scrubUnknownRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k)) {
      result[k] = '[scrubbed]';
    } else if (typeof v === 'string' && (SIGNED_URL_RE.test(v) || AUTH_HEADER_RE.test(v))) {
      result[k] = '[scrubbed]';
    } else {
      result[k] = v;
    }
  }
  return result;
}

export function scrubSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (event.extra) {
    event.extra = scrubUnknownRecord(event.extra as Record<string, unknown>);
  }
  if (event.request?.headers) {
    event.request.headers = scrubStringRecord(event.request.headers as Record<string, string>);
  }
  if (event.breadcrumbs && Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b: Sentry.Breadcrumb) => {
      if (b.data) b.data = scrubUnknownRecord(b.data as Record<string, unknown>);
      return b;
    });
  }
  return event;
}

const observabilityEnabled = import.meta.env.VITE_OBSERVABILITY_ENABLED === 'true';
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export const sentryEnabled = observabilityEnabled && !!sentryDsn;

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}
