import type { Env } from '../env.js';
import type { AuthContext, ResolvedAuthContext } from '../auth/types.js';
import type { DbClient } from '../db/client.js';
import type { Repositories } from '../repositories/types.js';
import { SupabaseUserRepository } from '../repositories/userRepository.js';
import { SupabaseWorkspaceRepository } from '../repositories/workspaceRepository.js';
import { SupabaseProjectRepository } from '../repositories/projectRepository.js';
import { SupabaseArtifactRepository } from '../repositories/artifactRepository.js';
import { SupabaseChatRepository } from '../repositories/chatRepository.js';

// ---------------------------------------------------------------------------
// Service context
// ---------------------------------------------------------------------------
// Carries cross-cutting concerns into service methods.
//
// - env: Cloudflare Worker env bindings
// - requestId: stable per-request identifier for tracing
// - auth: resolved identity (may be partial until workspace bootstrap)
// - db: optional Supabase client; created lazily or injected for tests
// - repositories: optional repository set; injected for tests or built from db
//
// Health routes should not require DB env, so db and repositories are
// optional and created only when a service asks for them.

export interface ServiceContext {
  env: Env;
  requestId: string;
  auth?: AuthContext;
  db?: DbClient;
  repositories?: Repositories;
}

export interface ServiceContextOverrides {
  db?: DbClient;
  repositories?: Repositories;
}

/**
 * Build a service context for the current request.
 *
 * If overrides are provided (e.g. in tests), they take precedence over
 * lazy creation. The env is always required.
 *
 * DB is NOT created eagerly. Callers that need a database client should
 * use getDbClient(context) which will lazily create one from env.
 */
export function createServiceContext(
  env: Env,
  requestId: string,
  auth?: AuthContext,
  overrides?: ServiceContextOverrides
): ServiceContext {
  return {
    env,
    requestId,
    auth,
    db: overrides?.db,
    repositories: overrides?.repositories,
  };
}

// ---------------------------------------------------------------------------
// Lazy DB access
// ---------------------------------------------------------------------------
// These helpers ensure DB creation is deferred until a service actually
// needs it, and that health routes never pay the Supabase creation cost.

import { createServiceDbClient } from '../db/client.js';
import { ApiError } from '../errors.js';

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

/**
 * Assert that the service context carries a fully-populated AuthContext.
 * Throws UNAUTHENTICATED when auth is missing.
 * Throws FORBIDDEN when workspace is missing (protected routes must
 * have completed workspace bootstrap).
 */
export function requireAuth(ctx: ServiceContext): ResolvedAuthContext {
  if (!ctx.auth?.isAuthenticated) {
    throw new ApiError('UNAUTHENTICATED', 'Authentication required.');
  }
  if (!ctx.auth.workspaceId) {
    throw new ApiError('FORBIDDEN', 'Workspace context is missing.');
  }
  return ctx.auth as ResolvedAuthContext;
}

/**
 * Return the DB client from the context, creating it lazily from env if
 * not already present. Throws INTERNAL if env is missing required DB config.
 */
export function getDbClient(ctx: ServiceContext): DbClient {
  if (ctx.db) {
    return ctx.db;
  }

  try {
    const client = createServiceDbClient(ctx.env);
    ctx.db = client;
    return client;
  } catch (err) {
    throw new ApiError(
      'INTERNAL',
      'Database client is not configured.',
      { reason: err instanceof Error ? err.message : String(err) }
    );
  }
}

/**
 * Return the repository set from the context, building it lazily from
 * the DB client if not already injected.
 */
export function getRepositories(ctx: ServiceContext): Repositories {
  if (ctx.repositories) {
    return ctx.repositories;
  }

  const db = getDbClient(ctx);
  const repos: Repositories = {
    user: new SupabaseUserRepository(db),
    workspace: new SupabaseWorkspaceRepository(db),
    project: new SupabaseProjectRepository(db),
    artifact: new SupabaseArtifactRepository(db),
    chat: new SupabaseChatRepository(db),
  };

  ctx.repositories = repos;
  return repos;
}
