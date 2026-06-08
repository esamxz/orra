import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// DB client boundary stub
// ---------------------------------------------------------------------------
// Future services should not import raw Supabase clients everywhere.
// This is a placeholder until the real Supabase connection phase.
//
// TODO: Replace with real Supabase client creation when persistence phase begins.

export interface DbClient {
  // Placeholder interface for future query methods
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;
}

export function createDbClient(env: Env): DbClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'DB client is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.' +
      ' This phase is a stub; real queries come in a future phase.'
    );
  }

  // Placeholder: real implementation will create a Supabase client here.
  return {
    query: async <T>(_sql: string, _params?: unknown[]) => {
      throw new Error('DbClient.query is not implemented yet.') as unknown as Promise<T[]>;
    },
  } as DbClient;
}

export function createServiceDbClient(env: Env): DbClient {
  return createDbClient(env);
}
