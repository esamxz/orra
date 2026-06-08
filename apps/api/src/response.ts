import type { Context } from 'hono';

// ---------------------------------------------------------------------------
// Success response helper
// ---------------------------------------------------------------------------

export function success<T>(c: Context, data: T, status = 200) {
  return c.json({ ok: true as const, data }, status as Parameters<typeof c.json>[1]);
}
