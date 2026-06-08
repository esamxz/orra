import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware, getAuth } from '../middleware/auth.js';
import { createProductionVerifier } from '../auth/verifier.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';

type AuthResponse = {
  auth?: {
    clerkUserId: string;
    userId?: string;
    workspaceId?: string;
    role?: string;
    isAuthenticated: boolean;
    authSource: string;
  };
  hasAuth?: boolean;
};

function buildApp(_env: Record<string, unknown>) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(createAuthMiddleware(createProductionVerifier()));
  app.get('/protected', (c) => {
    const auth = getAuth(c);
    return c.json({ auth });
  });
  app.onError(errorHandler);
  return app;
}

describe('dev auth fallback', () => {
  it('provides dev auth in development when DEV_AUTH_ENABLED is true', async () => {
    const app = buildApp({ ENVIRONMENT: 'development', DEV_AUTH_ENABLED: 'true' });
    const res = await app.request('/protected', { method: 'GET' }, { ENVIRONMENT: 'development', DEV_AUTH_ENABLED: 'true' } as unknown as Record<string, unknown>);

    expect(res.status).toBe(200);
    const json = await res.json() as AuthResponse;
    expect(json.auth).toBeTruthy();
    expect(json.auth!.clerkUserId).toBe('usr_dev_stub');
    expect(json.auth!.userId).toBe('00000000-0000-0000-0000-000000000000');
    expect(json.auth!.workspaceId).toBe('00000000-0000-0000-0000-000000000000');
    expect(json.auth!.role).toBe('owner');
    expect(json.auth!.isAuthenticated).toBe(true);
    expect(json.auth!.authSource).toBe('dev');
  });

  it('does NOT provide dev auth when DEV_AUTH_ENABLED is missing', async () => {
    const app = buildApp({ ENVIRONMENT: 'development' });
    const res = await app.request('/protected', { method: 'GET' }, { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>);

    expect(res.status).toBe(401);
    const json = await res.json() as { ok: false; error: { code: string } };
    expect(json.error.code).toBe('UNAUTHENTICATED');
  });

  it('does NOT provide dev auth in production even if DEV_AUTH_ENABLED is true', async () => {
    const app = buildApp({ ENVIRONMENT: 'production', DEV_AUTH_ENABLED: 'true' });
    const res = await app.request('/protected', { method: 'GET' }, { ENVIRONMENT: 'production', DEV_AUTH_ENABLED: 'true' } as unknown as Record<string, unknown>);

    expect(res.status).toBe(401);
    const json = await res.json() as { ok: false; error: { code: string } };
    expect(json.error.code).toBe('UNAUTHENTICATED');
  });

  it('dev auth works even when Clerk JWKS is missing in development', async () => {
    const app = buildApp({ ENVIRONMENT: 'development', DEV_AUTH_ENABLED: 'true' });
    const res = await app.request(
      '/protected',
      { method: 'GET' },
      { ENVIRONMENT: 'development', DEV_AUTH_ENABLED: 'true' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = await res.json() as AuthResponse;
    expect(json.auth!.authSource).toBe('dev');
  });
});
