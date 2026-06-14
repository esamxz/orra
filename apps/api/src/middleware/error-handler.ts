import type { Context, ErrorHandler } from 'hono';
import { isApiError, type ApiErrorCode } from '../errors.js';
import { captureApiError, trackBackendEvent } from '../lib/observability.js';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// Maps thrown errors to stable JSON responses.
// Does not leak stack traces in responses.

export function getRequestIdFromContext(c: Context): string | undefined {
  return c.get('requestId');
}

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = getRequestIdFromContext(c) || 'unknown';

  if (isApiError(err)) {
    const body = {
      ok: false as const,
      error: {
        code: err.code satisfies ApiErrorCode,
        message: err.message,
        requestId,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    if (err.status >= 500) {
      const env = c.env as Env | undefined;
      if (env) {
        captureApiError(err, { route: c.req.path, method: c.req.method, status: err.status, errorCode: err.code, requestId });
        trackBackendEvent(env, 'api_error_5xx', { status: err.status, errorCode: err.code, requestId });
      }
    }
    return c.json(body, err.status as Parameters<typeof c.json>[1]);
  }

  // Unknown errors: log stack internally, return generic INTERNAL
  console.error('Unhandled error:', err);
  const env = c.env as Env | undefined;
  if (env) {
    captureApiError(err, { route: c.req.path, method: c.req.method, status: 500, errorCode: 'INTERNAL', requestId });
    trackBackendEvent(env, 'api_error_5xx', { status: 500, errorCode: 'INTERNAL', requestId });
  }

  const isStaging = (c.env as { ENVIRONMENT?: string })?.ENVIRONMENT === 'staging';
  const message =
    isStaging && err instanceof Error ? err.message : 'An unexpected error occurred.';

  const body = {
    ok: false as const,
    error: {
      code: 'INTERNAL' as ApiErrorCode,
      message,
      requestId,
    },
  };

  return c.json(body, 500 as Parameters<typeof c.json>[1]);
};
