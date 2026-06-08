import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import type { Env } from '../env.js';
import { createAuthMiddleware, getAuth } from '../middleware/auth.js';
import {
  createFakeVerifier,
  createTestVerifier,
  createLocalJWKSet,
} from '../auth/verifier.js';
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
  userId?: string;
  workspaceId?: string;
  role?: string;
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
    // Use the real production verifier (not the fake one)
    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.use(createAuthMiddleware((await import('../auth/verifier.js')).createProductionVerifier()));
    app.get('/protected', (c) => c.json({ ok: true }));
    app.onError(errorHandler);

    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    // Real production verifier requires CLERK_JWKS_URL; without it the
    // verifier rejects and dev auth does not kick in in production.
    expect(res.status).toBe(401);
    const json = await res.json() as AuthResponse;
    expect(json.error.code).toBe('UNAUTHENTICATED');
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

describe('auth middleware — production verifier with local keys', () => {
  let privateKey: CryptoKey;
  let publicJwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    publicJwk = await exportJWK(pair.publicKey);
    publicJwk.kid = 'test-key-1';
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    publicJwk.key_ops = ['verify'];
  });

  async function signToken(sub: string, expiry?: string): Promise<string> {
    const jwt = new SignJWT({ sub })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuedAt()
      .setIssuer('https://test.clerk.dev')
      .setAudience('orra-api');

    if (expiry) {
      jwt.setExpirationTime(expiry);
    } else {
      jwt.setExpirationTime('1h');
    }

    return jwt.sign(privateKey);
  }

  function buildApp(envOverrides?: Partial<Env>) {
    const env = {
      ENVIRONMENT: 'production',
      CLERK_JWKS_URL: 'https://test.clerk.dev/.well-known/jwks.json',
      CLERK_JWT_ISSUER: 'https://test.clerk.dev',
      CLERK_AUDIENCE: 'orra-api',
      ...envOverrides,
    } as unknown as Env;

    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);

    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.use(createAuthMiddleware(verifier));
    app.get('/protected', (c) => {
      const auth = getAuth(c);
      return c.json({
        clerkUserId: auth?.clerkUserId,
        authSource: auth?.authSource,
        isAuthenticated: auth?.isAuthenticated,
        userId: auth?.userId,
        workspaceId: auth?.workspaceId,
        role: auth?.role,
      });
    });
    app.onError(errorHandler);
    return { app, env };
  }

  it('accepts a valid local JWT and sets AuthContext with clerkUserId', async () => {
    const { app, env } = buildApp();
    const token = await signToken('usr_clerk_123');
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      env as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = await res.json() as ProtectedResponse;
    expect(json.clerkUserId).toBe('usr_clerk_123');
    expect(json.authSource).toBe('clerk');
    expect(json.isAuthenticated).toBe(true);
  });

  it('leaves userId/workspaceId/role undefined in AuthContext', async () => {
    const { app, env } = buildApp();
    const token = await signToken('usr_clerk_123');
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      env as unknown as Record<string, unknown>
    );

    const json = await res.json() as ProtectedResponse;
    expect(json.userId).toBeUndefined();
    expect(json.workspaceId).toBeUndefined();
    expect(json.role).toBeUndefined();
  });

  it('rejects an expired local JWT', async () => {
    const { app, env } = buildApp();
    const token = await signToken('usr_expired', '-300s');
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      env as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = await res.json() as AuthResponse;
    expect(json.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a token signed with a different key', async () => {
    const otherPair = await generateKeyPair('RS256', { extractable: true });
    const token = await new SignJWT({ sub: 'usr_other_key' })
      .setProtectedHeader({ alg: 'RS256', kid: 'other-key' })
      .setIssuedAt()
      .setIssuer('https://test.clerk.dev')
      .setAudience('orra-api')
      .setExpirationTime('1h')
      .sign(otherPair.privateKey);

    const { app, env } = buildApp();
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      env as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = await res.json() as AuthResponse;
    expect(json.error.code).toBe('UNAUTHENTICATED');
  });

  it('does not expose the raw token in auth error responses', async () => {
    const { app, env } = buildApp();
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: 'Bearer bad-token-value' } },
      env as unknown as Record<string, unknown>
    );

    const text = await res.text();
    expect(text).not.toContain('bad-token-value');
  });
});
