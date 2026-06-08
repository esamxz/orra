import { createMiddleware } from 'hono/factory';
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { Env } from '../env.js';
import { ApiError } from '../errors.js';
import type { AuthContext } from '../auth/types.js';
import { DEV_AUTH, UNAUTHENTICATED_AUTH } from '../auth/types.js';
import type { ClerkVerifier } from '../auth/verifier.js';
import { AuthBootstrapService } from '../services/authBootstrapService.js';
import {
  createServiceContext,
  getRepositories,
} from '../services/service-context.js';
import type { ServiceContextOverrides } from '../services/service-context.js';
import { getRequestId } from './request-id.js';

// ---------------------------------------------------------------------------
// Auth middleware factory
// ---------------------------------------------------------------------------
// Public paths are allowed without authentication.
// Protected paths require a valid Bearer token (Clerk JWT) or a dev-auth
// fallback when explicitly enabled in development.
//
// The middleware never leaks raw tokens in errors or logs.

const PUBLIC_PATHS = new Set(['/health', '/v1/health']);

export function getAuth(c: Context): AuthContext | undefined {
  return c.get('auth' as never);
}

function isDevAuthEnabled(env: Env): boolean {
  return env.DEV_AUTH_ENABLED === 'true' && (env.ENVIRONMENT === 'development' || !env.ENVIRONMENT);
}

export function createAuthMiddleware(
  verifier: ClerkVerifier,
  overrides?: ServiceContextOverrides
): MiddlewareHandler {
  return createMiddleware(
    async (c: Context, next: Next): Promise<void | Response> => {
      const env = c.env;

      // Allow CORS preflight without authentication.
      if (c.req.method === 'OPTIONS') {
        c.set('auth', UNAUTHENTICATED_AUTH);
        return next();
      }

      // Allow explicitly public paths without authentication.
      if (PUBLIC_PATHS.has(c.req.path)) {
        c.set('auth', UNAUTHENTICATED_AUTH);
        return next();
      }

      // Extract Bearer token.
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No token: try dev auth fallback, otherwise reject.
        if (isDevAuthEnabled(env)) {
          c.set('auth', DEV_AUTH);
          return next();
        }
        throw new ApiError('UNAUTHENTICATED', 'Authentication required.');
      }

      const token = authHeader.slice(7);

      // Do not log the raw token.
      const result = await verifier.verifyToken(token, env);

      if (result.ok) {
        const requestId = getRequestId(c) || 'unknown';
        const serviceCtx = createServiceContext(c.env as Env, requestId, undefined, overrides);

        try {
          const repos = getRepositories(serviceCtx);
          const bootstrapService = new AuthBootstrapService(repos.user, repos.workspace);
          const bootstrapResult = await bootstrapService.bootstrap({
            clerkUserId: result.clerkUserId,
            email: result.email ?? null,
            displayName: result.displayName ?? null,
          });

          const authContext: AuthContext = {
            isAuthenticated: true,
            clerkUserId: result.clerkUserId,
            userId: bootstrapResult.userId,
            workspaceId: bootstrapResult.workspaceId,
            role: bootstrapResult.role,
            authSource: 'clerk',
          };
          c.set('auth', authContext);
        } catch (err) {
          // If the DB is not configured, getRepositories throws INTERNAL.
          // Surface a safe message without leaking env details.
          if (err instanceof ApiError && err.code === 'INTERNAL') {
            throw new ApiError('INTERNAL', 'Authentication bootstrap failed.');
          }
          throw err;
        }

        return next();
      }

      // Clerk verification failed: try dev auth fallback, otherwise reject.
      if (isDevAuthEnabled(env)) {
        c.set('auth', DEV_AUTH);
        return next();
      }

      throw new ApiError('UNAUTHENTICATED', 'Invalid or expired token.');
    }
  );
}
