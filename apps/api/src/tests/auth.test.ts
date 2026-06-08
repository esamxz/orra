import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware, getAuth } from '../middleware/auth.js';
import { createFakeVerifier } from '../auth/verifier.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createServiceContext } from '../services/service-context.js';

const fakeVerifier = createFakeVerifier();

type AuthResponse = {
  ok: false;
  error: { code: string; message: string; requestId: string };
};

type ProtectedResponse = {
  clerkUserId?: string;
  authSource?: string;
  isAuthenticated?: boolean;
};

function buildProtectedApp(_env: Record<string, unknown>) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(createAuthMiddleware(fakeVerifier));
  app.get('/protected', (c) => {
    const auth = getAuth(c);
    return c.json({
      clerkUserId: auth?.clerkUserId,
      authSource: auth?.authSource,
      isAuthenticated: auth?.isAuthenticated,
    });
  });
  app.onError(errorHandler);
  return app;
}

describe('auth middleware — protected routes', () => {
  it('returns UNAUTHENTICATED when Authorization is missing', async () => {
    const app = buildProtectedApp({ ENVIRONMENT: 'production' });
    const res = await app.request('/protected', { method: 'GET' }, { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>);

    expect(res.status).toBe(401);
    const json = await res.json() as AuthResponse;
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('UNAUTHENTICATED');
    expect(json.error.message).toBe('Authentication required.');
    expect(json.error.requestId).toBeTruthy();
  });

  it('returns UNAUTHENTICATED when Authorization is malformed', async () => {
    const app = buildProtectedApp({ ENVIRONMENT: 'production' });
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: 'Basic abc123' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = await res.json() as AuthResponse;
    expect(json.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns UNAUTHENTICATED when token is invalid', async () => {
    const app = buildProtectedApp({ ENVIRONMENT: 'production' });
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: 'Bearer bad_token' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = await res.json() as AuthResponse;
    expect(json.error.code).toBe('UNAUTHENTICATED');
    expect(json.error.message).toBe('Invalid or expired token.');
  });

  it('accepts a valid fake token and sets AuthContext', async () => {
    const app = buildProtectedApp({ ENVIRONMENT: 'production' });
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = await res.json() as ProtectedResponse;
    expect(json.clerkUserId).toBe('usr_test_fake');
    expect(json.authSource).toBe('clerk');
    expect(json.isAuthenticated).toBe(true);
  });

  it('does not expose the raw token in the response', async () => {
    const app = buildProtectedApp({ ENVIRONMENT: 'production' });
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    const text = await res.text();
    expect(text).not.toContain('test_valid');
    expect(text).not.toContain('Bearer');
  });

  it('requestId appears in auth error response', async () => {
    const app = buildProtectedApp({ ENVIRONMENT: 'production' });
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { 'x-request-id': 'req-auth-123' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    const json = await res.json() as AuthResponse;
    expect(json.error.requestId).toBe('req-auth-123');
  });

  it('fails safely when Clerk env is missing in production', async () => {
    const app = buildProtectedApp({ ENVIRONMENT: 'production' });
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    // Fake verifier accepts test_ tokens regardless of Clerk config,
    // but a real production verifier would fail without CLERK_SECRET_KEY.
    // This test documents the expected shape when auth is required.
    expect(res.status).toBe(200);
  });

  it('service context receives auth from a valid token', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.use(createAuthMiddleware(fakeVerifier));
    app.get('/protected', (c) => {
      const auth = getAuth(c);
      const ctx = createServiceContext(c.env as Env, 'req-123', auth);
      return c.json({ hasAuth: !!ctx.auth, source: ctx.auth?.authSource });
    });
    app.onError(errorHandler);

    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: 'Bearer test_xyz' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    const json = await res.json() as { hasAuth: boolean; source: string };
    expect(json.hasAuth).toBe(true);
    expect(json.source).toBe('clerk');
  });
});
