import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// Dev auth stub
// ---------------------------------------------------------------------------
// Temporary until Clerk auth is implemented.
// In development/test environments, this sets a fake AuthContext so routes
// and services can assume an auth shape exists.
//
// TODO: Replace with Clerk JWT verification in a future phase.

export interface AuthContext {
  userId: string;
  clerkUserId: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'member';
  isAuthenticated: boolean;
}

export function getAuth(c: Context): AuthContext | undefined {
  return c.get('auth');
}

const DEV_AUTH: AuthContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  clerkUserId: 'usr_dev_stub',
  workspaceId: '00000000-0000-0000-0000-000000000000',
  role: 'owner',
  isAuthenticated: true,
};

export const devAuthMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const env = c.env as Env;
  const isDev = env.ENVIRONMENT === 'development' || !env.ENVIRONMENT;

  // Only apply dev auth in development/test contexts.
  // In production, auth must come from Clerk (future phase).
  if (isDev) {
    c.set('auth', DEV_AUTH);
  }

  await next();
});
