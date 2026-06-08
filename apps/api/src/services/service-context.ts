import type { Env } from '../env.js';
import type { AuthContext } from '../auth/types.js';

// ---------------------------------------------------------------------------
// Service context skeleton
// ---------------------------------------------------------------------------
// Carries cross-cutting concerns into service methods.
// Future phases add: logger, real db client, rate limiter, etc.

export interface ServiceContext {
  env: Env;
  requestId: string;
  auth?: AuthContext;
  // db: DbClient;   // TODO: add when Supabase phase arrives
  // logger: Logger; // TODO: add when logging phase arrives
}

export function createServiceContext(
  env: Env,
  requestId: string,
  auth?: AuthContext
): ServiceContext {
  return {
    env,
    requestId,
    auth,
  };
}
