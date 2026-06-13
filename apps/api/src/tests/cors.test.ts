import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { corsMiddleware } from '../middleware/cors.js';

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use(corsMiddleware);
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('CORS middleware', () => {
  const app = makeApp();

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

describe('CORS middleware — environment-aware origin policy', () => {
  const app = makeApp();

  it('development env includes localhost origins', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'http://localhost:5173' } },
      { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('unset ENVIRONMENT (defaults to development) includes localhost origins', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'http://localhost:3000' } },
      {} as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
  });

  it('staging env does NOT include localhost origins', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'http://localhost:5173' } },
      { ENVIRONMENT: 'staging' } as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });

  it('production env does NOT include localhost origins', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'http://localhost:5173' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });

  it('staging env reflects configured ALLOWED_ORIGINS', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'https://app.orra.io' } },
      {
        ENVIRONMENT: 'staging',
        ALLOWED_ORIGINS: 'https://app.orra.io,https://staging.orra.io',
      } as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.orra.io');
  });

  it('staging env does not reflect unknown origin even with ALLOWED_ORIGINS set', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'https://evil.com' } },
      {
        ENVIRONMENT: 'staging',
        ALLOWED_ORIGINS: 'https://app.orra.io',
      } as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });

  it('staging env does not include localhost even when ALLOWED_ORIGINS is set', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'http://localhost:5173' } },
      {
        ENVIRONMENT: 'staging',
        ALLOWED_ORIGINS: 'https://app.orra.io',
      } as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });

  it('wildcard pattern matches single-segment subdomain', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'https://33e8803f.orra-web.pages.dev' } },
      {
        ENVIRONMENT: 'staging',
        ALLOWED_ORIGINS: 'https://orra-web.pages.dev,https://*.orra-web.pages.dev',
      } as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://33e8803f.orra-web.pages.dev'
    );
  });

  it('wildcard pattern does not match a different domain', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'https://evil.pages.dev' } },
      {
        ENVIRONMENT: 'staging',
        ALLOWED_ORIGINS: 'https://*.orra-web.pages.dev',
      } as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });

  it('wildcard pattern does not match multi-segment subdomain', async () => {
    const res = await app.request(
      '/test',
      { method: 'GET', headers: { origin: 'https://a.b.orra-web.pages.dev' } },
      {
        ENVIRONMENT: 'staging',
        ALLOWED_ORIGINS: 'https://*.orra-web.pages.dev',
      } as unknown as Record<string, unknown>
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });
});
