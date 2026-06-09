import { describe, it, expect } from 'vitest';
import { SupabaseGenerationJobRepository } from '../repositories/generationJobRepository.js';
import type { DbClient } from '../db/client.js';

// ---------------------------------------------------------------------------
// Fake DB client that simulates Supabase update guards
// ---------------------------------------------------------------------------

function createFakeDbClient(initialJobs: Array<{
  id: string;
  workspace_id: string;
  project_id: string;
  kind: import('@orra/db').GenerationJobKind;
  status: import('@orra/db').GenerationJobStatus;
  idempotency_key: string | null;
  reserved_credits: number;
  captured_credits: number;
  plan: import('@orra/db').Json | null;
  error: import('@orra/db').Json | null;
  result_version_id: string | null;
  created_at: string;
  updated_at: string;
}> = []) {
  const jobs = [...initialJobs];

  const db = {
    from(table: string) {
      return {
        insert(data: Record<string, unknown>) {
          return {
            select() {
              return {
                single() {
                  if (table !== 'generation_jobs') throw new Error('Unexpected table');
                  const inserted = {
                    ...data,
                    id: data.id ?? `job-${jobs.length + 1}`,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  } as typeof jobs[0];
                  jobs.push(inserted);
                  return Promise.resolve({ data: inserted, error: null });
                },
              };
            },
          };
        },
        select(_columns?: string) {
          return {
            eq(column: string, value: unknown) {
              return {
                maybeSingle() {
                  const found = jobs.find((j) => (j as Record<string, unknown>)[column] === value);
                  return Promise.resolve({ data: found ?? null, error: null });
                },
                in(column2: string, values: unknown[]) {
                  return {
                    select() {
                      return {
                        single() {
                          const found = jobs.find(
                            (j) =>
                              (j as Record<string, unknown>)[column] === value &&
                              values.includes((j as Record<string, unknown>)[column2])
                          );
                          return Promise.resolve({ data: found ?? null, error: null });
                        },
                      };
                    },
                  };
                },
                select() {
                  return {
                    single() {
                      const found = jobs.find((j) => (j as Record<string, unknown>)[column] === value);
                      return Promise.resolve({ data: found ?? null, error: null });
                    },
                  };
                },
              };
            },
          };
        },
        update(updates: Record<string, unknown>) {
          return {
            eq(column: string, value: unknown) {
              return {
                eq(column2: string, value2: unknown) {
                  return {
                    select() {
                      return {
                        single() {
                          const idx = jobs.findIndex(
                            (j) =>
                              (j as Record<string, unknown>)[column] === value &&
                              (j as Record<string, unknown>)[column2] === value2
                          );
                          if (idx === -1) return Promise.resolve({ data: null, error: null });
                          jobs[idx] = { ...jobs[idx], ...updates } as typeof jobs[0];
                          return Promise.resolve({ data: jobs[idx], error: null });
                        },
                      };
                    },
                  };
                },
                in(column2: string, values: unknown[]) {
                  return {
                    select() {
                      return {
                        single() {
                          const idx = jobs.findIndex(
                            (j) =>
                              (j as Record<string, unknown>)[column] === value &&
                              values.includes((j as Record<string, unknown>)[column2])
                          );
                          if (idx === -1) return Promise.resolve({ data: null, error: null });
                          jobs[idx] = { ...jobs[idx], ...updates } as typeof jobs[0];
                          return Promise.resolve({ data: jobs[idx], error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { db, jobs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SupabaseGenerationJobRepository guarded transitions', () => {
  it('markRunningGuarded succeeds only from queued', async () => {
    const { db, jobs } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'queued',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markRunningGuarded('job-1');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('running');
    expect(jobs[0].status).toBe('running');
  });

  it('markRunningGuarded fails from running', async () => {
    const { db } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'running',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markRunningGuarded('job-1');
    expect(result).toBeNull();
  });

  it('markRunningGuarded fails from succeeded', async () => {
    const { db } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'succeeded',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markRunningGuarded('job-1');
    expect(result).toBeNull();
  });

  it('markSucceededGuarded succeeds only from running', async () => {
    const { db, jobs } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'running',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markSucceededGuarded('job-1');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('succeeded');
    expect(jobs[0].status).toBe('succeeded');
  });

  it('markSucceededGuarded fails from queued', async () => {
    const { db } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'queued',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markSucceededGuarded('job-1');
    expect(result).toBeNull();
  });

  it('markSucceededGuarded fails from succeeded', async () => {
    const { db } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'succeeded',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markSucceededGuarded('job-1');
    expect(result).toBeNull();
  });

  it('markFailedGuarded succeeds from queued', async () => {
    const { db, jobs } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'queued',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markFailedGuarded('job-1', { message: 'timeout' });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('failed');
    expect(jobs[0].status).toBe('failed');
  });

  it('markFailedGuarded succeeds from running', async () => {
    const { db, jobs } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'running',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markFailedGuarded('job-1', { message: 'crash' });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('failed');
    expect(jobs[0].status).toBe('failed');
  });

  it('markFailedGuarded fails from succeeded', async () => {
    const { db } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'succeeded',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markFailedGuarded('job-1', { message: 'late error' });
    expect(result).toBeNull();
  });

  it('markSucceededWithResultGuarded succeeds from running and stores result_version_id', async () => {
    const { db, jobs } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'running',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markSucceededWithResultGuarded('job-1', 'ver-99');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('succeeded');
    expect(result!.result_version_id).toBe('ver-99');
    expect(jobs[0].status).toBe('succeeded');
    expect(jobs[0].result_version_id).toBe('ver-99');
  });

  it('markSucceededWithResultGuarded fails from queued', async () => {
    const { db } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'queued',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markSucceededWithResultGuarded('job-1', 'ver-99');
    expect(result).toBeNull();
  });

  it('markSucceededWithResultGuarded fails from succeeded', async () => {
    const { db } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'succeeded',
        idempotency_key: null,
        reserved_credits: 0,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markSucceededWithResultGuarded('job-1', 'ver-99');
    expect(result).toBeNull();
  });

  it('markSucceededWithResultGuarded stores capturedCredits', async () => {
    const { db, jobs } = createFakeDbClient([
      {
        id: 'job-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'full_generate',
        status: 'running',
        idempotency_key: null,
        reserved_credits: 10,
        captured_credits: 0,
        plan: null,
        error: null,
        result_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const repo = new SupabaseGenerationJobRepository(db as unknown as DbClient);
    const result = await repo.markSucceededWithResultGuarded('job-1', 'ver-99', 10);

    expect(result).not.toBeNull();
    expect(result!.status).toBe('succeeded');
    expect(result!.captured_credits).toBe(10);
    expect(jobs[0].captured_credits).toBe(10);
    expect(jobs[0].result_version_id).toBe('ver-99');
  });
});
