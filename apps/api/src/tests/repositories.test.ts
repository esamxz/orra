import { describe, it, expect } from 'vitest';
import type { DbClient } from '../db/client.js';
import type { Env } from '../env.js';
import type { AuthContext } from '../auth/types.js';
import {
  createServiceContext,
  getDbClient,
  getRepositories,
} from '../services/service-context.js';
import type { Repositories } from '../repositories/types.js';

describe('service context', () => {
  const env = { ENVIRONMENT: 'development' } as unknown as Env;
  const requestId = 'req-test-123';

  it('can be created without DB for public routes', () => {
    const ctx = createServiceContext(env, requestId);
    expect(ctx.env).toBe(env);
    expect(ctx.requestId).toBe(requestId);
    expect(ctx.db).toBeUndefined();
    expect(ctx.repositories).toBeUndefined();
  });

  it('can receive auth', () => {
    const auth: AuthContext = {
      isAuthenticated: true,
      clerkUserId: 'usr_test',
      authSource: 'clerk',
    };
    const ctx = createServiceContext(env, requestId, auth);
    expect(ctx.auth?.clerkUserId).toBe('usr_test');
  });

  it('can receive fake DB for tests', () => {
    const fakeDb = { from: () => ({}) } as unknown as DbClient;
    const ctx = createServiceContext(env, requestId, undefined, { db: fakeDb });
    expect(ctx.db).toBe(fakeDb);
  });

  it('can receive fake repositories for tests', () => {
    const fakeRepos = {
      user: { findByClerkId: async () => null, createFromClerkIdentity: async () => ({ id: 'u1' }) },
      workspace: { findPersonalWorkspaceForUser: async () => null, createPersonalWorkspace: async () => ({ id: 'w1' }) },
      project: {},
    } as unknown as Repositories;

    const ctx = createServiceContext(env, requestId, undefined, { repositories: fakeRepos });
    expect(ctx.repositories).toBe(fakeRepos);
  });

  describe('getDbClient', () => {
    it('returns injected fake DB without creating a real one', () => {
      const fakeDb = { from: () => ({}) } as unknown as DbClient;
      const ctx = createServiceContext(env, requestId, undefined, { db: fakeDb });
      const db = getDbClient(ctx);
      expect(db).toBe(fakeDb);
    });

    it('throws INTERNAL when env lacks DB config and no override is given', () => {
      const ctx = createServiceContext(env, requestId);
      expect(() => getDbClient(ctx)).toThrow('Database client is not configured');
      try {
        getDbClient(ctx);
      } catch (err) {
        expect((err as Error).message).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      }
    });

    it('caches the created DB client on the context', () => {
      const dbEnv = {
        ENVIRONMENT: 'development',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      } as unknown as Env;

      const ctx = createServiceContext(dbEnv, requestId);
      const db1 = getDbClient(ctx);
      const db2 = getDbClient(ctx);
      expect(db1).toBe(db2);
    });
  });

  describe('getRepositories', () => {
    it('returns injected fake repositories without creating a real DB', () => {
      const fakeRepos = {
        user: { findByClerkId: async () => null, createFromClerkIdentity: async () => ({ id: 'u1' }) },
        workspace: { findPersonalWorkspaceForUser: async () => null, createPersonalWorkspace: async () => ({ id: 'w1' }) },
        project: {},
      } as unknown as Repositories;

      const ctx = createServiceContext(env, requestId, undefined, { repositories: fakeRepos });
      const repos = getRepositories(ctx);
      expect(repos).toBe(fakeRepos);
    });

    it('builds stub repositories lazily when no override is given', () => {
      const dbEnv = {
        ENVIRONMENT: 'development',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      } as unknown as Env;

      const ctx = createServiceContext(dbEnv, requestId);
      const repos = getRepositories(ctx);
      expect(repos).toBeDefined();
      expect(repos.user).toBeDefined();
      expect(repos.workspace).toBeDefined();
      expect(repos.project).toBeDefined();
    });

    it('caches the repository set on the context', () => {
      const dbEnv = {
        ENVIRONMENT: 'development',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      } as unknown as Env;

      const ctx = createServiceContext(dbEnv, requestId);
      const repos1 = getRepositories(ctx);
      const repos2 = getRepositories(ctx);
      expect(repos1).toBe(repos2);
    });
  });
});

describe('repository instantiation', () => {
  it('getRepositories builds real UserRepository and WorkspaceRepository', () => {
    const dbEnv = {
      ENVIRONMENT: 'development',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    } as unknown as Env;

    const ctx = createServiceContext(dbEnv, 'req-test');
    const repos = getRepositories(ctx);

    expect(repos.user).toBeDefined();
    expect(repos.workspace).toBeDefined();
    expect(repos.project).toBeDefined();
    // Real repositories should not throw on these method calls when backed
    // by a real DB client (the client itself won't connect without network).
    // We verify they are the real classes by checking constructor names.
    expect(repos.user.constructor.name).toBe('SupabaseUserRepository');
    expect(repos.workspace.constructor.name).toBe('SupabaseWorkspaceRepository');
  });

  it('UserRepository stub still exists for tests that need it', async () => {
    const { StubUserRepository } = await import('../repositories/userRepository.js');
    const fakeDb = { from: () => ({}) } as unknown as DbClient;
    const repo = new StubUserRepository(fakeDb);
    await expect(repo.findByClerkId('id')).rejects.toThrow('not implemented');
  });

  it('WorkspaceRepository stub still exists for tests that need it', async () => {
    const { StubWorkspaceRepository } = await import('../repositories/workspaceRepository.js');
    const fakeDb = { from: () => ({}) } as unknown as DbClient;
    const repo = new StubWorkspaceRepository(fakeDb);
    await expect(repo.findPersonalWorkspaceForUser('id')).rejects.toThrow('not implemented');
  });

  it('ProjectRepository stub still exists with no methods', async () => {
    const { StubProjectRepository } = await import('../repositories/projectRepository.js');
    const fakeDb = { from: () => ({}) } as unknown as DbClient;
    const repo = new StubProjectRepository(fakeDb);
    expect(repo).toBeDefined();
  });
});
