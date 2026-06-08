import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { devAuthMiddleware, getAuth } from '../middleware/dev-auth.js';

type AuthResponse = {
  auth?: {
    userId: string;
    clerkUserId: string;
    workspaceId: string;
    role: string;
    isAuthenticated: boolean;
  };
  hasAuth?: boolean;
};

describe('dev auth stub', () => {
  it('produces AuthContext in development env', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(devAuthMiddleware);
    app.get('/test', (c) => {
      const auth = getAuth(c);
      return c.json({ auth });
    });

    const devEnv = { ENVIRONMENT: 'development' } as unknown as Record<string, unknown>;
    const res = await app.request('/test', { method: 'GET' }, devEnv);
    const json = await res.json() as AuthResponse;

    expect(json.auth).toBeTruthy();
    expect(json.auth!.userId).toBe('00000000-0000-0000-0000-000000000000');
    expect(json.auth!.clerkUserId).toBe('usr_dev_stub');
    expect(json.auth!.workspaceId).toBe('00000000-0000-0000-0000-000000000000');
    expect(json.auth!.role).toBe('owner');
    expect(json.auth!.isAuthenticated).toBe(true);
  });

  it('does NOT produce AuthContext in production env', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(devAuthMiddleware);
    app.get('/test', (c) => {
      const auth = getAuth(c);
      return c.json({ hasAuth: !!auth });
    });

    const prodEnv = { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>;
    const res = await app.request('/test', { method: 'GET' }, prodEnv);
    const json = await res.json() as AuthResponse;

    expect(json.hasAuth).toBe(false);
  });
});
