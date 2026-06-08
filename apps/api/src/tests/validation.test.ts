import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';
import { validateJson, validateQuery } from '../middleware/validate.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';

const env = { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>;

type ApiErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: { issues: Array<{ field: string; message: string }> };
  };
};

type ApiSuccessResponse = {
  ok: true;
  name?: string;
};

describe('validation', () => {
  it('Zod validation error maps to VALIDATION', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.post('/test', validateJson(z.object({ name: z.string().min(1) })), (c) => {
      return c.json({ ok: true });
    });
    app.onError(errorHandler);

    const res = await app.request(
      '/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json = await res.json() as ApiErrorResponse;
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION');
    expect(json.error.message).toBe('Invalid json');
    expect(Array.isArray(json.error.details?.issues)).toBe(true);
  });

  it('query validation error maps to VALIDATION', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.get('/test', validateQuery(z.object({ count: z.coerce.number().positive() })), (c) => {
      return c.json({ ok: true });
    });
    app.onError(errorHandler);

    const res = await app.request('/test?count=abc', { method: 'GET' }, env);

    expect(res.status).toBe(400);
    const json = await res.json() as ApiErrorResponse;
    expect(json.error.code).toBe('VALIDATION');
    expect(json.error.message).toBe('Invalid query');
  });

  it('valid JSON passes through and parsed data is usable', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.post('/test', validateJson(z.object({ name: z.string() })), (c) => {
      const body = c.req.valid('json');
      return c.json({ ok: true, name: body.name });
    });
    app.onError(errorHandler);

    const res = await app.request(
      '/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Orra' }),
      },
      env
    );

    expect(res.status).toBe(200);
    const json = await res.json() as ApiSuccessResponse;
    expect(json.ok).toBe(true);
    expect(json.name).toBe('Orra');
  });
});
