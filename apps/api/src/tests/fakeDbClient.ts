import type { DbClient } from '../db/client.js';

// ---------------------------------------------------------------------------
// Fake Supabase client for repository unit tests
// ---------------------------------------------------------------------------
// Supports the minimal query patterns used by UserRepository,
// WorkspaceRepository, and ProjectRepository. No network, no real Supabase.

export type FakeRow = Record<string, unknown>;

export interface FakeDbState {
  [table: string]: FakeRow[];
}

export function createFakeDbClient(initial: FakeDbState = {}): DbClient {
  const tables: FakeDbState = JSON.parse(JSON.stringify(initial)) as FakeDbState;

  return {
    from: (table: string) => {
      const rows = tables[table] ?? [];

      return {
        select: () => {
          let filtered = [...rows];
          let limited = filtered;

          function buildResult() {
            return { data: limited, error: null };
          }

          const chain: {
            eq: (col: string, val: unknown) => typeof chain;
            order: (_col: string, _opts?: { ascending?: boolean }) => typeof chain;
            limit: (n: number) => typeof chain;
            maybeSingle: () => Promise<{ data: FakeRow | null; error: null }>;
            single: () => Promise<{ data: FakeRow | null; error: null }>;
            then: PromiseLike<unknown>['then'];
          } = {
            eq: (col: string, val: unknown) => {
              filtered = filtered.filter((r) => r[col] === val);
              limited = filtered;
              return chain;
            },
            order: (_col: string, _opts?: { ascending?: boolean }) => {
              // Simplified: no-op for fake client.
              return chain;
            },
            limit: (n: number) => {
              limited = filtered.slice(0, n);
              return chain;
            },
            maybeSingle: async () => ({
              data: limited[0] ?? null,
              error: null,
            }),
            single: async () => ({
              data: limited[0] ?? null,
              error: null,
            }),
            then: ((onfulfilled?: ((value: unknown) => unknown) | null | undefined, _onrejected?: unknown) => {
              return Promise.resolve(onfulfilled ? onfulfilled(buildResult()) : buildResult());
            }) as unknown as PromiseLike<unknown>['then'],
          };

          return chain;
        },

        insert: (values: FakeRow | FakeRow[]) => {
          const items = Array.isArray(values) ? values : [values];
          const inserted = items.map((v) => ({
            ...v,
            id: (v.id as string) ?? `fake-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          }));
          tables[table] = [...(tables[table] ?? []), ...inserted];
          return {
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
            }),
          };
        },

        upsert: (values: FakeRow | FakeRow[], _opts?: { onConflict?: string }) => {
          const items = Array.isArray(values) ? values : [values];
          // For simplicity, treat upsert as insert. Tests that need true
          // upsert semantics can seed the table before the call.
          const upserted = items.map((v) => ({
            ...v,
            id: (v.id as string) ?? `fake-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          }));
          tables[table] = [...(tables[table] ?? []), ...upserted];
          return {
            select: () => ({
              single: async () => ({ data: upserted[0], error: null }),
            }),
          };
        },

        delete: () => {
          let filtered = [...rows];

          const chain: {
            eq: (col: string, val: unknown) => typeof chain;
            then: PromiseLike<unknown>['then'];
          } = {
            eq: (col: string, val: unknown) => {
              filtered = filtered.filter((r) => r[col] === val);
              return chain;
            },
            then: ((onfulfilled?: ((value: unknown) => unknown) | null | undefined, _onrejected?: unknown) => {
              tables[table] = (tables[table] ?? []).filter(
                (r) => !filtered.some((f) => f.id === r.id)
              );
              const result = { data: null, error: null };
              return Promise.resolve(onfulfilled ? onfulfilled(result) : result);
            }) as unknown as PromiseLike<unknown>['then'],
          };

          return chain;
        },

        update: (updates: FakeRow) => {
          let filtered = [...rows];

          const chain: {
            eq: (col: string, val: unknown) => typeof chain;
            select: () => {
              single: () => Promise<{ data: FakeRow | null; error: null }>;
            };
            then: PromiseLike<unknown>['then'];
          } = {
            eq: (col: string, val: unknown) => {
              filtered = filtered.filter((r) => r[col] === val);
              return chain;
            },
            select: () => ({
              single: async () => {
                if (filtered.length === 0) {
                  return { data: null, error: null };
                }
                const idx = rows.findIndex((r) => r.id === filtered[0].id);
                if (idx !== -1) {
                  rows[idx] = { ...rows[idx], ...updates };
                  tables[table] = [...rows];
                  return { data: rows[idx], error: null };
                }
                return { data: null, error: null };
              },
            }),
            then: ((onfulfilled?: ((value: unknown) => unknown) | null | undefined, _onrejected?: unknown) => {
              if (filtered.length > 0) {
                const idx = rows.findIndex((r) => r.id === filtered[0].id);
                if (idx !== -1) {
                  rows[idx] = { ...rows[idx], ...updates };
                  tables[table] = [...rows];
                }
              }
              const result = { data: null, error: null };
              return Promise.resolve(onfulfilled ? onfulfilled(result) : result);
            }) as unknown as PromiseLike<unknown>['then'],
          };

          return chain;
        },
      };
    },
  } as unknown as DbClient;
}
