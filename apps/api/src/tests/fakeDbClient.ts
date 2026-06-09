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

  // ---------------------------------------------------------------------------
  // RPC simulation for atomic artifact version commit
  // ---------------------------------------------------------------------------
  async function rpcCommitArtifactVersion(params: Record<string, unknown>) {
    const artifacts = tables['artifacts'] ?? [];
    const artifact = artifacts.find(
      (a) =>
        a.id === params.p_artifact_id &&
        a.workspace_id === params.p_workspace_id
    );

    if (!artifact) {
      return { data: [], error: null };
    }

    if (artifact.current_version_id !== params.p_expected_current_version_id) {
      return { data: [], error: null };
    }

    const newVersionId = `ver-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newVersion: FakeRow = {
      id: newVersionId,
      workspace_id: params.p_workspace_id,
      artifact_id: params.p_artifact_id,
      version: params.p_version,
      document: params.p_document,
      reason: params.p_reason,
      created_by: params.p_created_by,
      brand_context_snapshot: params.p_brand_context_snapshot ?? null,
      created_at: new Date().toISOString(),
    };

    tables['artifact_versions'] = [...(tables['artifact_versions'] ?? []), newVersion];

    const artIdx = artifacts.findIndex((a) => a.id === params.p_artifact_id);
    if (artIdx !== -1) {
      artifacts[artIdx] = { ...artifacts[artIdx], current_version_id: newVersionId };
      tables['artifacts'] = [...artifacts];
    }

    return {
      data: [newVersion],
      error: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Credit RPC simulation
  // ---------------------------------------------------------------------------
  function getOrCreateBalance(workspaceId: string) {
    const balances = (tables['credit_balances'] ?? []) as Array<Record<string, unknown>>;
    let bal = balances.find((b) => b.workspace_id === workspaceId);
    if (!bal) {
      bal = {
        workspace_id: workspaceId,
        subscription_available: 0,
        topup_available: 0,
        reserved: 0,
        updated_at: new Date().toISOString(),
      };
      tables['credit_balances'] = [...balances, bal];
    }
    return bal;
  }

  function rpcGrantCredits(params: Record<string, unknown>) {
    const workspaceId = params.p_workspace_id as string;
    const bucket = params.p_bucket as string;
    const amount = Number(params.p_amount ?? 0);
    const metadata = (params.p_metadata ?? {}) as Record<string, unknown>;

    if (amount <= 0) {
      return Promise.resolve({ data: null, error: { message: 'Grant amount must be positive', code: '23514' } });
    }

    const ledgerId = `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ledgerRow: Record<string, unknown> = {
      id: ledgerId,
      workspace_id: workspaceId,
      entry_type: 'grant',
      bucket,
      amount,
      job_id: null,
      expires_at: null,
      metadata,
      created_at: new Date().toISOString(),
    };
    tables['credit_ledger'] = [...(tables['credit_ledger'] ?? []), ledgerRow];

    const bal = getOrCreateBalance(workspaceId);
    if (bucket === 'subscription') {
      bal.subscription_available = Number(bal.subscription_available ?? 0) + amount;
    } else {
      bal.topup_available = Number(bal.topup_available ?? 0) + amount;
    }
    bal.updated_at = new Date().toISOString();

    return Promise.resolve({ data: { ledger_id: ledgerId }, error: null });
  }

  function rpcReserveCredits(params: Record<string, unknown>) {
    const workspaceId = params.p_workspace_id as string;
    const amount = Number(params.p_amount ?? 0);
    const jobId = params.p_job_id as string;
    const metadata = (params.p_metadata ?? {}) as Record<string, unknown>;

    if (amount <= 0) {
      return Promise.resolve({ data: null, error: { message: 'Reserve amount must be positive', code: '23514' } });
    }

    const bal = getOrCreateBalance(workspaceId);
    const subAvail = Number(bal.subscription_available ?? 0);
    const topupAvail = Number(bal.topup_available ?? 0);

    if (subAvail + topupAvail < amount) {
      return Promise.resolve({ data: null, error: { message: 'Insufficient credits', code: 'P0001' } });
    }

    const subNeeded = Math.min(subAvail, amount);
    const topupNeeded = amount - subNeeded;

    if (subNeeded > 0) {
      tables['credit_ledger'] = [...(tables['credit_ledger'] ?? []), {
        id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        workspace_id: workspaceId,
        entry_type: 'reserve',
        bucket: 'subscription',
        amount: -subNeeded,
        job_id: jobId,
        expires_at: null,
        metadata,
        created_at: new Date().toISOString(),
      }];
    }

    if (topupNeeded > 0) {
      tables['credit_ledger'] = [...(tables['credit_ledger'] ?? []), {
        id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        workspace_id: workspaceId,
        entry_type: 'reserve',
        bucket: 'topup',
        amount: -topupNeeded,
        job_id: jobId,
        expires_at: null,
        metadata,
        created_at: new Date().toISOString(),
      }];
    }

    bal.subscription_available = subAvail - subNeeded;
    bal.topup_available = topupAvail - topupNeeded;
    bal.reserved = Number(bal.reserved ?? 0) + amount;
    bal.updated_at = new Date().toISOString();

    return Promise.resolve({ data: { reserved_amount: amount }, error: null });
  }

  function rpcCaptureCredits(params: Record<string, unknown>) {
    const workspaceId = params.p_workspace_id as string;
    const jobId = params.p_job_id as string;
    const actualAmount = Number(params.p_actual_amount ?? 0);
    const metadata = (params.p_metadata ?? {}) as Record<string, unknown>;

    if (actualAmount < 0) {
      return Promise.resolve({ data: null, error: { message: 'Capture amount cannot be negative', code: '23514' } });
    }

    const bal = getOrCreateBalance(workspaceId);
    const ledger = (tables['credit_ledger'] ?? []) as Array<Record<string, unknown>>;
    const reserves = ledger.filter(
      (r) => r.workspace_id === workspaceId && r.job_id === jobId && r.entry_type === 'reserve'
    );
    const totalReserved = reserves.reduce((sum, r) => sum + Math.abs(Number(r.amount ?? 0)), 0);

    if (totalReserved === 0) {
      return Promise.resolve({ data: null, error: { message: 'No reservation found for job', code: 'P0002' } });
    }

    if (actualAmount > totalReserved) {
      return Promise.resolve({ data: null, error: { message: 'Capture amount exceeds reservation', code: '23514' } });
    }

    const refundAmount = totalReserved - actualAmount;

    tables['credit_ledger'] = [...ledger, {
      id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      workspace_id: workspaceId,
      entry_type: 'capture',
      bucket: 'subscription',
      amount: -actualAmount,
      job_id: jobId,
      expires_at: null,
      metadata,
      created_at: new Date().toISOString(),
    }];

    if (refundAmount > 0) {
      tables['credit_ledger'] = [...(tables['credit_ledger'] ?? []), {
        id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        workspace_id: workspaceId,
        entry_type: 'refund',
        bucket: 'subscription',
        amount: refundAmount,
        job_id: jobId,
        expires_at: null,
        metadata,
        created_at: new Date().toISOString(),
      }];
    }

    bal.reserved = Math.max(0, Number(bal.reserved ?? 0) - totalReserved);
    bal.subscription_available = Number(bal.subscription_available ?? 0) + refundAmount;
    bal.updated_at = new Date().toISOString();

    // Remove consumed reserve entries so duplicate capture is rejected
    tables['credit_ledger'] = ledger.filter(
      (r) => !(r.workspace_id === workspaceId && r.job_id === jobId && r.entry_type === 'reserve')
    );

    return Promise.resolve({ data: { captured: actualAmount, refunded: refundAmount }, error: null });
  }

  function rpcRefundCredits(params: Record<string, unknown>) {
    const workspaceId = params.p_workspace_id as string;
    const jobId = params.p_job_id as string;
    const metadata = (params.p_metadata ?? {}) as Record<string, unknown>;

    const bal = getOrCreateBalance(workspaceId);
    const ledger = (tables['credit_ledger'] ?? []) as Array<Record<string, unknown>>;
    const reserves = ledger.filter(
      (r) => r.workspace_id === workspaceId && r.job_id === jobId && r.entry_type === 'reserve'
    );
    const totalReserved = reserves.reduce((sum, r) => sum + Math.abs(Number(r.amount ?? 0)), 0);

    if (totalReserved === 0) {
      return Promise.resolve({ data: null, error: { message: 'No reservation found for job', code: 'P0002' } });
    }

    tables['credit_ledger'] = [...ledger, {
      id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      workspace_id: workspaceId,
      entry_type: 'refund',
      bucket: 'subscription',
      amount: totalReserved,
      job_id: jobId,
      expires_at: null,
      metadata,
      created_at: new Date().toISOString(),
    }];

    bal.reserved = Math.max(0, Number(bal.reserved ?? 0) - totalReserved);
    bal.subscription_available = Number(bal.subscription_available ?? 0) + totalReserved;
    bal.updated_at = new Date().toISOString();

    // Remove consumed reserve entries so duplicate refund is rejected
    tables['credit_ledger'] = ledger.filter(
      (r) => !(r.workspace_id === workspaceId && r.job_id === jobId && r.entry_type === 'reserve')
    );

    return Promise.resolve({ data: { refunded: totalReserved }, error: null });
  }

  return {
    rpc: (fn: string, params?: Record<string, unknown>) => {
      if (fn === 'commit_artifact_version') {
        return rpcCommitArtifactVersion(params ?? {});
      }
      if (fn === 'grant_credits') {
        return rpcGrantCredits(params ?? {});
      }
      if (fn === 'reserve_credits') {
        return rpcReserveCredits(params ?? {});
      }
      if (fn === 'capture_credits') {
        return rpcCaptureCredits(params ?? {});
      }
      if (fn === 'refund_credits') {
        return rpcRefundCredits(params ?? {});
      }
      return Promise.resolve({ data: null, error: { message: `Unknown RPC: ${fn}` } });
    },

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
