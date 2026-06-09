import { describe, it, expect } from 'vitest';
import { CreditService } from '../services/creditService.js';
import { ApiError } from '../errors.js';
import type { CreditRepository } from '../repositories/creditRepository.js';
import type { CreditBalanceRow, CreditLedgerRow, Json } from '@orra/db';

// ---------------------------------------------------------------------------
// Fake credit repository
// ---------------------------------------------------------------------------

function createFakeCreditRepository(
  initialBalances: CreditBalanceRow[] = [],
  initialLedger: CreditLedgerRow[] = []
): CreditRepository {
  let nextId = 1;
  const balances = [...initialBalances];
  const ledger = [...initialLedger];

  return {
    async getBalanceForWorkspace(workspaceId: string) {
      return balances.find((b) => b.workspace_id === workspaceId) ?? null;
    },

    async listLedgerForWorkspace(input) {
      const rows = ledger.filter((l) => l.workspace_id === input.workspaceId);
      const limit = input.limit ?? 50;
      return rows.slice(-limit).reverse();
    },

    async grantCredits(input) {
      const id = `grant-${nextId++}`;
      ledger.push({
        id,
        workspace_id: input.workspaceId,
        entry_type: 'grant',
        bucket: input.bucket,
        amount: input.amount,
        job_id: null,
        expires_at: null,
        metadata: (input.metadata ?? {}) as Json,
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

    async reserveCredits(input) {
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
          metadata: (input.metadata ?? {}) as Json,
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
          metadata: (input.metadata ?? {}) as Json,
          created_at: new Date().toISOString(),
        });
      }
      bal.subscription_available -= subNeeded;
      bal.topup_available -= topupNeeded;
      bal.reserved += input.amount;
      bal.updated_at = new Date().toISOString();
      return { reservedAmount: input.amount };
    },

    async captureCredits(input) {
      const bal = balances.find((b) => b.workspace_id === input.workspaceId);
      const reserves = ledger.filter(
        (l) =>
          l.workspace_id === input.workspaceId &&
          l.job_id === input.jobId &&
          l.entry_type === 'reserve'
      );
      const totalReserved = reserves.reduce((s, r) => s + Math.abs(r.amount), 0);
      if (totalReserved === 0) {
        throw new Error('No reservation found for job');
      }
      const refund = totalReserved - input.actualAmount;
      ledger.push({
        id: `cap-${nextId++}`,
        workspace_id: input.workspaceId,
        entry_type: 'capture',
        bucket: 'subscription',
        amount: -input.actualAmount,
        job_id: input.jobId,
        expires_at: null,
        metadata: (input.metadata ?? {}) as Json,
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
          metadata: (input.metadata ?? {}) as Json,
          created_at: new Date().toISOString(),
        });
      }
      if (bal) {
        bal.reserved = Math.max(0, bal.reserved - totalReserved);
        bal.subscription_available += refund;
        bal.updated_at = new Date().toISOString();
      }
      // Remove consumed reserve entries so duplicate capture is rejected
      const remaining = ledger.filter(
        (l) =>
          !(l.workspace_id === input.workspaceId && l.job_id === input.jobId && l.entry_type === 'reserve')
      );
      ledger.length = 0;
      ledger.push(...remaining);
      return { captured: input.actualAmount, refunded: refund };
    },

    async refundCredits(input) {
      const bal = balances.find((b) => b.workspace_id === input.workspaceId);
      const reserves = ledger.filter(
        (l) =>
          l.workspace_id === input.workspaceId &&
          l.job_id === input.jobId &&
          l.entry_type === 'reserve'
      );
      const totalReserved = reserves.reduce((s, r) => s + Math.abs(r.amount), 0);
      if (totalReserved === 0) {
        throw new Error('No reservation found for job');
      }
      ledger.push({
        id: `ref-${nextId++}`,
        workspace_id: input.workspaceId,
        entry_type: 'refund',
        bucket: 'subscription',
        amount: totalReserved,
        job_id: input.jobId,
        expires_at: null,
        metadata: (input.metadata ?? {}) as Json,
        created_at: new Date().toISOString(),
      });
      if (bal) {
        bal.reserved = Math.max(0, bal.reserved - totalReserved);
        bal.subscription_available += totalReserved;
        bal.updated_at = new Date().toISOString();
      }
      // Remove consumed reserve entries so duplicate refund is rejected
      const remaining = ledger.filter(
        (l) =>
          !(l.workspace_id === input.workspaceId && l.job_id === input.jobId && l.entry_type === 'reserve')
      );
      ledger.length = 0;
      ledger.push(...remaining);
      return { refunded: totalReserved };
    },
  };
}

function fakeAuthContext(workspaceId: string) {
  return {
    env: {} as unknown as import('../env.js').Env,
    requestId: 'req-123',
    auth: {
      isAuthenticated: true,
      clerkUserId: 'usr_test',
      userId: 'user-1',
      workspaceId,
      role: 'owner' as const,
      authSource: 'clerk' as const,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreditService', () => {
  it('getCreditStatus requires auth', async () => {
    const service = new CreditService(createFakeCreditRepository());
    await expect(service.getCreditStatus({ env: {} as import('../env.js').Env, requestId: 'req-1' })).rejects.toThrow(
      ApiError
    );
  });

  it('getCreditStatus returns zero balance when none exists', async () => {
    const service = new CreditService(createFakeCreditRepository());
    const ctx = fakeAuthContext('ws-1');
    const result = await service.getCreditStatus(ctx);

    expect(result.balance.workspaceId).toBe('ws-1');
    expect(result.balance.monthlyRemaining).toBe(0);
    expect(result.balance.topupRemaining).toBe(0);
    expect(result.balance.totalRemaining).toBe(0);
    expect(result.balance.reserved).toBe(0);
    expect(result.recentLedger).toHaveLength(0);
  });

  it('getCreditStatus returns populated balance', async () => {
    const repo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 80,
        topup_available: 20,
        reserved: 10,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');
    const result = await service.getCreditStatus(ctx);

    expect(result.balance.monthlyRemaining).toBe(80);
    expect(result.balance.topupRemaining).toBe(20);
    expect(result.balance.totalRemaining).toBe(100);
    expect(result.balance.reserved).toBe(10);
  });

  it('listLedger requires auth', async () => {
    const service = new CreditService(createFakeCreditRepository());
    await expect(service.listLedger({ env: {} as import('../env.js').Env, requestId: 'req-1' }, {})).rejects.toThrow(
      ApiError
    );
  });

  it('grantCreditsInternal increases balance', async () => {
    const repo = createFakeCreditRepository();
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.grantCreditsInternal(ctx, { bucket: 'subscription', amount: 200 });
    expect(result.ledgerId).toBeTruthy();

    const status = await service.getCreditStatus(ctx);
    expect(status.balance.monthlyRemaining).toBe(200);
    expect(status.balance.totalRemaining).toBe(200);
  });

  it('grantCreditsInternal rejects non-positive amount', async () => {
    const repo = createFakeCreditRepository();
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    await expect(service.grantCreditsInternal(ctx, { bucket: 'subscription', amount: 0 })).rejects.toThrow(ApiError);
    await expect(service.grantCreditsInternal(ctx, { bucket: 'subscription', amount: -1 })).rejects.toThrow(ApiError);
  });

  it('reserveCreditsInternal succeeds with enough balance', async () => {
    const repo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 100,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.reserveCreditsInternal(ctx, { amount: 30, jobId: 'job-1' });
    expect(result.reservedAmount).toBe(30);

    const status = await service.getCreditStatus(ctx);
    expect(status.balance.monthlyRemaining).toBe(70);
    expect(status.balance.reserved).toBe(30);
  });

  it('reserveCreditsInternal throws INSUFFICIENT_CREDITS on low balance', async () => {
    const repo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 10,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    await expect(service.reserveCreditsInternal(ctx, { amount: 30, jobId: 'job-1' })).rejects.toSatisfy(
      (err: unknown) => {
        if (!(err instanceof ApiError)) return false;
        return err.code === 'INSUFFICIENT_CREDITS';
      }
    );
  });

  it('reserveCreditsInternal rejects non-positive amount', async () => {
    const repo = createFakeCreditRepository();
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    await expect(service.reserveCreditsInternal(ctx, { amount: 0, jobId: 'job-1' })).rejects.toThrow(ApiError);
  });

  it('captureCreditsInternal captures and refunds', async () => {
    const repo = createFakeCreditRepository(
      [
        {
          workspace_id: 'ws-1',
          subscription_available: 70,
          topup_available: 0,
          reserved: 30,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      [
        {
          id: 'ledger-1',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'subscription',
          amount: -30,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ]
    );
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.captureCreditsInternal(ctx, { jobId: 'job-1', actualAmount: 20 });
    expect(result.captured).toBe(20);
    expect(result.refunded).toBe(10);

    const status = await service.getCreditStatus(ctx);
    expect(status.balance.reserved).toBe(0);
    expect(status.balance.monthlyRemaining).toBe(80); // 70 + 10 refund
  });

  it('captureCreditsInternal rejects negative amount', async () => {
    const repo = createFakeCreditRepository();
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.captureCreditsInternal(ctx, { jobId: 'job-1', actualAmount: -1 })
    ).rejects.toThrow(ApiError);
  });

  it('refundCreditsInternal releases reservation', async () => {
    const repo = createFakeCreditRepository(
      [
        {
          workspace_id: 'ws-1',
          subscription_available: 70,
          topup_available: 0,
          reserved: 30,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      [
        {
          id: 'ledger-1',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'subscription',
          amount: -30,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ]
    );
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.refundCreditsInternal(ctx, { jobId: 'job-1' });
    expect(result.refunded).toBe(30);

    const status = await service.getCreditStatus(ctx);
    expect(status.balance.reserved).toBe(0);
    expect(status.balance.monthlyRemaining).toBe(100);
  });

  it('cross-workspace leakage impossible through auth context', async () => {
    const repo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 100,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-2');

    const status = await service.getCreditStatus(ctx);
    // ws-2 has no balance in the seeded repo, so it returns zero defaults.
    expect(status.balance.totalRemaining).toBe(0);
  });

  it('captureCreditsInternal rejects duplicate capture after reservation consumed', async () => {
    const repo = createFakeCreditRepository(
      [
        {
          workspace_id: 'ws-1',
          subscription_available: 70,
          topup_available: 0,
          reserved: 30,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      [
        {
          id: 'ledger-1',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'subscription',
          amount: -30,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ]
    );
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    const first = await service.captureCreditsInternal(ctx, { jobId: 'job-1', actualAmount: 30 });
    expect(first.captured).toBe(30);

    await expect(
      service.captureCreditsInternal(ctx, { jobId: 'job-1', actualAmount: 30 })
    ).rejects.toThrow('No reservation found');
  });

  it('refundCreditsInternal rejects duplicate refund after reservation consumed', async () => {
    const repo = createFakeCreditRepository(
      [
        {
          workspace_id: 'ws-1',
          subscription_available: 70,
          topup_available: 0,
          reserved: 30,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      [
        {
          id: 'ledger-1',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'subscription',
          amount: -30,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ]
    );
    const service = new CreditService(repo);
    const ctx = fakeAuthContext('ws-1');

    const first = await service.refundCreditsInternal(ctx, { jobId: 'job-1' });
    expect(first.refunded).toBe(30);

    await expect(
      service.refundCreditsInternal(ctx, { jobId: 'job-1' })
    ).rejects.toThrow('No reservation found');
  });
});
