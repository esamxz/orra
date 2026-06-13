import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware, getAuth } from '../middleware/auth.js';
import type { ClerkVerifier, ClerkVerifyResponse } from '../auth/verifier.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import type { Repositories } from '../repositories/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmailVerifier(email: string): ClerkVerifier {
  return {
    async verifyToken(token: string): Promise<ClerkVerifyResponse> {
      if (token.startsWith('test_')) {
        return { ok: true, clerkUserId: 'usr_test', email, displayName: 'Test User' };
      }
      return { ok: false, reason: 'Invalid test token.' };
    },
  };
}

function createFakeRepos(): Repositories {
  return {
    user: {
      findByClerkId: async () => null,
      createFromClerkIdentity: async () => ({
        id: 'user-alpha-1',
        clerk_id: 'usr_test',
        email: 'test@example.com',
        display_name: 'Test User',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
    },
    workspace: {
      findPersonalWorkspaceForUser: async () => null,
      createPersonalWorkspace: async () => ({
        id: 'ws-alpha-1',
        name: "Test User's Workspace",
        type: 'personal',
        owner_user_id: 'user-alpha-1',
        plan: 'free',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
      ensurePersonalWorkspaceForUser: async () => ({
        workspaceId: 'ws-alpha-1',
        role: 'owner' as const,
        isNew: false,
      }),
    },
    project: {},
    artifact: {},
    chat: {},
    brandSystem: {},
  } as unknown as Repositories;
}

function buildApp(verifier: ClerkVerifier, repos: Repositories) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(createAuthMiddleware(verifier, { repositories: repos }));
  app.get('/protected', (c) => {
    const auth = getAuth(c);
    return c.json({ ok: true, clerkUserId: auth?.clerkUserId });
  });
  app.onError(errorHandler);
  return app;
}

function makeEnv(allowlist?: string): Record<string, unknown> {
  return {
    ENVIRONMENT: 'staging',
    ...(allowlist !== undefined ? { PRIVATE_ALPHA_EMAIL_ALLOWLIST: allowlist } : {}),
  } as unknown as Record<string, unknown>;
}

const TOKEN = 'test_valid';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('private-alpha allowlist', () => {
  it('allows any Clerk user when allowlist is not set', async () => {
    const app = buildApp(createEmailVerifier('anyone@example.com'), createFakeRepos());
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } },
      makeEnv()
    );
    expect(res.status).toBe(200);
  });

  it('allows user whose email is in the allowlist', async () => {
    const app = buildApp(createEmailVerifier('allowed@example.com'), createFakeRepos());
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } },
      makeEnv('allowed@example.com,other@example.com')
    );
    expect(res.status).toBe(200);
  });

  it('rejects user whose email is not in the allowlist', async () => {
    const app = buildApp(createEmailVerifier('stranger@example.com'), createFakeRepos());
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } },
      makeEnv('allowed@example.com')
    );
    expect(res.status).toBe(403);
    const json = await res.json() as { ok: false; error: { code: string; message: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(json.error.message).toBe('Access restricted to authorized users.');
  });

  it('email comparison is case-insensitive', async () => {
    const app = buildApp(createEmailVerifier('User@Example.COM'), createFakeRepos());
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } },
      makeEnv('user@example.com')
    );
    expect(res.status).toBe(200);
  });

  it('allows when one of multiple allowlist emails matches', async () => {
    const app = buildApp(createEmailVerifier('third@example.com'), createFakeRepos());
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } },
      makeEnv('first@example.com,second@example.com,third@example.com')
    );
    expect(res.status).toBe(200);
  });

  it('rejects when allowlist is set but user email does not appear in it', async () => {
    const app = buildApp(createEmailVerifier('notlisted@example.com'), createFakeRepos());
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } },
      makeEnv('first@example.com,second@example.com')
    );
    expect(res.status).toBe(403);
  });

  it('allows when allowlist is empty string (treated as no restriction)', async () => {
    // Empty string is falsy in JS — allowlist check is skipped
    const app = buildApp(createEmailVerifier('anyone@example.com'), createFakeRepos());
    const res = await app.request(
      '/protected',
      { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } },
      makeEnv('')
    );
    expect(res.status).toBe(200);
  });
});
