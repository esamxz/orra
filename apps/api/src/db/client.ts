import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// DB client boundary
// ---------------------------------------------------------------------------
// All Supabase client creation is centralized here. No other file in the
// API should import @supabase/supabase-js directly.
//
// The factory validates required env variables before creating the client,
// fails clearly if they are missing, and never leaks the service role key
// in error messages.
//
// For tests, a fake client can be injected via createServiceContext overrides.

export type DbClient = SupabaseClient;

export interface DbClientConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

function validateDbEnv(env: Env): DbClientConfig {
  const missing: string[] = [];
  if (!env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `DB client is not configured: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} required.`
    );
  }

  // After the guard above, these are guaranteed strings.
  return {
    supabaseUrl: env.SUPABASE_URL!,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

/**
 * Create a real Supabase service-role client.
 * This should only be called from the service context factory or from
 * route handlers that actually need DB access. Health routes must not
 * require this.
 */
export function createDbClient(env: Env): DbClient {
  const config = validateDbEnv(env);

  // Service role key is intentionally omitted from any logged output.
  const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      // Service role client does not need auto-refresh.
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}

/**
 * Alias for createDbClient. Future phases may add a read-only replica
 * variant; this name signals that the caller expects full read/write.
 */
export function createServiceDbClient(env: Env): DbClient {
  return createDbClient(env);
}
