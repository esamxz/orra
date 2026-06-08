import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

const env = { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>;

describe('health', () => {
  const app = createApp();

  it('GET /health returns ok', async () => {
    const res = await app.request('/health', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; data: { service: string; version: string } };
    expect(json.ok).toBe(true);
    expect(json.data.service).toBe('orra-api');
    expect(json.data.version).toBe('v1');
  });

  it('GET /v1/health returns ok', async () => {
    const res = await app.request('/v1/health', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; data: { service: string; version: string } };
    expect(json.ok).toBe(true);
    expect(json.data.service).toBe('orra-api');
    expect(json.data.version).toBe('v1');
  });

  it('response includes x-request-id', async () => {
    const res = await app.request('/health', { method: 'GET' }, env);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('preserves incoming x-request-id', async () => {
    const res = await app.request(
      '/health',
      { method: 'GET', headers: { 'x-request-id': 'req-abc-123' } },
      env
    );
    expect(res.headers.get('x-request-id')).toBe('req-abc-123');
  });
});
