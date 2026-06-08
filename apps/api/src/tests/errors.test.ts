import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { ApiError } from '../errors.js';
import { requestIdMiddleware } from '../middleware/request-id.js';

const env = { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>;

type ApiErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
};

describe('error handling', () => {
  it('unknown route returns stable NOT_FOUND error', async () => {
    const app = createApp();
    const res = await app.request('/does-not-exist', { method: 'GET' }, env);
    expect(res.status).toBe(404);
    const json = await res.json() as ApiErrorResponse;
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
    expect(json.error.message).toBe('Route not found.');
    expect(json.error.requestId).toBeTruthy();
  });

  it('thrown ApiError maps to expected HTTP status', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.get('/test-forbidden', () => {
      throw new ApiError('FORBIDDEN', 'Access denied');
    });
    app.onError((await import('../middleware/error-handler.js')).errorHandler);

    const res = await app.request('/test-forbidden', { method: 'GET' }, env);
    expect(res.status).toBe(403);
    const json = await res.json() as ApiErrorResponse;
    expect(json.error.code).toBe('FORBIDDEN');
    expect(json.error.message).toBe('Access denied');
  });

  it('thrown unknown error maps to INTERNAL without stack leak', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.get('/test-boom', () => {
      throw new Error('Something broke internally');
    });
    app.onError((await import('../middleware/error-handler.js')).errorHandler);

    const res = await app.request('/test-boom', { method: 'GET' }, env);
    expect(res.status).toBe(500);
    const json = await res.json() as ApiErrorResponse;
    expect(json.error.code).toBe('INTERNAL');
    expect(json.error.message).toBe('An unexpected error occurred.');
    // Stack trace must NOT leak
    expect(JSON.stringify(json)).not.toContain('at ');
    expect(JSON.stringify(json)).not.toContain('Something broke internally');
  });

  it('ApiError with details includes details field', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.get('/test-details', () => {
      throw new ApiError('VALIDATION', 'Bad input', { field: 'name' });
    });
    app.onError((await import('../middleware/error-handler.js')).errorHandler);

    const res = await app.request('/test-details', { method: 'GET' }, env);
    const json = await res.json() as ApiErrorResponse;
    expect(json.error.details).toEqual({ field: 'name' });
  });
});
