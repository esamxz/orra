import { Hono } from 'hono';
import type { Env } from '../env.js';
import { success } from '../response.js';

// ---------------------------------------------------------------------------
// Health route
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => {
  return success(c, {
    ok: true,
    service: 'orra-api',
    version: 'v1',
  });
});

export default app;
