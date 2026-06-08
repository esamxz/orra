import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';

// ---------------------------------------------------------------------------
// Request ID middleware
// ---------------------------------------------------------------------------
// - Reads incoming x-request-id if present
// - Otherwise generates a safe request ID
// - Sets it in context and returns it in x-request-id header

const REQUEST_ID_HEADER = 'x-request-id';

export function getRequestId(c: Context): string | undefined {
  return c.get('requestId');
}

function generateRequestId(): string {
  // crypto.randomUUID is available in Cloudflare Workers
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for test environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const requestIdMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const incoming = c.req.header(REQUEST_ID_HEADER);
  const requestId = incoming || generateRequestId();
  c.set('requestId', requestId);
  await next();
  c.header(REQUEST_ID_HEADER, requestId);
});
