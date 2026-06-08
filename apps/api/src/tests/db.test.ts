import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client.js';
import type { Env } from '../env.js';

describe('DB client boundary', () => {
  it('does not require real Supabase env for instantiation attempt', () => {
    // The boundary exists and is callable with a minimal env,
    // but throws a clear error when unconfigured.
    const minimalEnv = {} as Env;
    expect(() => createDbClient(minimalEnv)).toThrow(
      'DB client is not configured'
    );
  });

  it('throws clear error if SUPABASE_URL is missing', () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: 'fake-key' } as unknown as Env;
    expect(() => createDbClient(env)).toThrow('DB client is not configured');
  });

  it('throws clear error if SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const env = { SUPABASE_URL: 'https://example.supabase.co' } as unknown as Env;
    expect(() => createDbClient(env)).toThrow('DB client is not configured');
  });
});
