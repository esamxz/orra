import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import creditRoutes from '../routes/credits.js';
import type { Repositories } from '../repositories/types.js';
import type { CreditBalanceRow, CreditLedgerRow } from '@orra/db';
import type {
  GrantCreditsInput,
  ReserveCreditsInput,
  CaptureCreditsInput,
  RefundCreditsInput,
  ListLedgerInput,
} from '../repositories/creditRepository.js';

const fakeVerifier = createFakeVerifier();

interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

function createFakeRepositories(
  initialBalances: CreditBalanceRow[] = [],
  initialLedger: CreditLedgerRow[] = []
): Repositories {
  const balances = [...initialBalances];
  const ledger = [...initialLedger];
  let nextId = 1;

  return {
    user: {
      findByClerkId: async () => null,
      createFromClerkIdentity: async () => ({
        id: 'user-fake-1',
        clerk_id: 'usr_test_fake',
        email: 'test@orra.local',
        display_name: 'Test User',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
    },
    workspace: {
      findPersonalWorkspaceForUser: async () => null,
      createPersonalWorkspace: async () => ({
        id: 'ws-fake-1',
        name: "Test User's Workspace",
        type: 'personal',
        owner_user_id: 'user-fake-1',
        plan: 'free',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
      ensurePersonalWorkspaceForUser: async () => ({
        workspaceId: 'ws-fake-1',
        role: 'owner',
      }),
    },
    project: {
      async create() { throw new Error('not used'); },
      async listByWorkspace() { return []; },
      async findByIdForWorkspace() { return null; },
      async updateForWorkspace() { return null; },
      async deleteForWorkspace() {},
    },
    artifact: {
      async createArtifactForProject() { throw new Error('not used'); },
      async createVersion() { throw new Error('not used'); },
      async setCurrentVersion() { throw new Error('not used'); },
      async setCurrentVersionGuarded() { return null; },
      async commitVersion() { return null; },
      async getArtifactByIdForWorkspace() { return null; },
      async getArtifactByProjectIdForWorkspace() { return null; },
      async getCurrentVersion() { return null; },
    },
    chat: {
      async ensureThreadForProject() { throw new Error('not used'); },
      async findThreadByProjectId() { return null; },
      async listMessagesByThread() { return []; },
      async appendMessage() { throw new Error('not used'); },
      async findMessageByIdForProject() { return null; },
      async updateMessageMetadata() { throw new Error('not used'); },
    },
    generationJob: {
      async createStubJob() { throw new Error('not used'); },
      async findByIdForWorkspace() { return null; },
      async listByProject() { return []; },
      async findById() { return null; },
      async markRunningGuarded() { return null; },
      async markSucceededWithResultGuarded(_id: string, _resultVersionId: string, _capturedCredits = 0) { return null; },
      async markSucceededGuarded() { return null; },
      async markFailedGuarded() { return null; },
    },
    credit: {
      async getBalanceForWorkspace(workspaceId: string) {
        return balances.find((b) => b.workspace_id === workspaceId) ?? null;
      },
      async listLedgerForWorkspace(input: ListLedgerInput) {
        const rows = ledger.filter((l) => l.workspace_id === input.workspaceId);
        const limit = input.limit ?? 50;
        return rows.slice(-limit).reverse();
      },
      async grantCredits(input: GrantCreditsInput) {
        const id = `grant-${nextId++}`;
        ledger.push({
          id,
          workspace_id: input.workspaceId,
          entry_type: 'grant',
          bucket: input.bucket,
          amount: input.amount,
          job_id: null,
          expires_at: null,
          metadata: (input.metadata ?? {}) as import('@orra/db').Json,
          created_at: new Date().toISOString(),
        });
        let bal = balances.find((b) => b.workspace_id === input.workspaceId);
        if (!bal) {
          bal = {
            workspace_id: input.workspaceId,
            subscription_available: 0,
            topup_available: 0,
            reserved: 0,
            updated_at: new Date().toISOString(),
          };
          balances.push(bal);
        }
        if (input.bucket === 'subscription') {
          bal.subscription_available += input.amount;
        } else {
          bal.topup_available += input.amount;
        }
        bal.updated_at = new Date().toISOString();
        return { ledgerId: id };
      },
      async reserveCredits(input: ReserveCreditsInput) {
        const bal = balances.find((b) => b.workspace_id === input.workspaceId);
        const available = (bal?.subscription_available ?? 0) + (bal?.topup_available ?? 0);
        if (!bal || available < input.amount) {
          throw new Error('Insufficient credits');
        }
        const subNeeded = Math.min(bal.subscription_available, input.amount);
        const topupNeeded = input.amount - subNeeded;
        if (subNeeded > 0) {
          ledger.push({
            id: `res-${nextId++}`,
            workspace_id: input.workspaceId,
            entry_type: 'reserve',
            bucket: 'subscription',
            amount: -subNeeded,
            job_id: input.jobId,
            expires_at: null,
            metadata: {},
            created_at: new Date().toISOString(),
          });
        }
        if (topupNeeded > 0) {
          ledger.push({
            id: `res-${nextId++}`,
            workspace_id: input.workspaceId,
            entry_type: 'reserve',
            bucket: 'topup',
            amount: -topupNeeded,
            job_id: input.jobId,
            expires_at: null,
            metadata: {},
            created_at: new Date().toISOString(),
          });
        }
        bal.subscription_available -= subNeeded;
        bal.topup_available -= topupNeeded;
        bal.reserved += input.amount;
        bal.updated_at = new Date().toISOString();
        return { reservedAmount: input.amount };
      },
      async captureCredits(input: CaptureCreditsInput) {
        const bal = balances.find((b) => b.workspace_id === input.workspaceId);
        const reserves = ledger.filter(
          (l) =>
            l.workspace_id === input.workspaceId &&
            l.job_id === input.jobId &&
            l.entry_type === 'reserve'
        );
        const totalReserved = reserves.reduce((s, r) => s + Math.abs(r.amount), 0);
        const refund = totalReserved - input.actualAmount;
        ledger.push({
          id: `cap-${nextId++}`,
          workspace_id: input.workspaceId,
          entry_type: 'capture',
          bucket: 'subscription',
          amount: -input.actualAmount,
          job_id: input.jobId,
          expires_at: null,
          metadata: {},
          created_at: new Date().toISOString(),
        });
        if (refund > 0) {
          ledger.push({
            id: `ref-${nextId++}`,
            workspace_id: input.workspaceId,
            entry_type: 'refund',
            bucket: 'subscription',
            amount: refund,
            job_id: input.jobId,
            expires_at: null,
            metadata: {},
            created_at: new Date().toISOString(),
          });
        }
        if (bal) {
          bal.reserved = Math.max(0, bal.reserved - totalReserved);
          bal.subscription_available += refund;
          bal.updated_at = new Date().toISOString();
        }
        return { captured: input.actualAmount, refunded: refund };
      },
      async refundCredits(input: RefundCreditsInput) {
        const bal = balances.find((b) => b.workspace_id === input.workspaceId);
        const reserves = ledger.filter(
          (l) =>
            l.workspace_id === input.workspaceId &&
            l.job_id === input.jobId &&
            l.entry_type === 'reserve'
        );
        const totalReserved = reserves.reduce((s, r) => s + Math.abs(r.amount), 0);
        ledger.push({
          id: `ref-${nextId++}`,
          workspace_id: input.workspaceId,
          entry_type: 'refund',
          bucket: 'subscription',
          amount: totalReserved,
          job_id: input.jobId,
          expires_at: null,
          metadata: {},
          created_at: new Date().toISOString(),
        });
        if (bal) {
          bal.reserved = Math.max(0, bal.reserved - totalReserved);
          bal.subscription_available += totalReserved;
          bal.updated_at = new Date().toISOString();
        }
        return { refunded: totalReserved };
      },
    },
    brandSystem: {},
  } as unknown as Repositories;
}

function buildApp(repositories?: Repositories) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(
    createAuthMiddleware(fakeVerifier, repositories ? { repositories } : undefined)
  );
  app.route('/v1/credits', creditRoutes);
  app.onError(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/credits
// ---------------------------------------------------------------------------

describe('GET /v1/credits', () => {
  it('requires authentication', async () => {
    const app = buildApp();
    const res = await app.request(
      '/v1/credits',
      { method: 'GET' },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });

  it('returns zero balance when none exists', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/credits',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as {
      balance: { monthlyRemaining: number; topupRemaining: number; totalRemaining: number; reserved: number };
      recentLedger: unknown[];
    };
    expect(data.balance.monthlyRemaining).toBe(0);
    expect(data.balance.topupRemaining).toBe(0);
    expect(data.balance.totalRemaining).toBe(0);
    expect(data.balance.reserved).toBe(0);
    expect(data.recentLedger).toHaveLength(0);
  });

  it('returns balance scoped to auth workspace', async () => {
    const repos = createFakeRepositories([
      {
        workspace_id: 'ws-fake-1',
        subscription_available: 800,
        topup_available: 50,
        reserved: 20,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const app = buildApp(repos);
    const res = await app.request(
      '/v1/credits',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as {
      balance: { monthlyRemaining: number; topupRemaining: number; totalRemaining: number; reserved: number };
    };
    expect(data.balance.monthlyRemaining).toBe(800);
    expect(data.balance.topupRemaining).toBe(50);
    expect(data.balance.totalRemaining).toBe(850);
    expect(data.balance.reserved).toBe(20);
  });

  it('does not expose raw DB internals', async () => {
    const repos = createFakeRepositories([
      {
        workspace_id: 'ws-fake-1',
        subscription_available: 100,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const app = buildApp(repos);
    const res = await app.request(
      '/v1/credits',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    const text = await res.text();
    expect(text).not.toContain('subscription_available');
    expect(text).not.toContain('topup_available');
    expect(text).not.toContain('updated_at');
  });

  it('returns recent ledger entries', async () => {
    const repos = createFakeRepositories(
      [
        {
          workspace_id: 'ws-fake-1',
          subscription_available: 80,
          topup_available: 0,
          reserved: 20,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      [
        {
          id: 'l1',
          workspace_id: 'ws-fake-1',
          entry_type: 'grant',
          bucket: 'subscription',
          amount: 100,
          job_id: null,
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'l2',
          workspace_id: 'ws-fake-1',
          entry_type: 'reserve',
          bucket: 'subscription',
          amount: -20,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-02T00:00:00Z',
        },
      ]
    );
    const app = buildApp(repos);
    const res = await app.request(
      '/v1/credits',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as { recentLedger: Array<{ id: string; entryType: string; amount: number }> };
    expect(data.recentLedger.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/credits/ledger
// ---------------------------------------------------------------------------

describe('GET /v1/credits/ledger', () => {
  it('requires authentication', async () => {
    const app = buildApp();
    const res = await app.request(
      '/v1/credits/ledger',
      { method: 'GET' },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });

  it('returns ledger entries scoped to workspace', async () => {
    const repos = createFakeRepositories(
      [],
      [
        {
          id: 'l1',
          workspace_id: 'ws-fake-1',
          entry_type: 'grant',
          bucket: 'subscription',
          amount: 100,
          job_id: null,
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'l2',
          workspace_id: 'ws-fake-2',
          entry_type: 'grant',
          bucket: 'topup',
          amount: 50,
          job_id: null,
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ]
    );
    const app = buildApp(repos);
    const res = await app.request(
      '/v1/credits/ledger',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as Array<{ id: string }>;
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('l1');
  });
});
