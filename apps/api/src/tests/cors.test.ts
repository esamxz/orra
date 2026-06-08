import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { corsMiddleware } from '../middleware/cors.js';

describe('CORS middleware', () => {
  const app = new Hono<{ Bindings: Env }>();
  app.use(corsMiddleware);
  app.get('/test', (c) => c.json({ ok: true }));

  it('preflight OPTIONS returns expected headers', async () => {
    const res = await app.request(
      '/test',
      {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:5173' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('reflects allowed origin on GET', async () => {
    const res = await app.request(
      '/test',
      {
        method: 'GET',
        headers: { origin: 'http://localhost:5173' },
      },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('does not set CORS headers for unknown origin', async () => {
    const res = await app.request(
      '/test',
      {
        method: 'GET',
        headers: { origin: 'https://evil.com' },
      },
      { ENVIRONMENT: 'development', ALLOWED_ORIGINS: '' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });
});
