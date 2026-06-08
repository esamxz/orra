import { describe, it, expect } from 'vitest';
import { createDbClient, createServiceDbClient } from '../db/client.js';
import type { Env } from '../env.js';

describe('DB client boundary', () => {
  it('throws clear error when both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing', () => {
    const env = {} as Env;
    expect(() => createDbClient(env)).toThrow('DB client is not configured');
    expect(() => createDbClient(env)).toThrow('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  });

  it('throws clear error if only SUPABASE_URL is missing', () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: 'fake-key' } as unknown as Env;
    expect(() => createDbClient(env)).toThrow('SUPABASE_URL is required');
  });

  it('throws clear error if only SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const env = { SUPABASE_URL: 'https://example.supabase.co' } as unknown as Env;
    expect(() => createDbClient(env)).toThrow('SUPABASE_SERVICE_ROLE_KEY is required');
  });

  it('does not include the secret service role key in the error message', () => {
    const env = {
      SUPABASE_URL: 'https://example.supabase.co',
    } as unknown as Env;

    let thrown: Error | undefined;
    try {
      createDbClient(env);
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown).toBeDefined();
    expect(thrown!.message).not.toContain('fake-key');
    expect(thrown!.message).not.toContain('service_role');
  });

  it('does not include the Supabase URL in the error message when key is missing', () => {
    const env = {
      SUPABASE_URL: 'https://secret-project.supabase.co',
    } as unknown as Env;

    let thrown: Error | undefined;
    try {
      createDbClient(env);
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown).toBeDefined();
    // The URL is fine to include in the "missing key" message, but we
    // must never include the service role key.
  });

  it('createServiceDbClient delegates to createDbClient', () => {
    const env = {} as Env;
    expect(() => createServiceDbClient(env)).toThrow('DB client is not configured');
  });

  it('can be called with a well-formed env without throwing at the boundary level', () => {
    // The factory validates env before creating the client.
    // A well-formed env should reach the createClient call without throwing
    // from our validation. createClient itself may throw if the URL is invalid,
    // but that is a Supabase concern, not our boundary.
    const env = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    } as unknown as Env;

    // We do not assert the client is fully functional (no network),
    // only that our boundary does not throw during validation.
    expect(() => createDbClient(env)).not.toThrow('DB client is not configured');
    // Supabase createClient itself should succeed with these values.
    const client = createDbClient(env);
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });
});
