import type { DbClient } from '../db/client.js';

// ---------------------------------------------------------------------------
// Fake Supabase client for repository unit tests
// ---------------------------------------------------------------------------
// Supports the minimal query patterns used by UserRepository and
// WorkspaceRepository. No network, no real Supabase.

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
          const chain = {
            eq: (col: string, val: unknown) => {
              filtered = filtered.filter((r) => r[col] === val);
              return chain;
            },
            maybeSingle: async () => ({
              data: filtered[0] ?? null,
              error: null,
            }),
            single: async () => ({
              data: filtered[0] ?? null,
              error: null,
            }),
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
      };
    },
  } as unknown as DbClient;
}
