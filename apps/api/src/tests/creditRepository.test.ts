import { describe, it, expect } from 'vitest';
import { SupabaseCreditRepository } from '../repositories/creditRepository.js';
import { createFakeDbClient } from './fakeDbClient.js';

describe('SupabaseCreditRepository (fake DB)', () => {
  function createRepo(initial: import('./fakeDbClient.js').FakeDbState = {}) {
    const db = createFakeDbClient(initial);
    return new SupabaseCreditRepository(db);
  }

  // -------------------------------------------------------------------------
  // getBalanceForWorkspace
  // -------------------------------------------------------------------------

  it('returns null when no balance exists', async () => {
    const repo = createRepo();
    const result = await repo.getBalanceForWorkspace('ws-1');
    expect(result).toBeNull();
  });

  it('returns balance row when it exists', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 50,
          topup_available: 20,
          reserved: 10,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const result = await repo.getBalanceForWorkspace('ws-1');
    expect(result).not.toBeNull();
    expect(result!.subscription_available).toBe(50);
    expect(result!.topup_available).toBe(20);
    expect(result!.reserved).toBe(10);
  });

  // -------------------------------------------------------------------------
  // grantCredits
  // -------------------------------------------------------------------------

  it('grantCredits appends ledger and creates balance', async () => {
    const repo = createRepo();
    const result = await repo.grantCredits({
      workspaceId: 'ws-1',
      bucket: 'subscription',
      amount: 100,
    });

    expect(result.ledgerId).toBeTruthy();

    const balance = await repo.getBalanceForWorkspace('ws-1');
    expect(balance).not.toBeNull();
    expect(balance!.subscription_available).toBe(100);
    expect(balance!.topup_available).toBe(0);
    expect(balance!.reserved).toBe(0);
  });

  it('grantCredits accumulates in existing balance', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 50,
          topup_available: 10,
          reserved: 0,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    await repo.grantCredits({ workspaceId: 'ws-1', bucket: 'topup', amount: 25 });

    const balance = await repo.getBalanceForWorkspace('ws-1');
    expect(balance!.subscription_available).toBe(50);
    expect(balance!.topup_available).toBe(35);
  });

  // -------------------------------------------------------------------------
  // reserveCredits
  // -------------------------------------------------------------------------

  it('reserveCredits fails when balance is missing', async () => {
    const repo = createRepo();
    await expect(
      repo.reserveCredits({ workspaceId: 'ws-1', amount: 10, jobId: 'job-1' })
    ).rejects.toThrow();
  });

  it('reserveCredits fails on insufficient credits', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 5,
          topup_available: 0,
          reserved: 0,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    await expect(
      repo.reserveCredits({ workspaceId: 'ws-1', amount: 10, jobId: 'job-1' })
    ).rejects.toThrow('Insufficient credits');
  });

  it('reserveCredits draws subscription first', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 30,
          topup_available: 20,
          reserved: 0,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const result = await repo.reserveCredits({ workspaceId: 'ws-1', amount: 35, jobId: 'job-1' });
    expect(result.reservedAmount).toBe(35);

    const balance = await repo.getBalanceForWorkspace('ws-1');
    expect(balance!.subscription_available).toBe(0);
    expect(balance!.topup_available).toBe(15);
    expect(balance!.reserved).toBe(35);
  });

  // -------------------------------------------------------------------------
  // captureCredits
  // -------------------------------------------------------------------------

  it('captureCredits fails when no reservation exists', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 100,
          topup_available: 0,
          reserved: 0,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    await expect(
      repo.captureCredits({ workspaceId: 'ws-1', jobId: 'job-1', actualAmount: 10 })
    ).rejects.toThrow('Reservation not found');
  });

  it('captureCredits captures actual and refunds difference', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 0,
          topup_available: 15,
          reserved: 35,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      credit_ledger: [
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
        {
          id: 'ledger-2',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'topup',
          amount: -5,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const result = await repo.captureCredits({ workspaceId: 'ws-1', jobId: 'job-1', actualAmount: 25 });
    expect(result.captured).toBe(25);
    expect(result.refunded).toBe(10);

    const balance = await repo.getBalanceForWorkspace('ws-1');
    expect(balance!.reserved).toBe(0);
    expect(balance!.subscription_available).toBe(10); // refund goes to subscription
    expect(balance!.topup_available).toBe(15);
  });

  it('captureCredits with zero refund clears reserved fully', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 0,
          topup_available: 0,
          reserved: 20,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      credit_ledger: [
        {
          id: 'ledger-1',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'subscription',
          amount: -20,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const result = await repo.captureCredits({ workspaceId: 'ws-1', jobId: 'job-1', actualAmount: 20 });
    expect(result.captured).toBe(20);
    expect(result.refunded).toBe(0);

    const balance = await repo.getBalanceForWorkspace('ws-1');
    expect(balance!.reserved).toBe(0);
    expect(balance!.subscription_available).toBe(0);
  });

  // -------------------------------------------------------------------------
  // refundCredits
  // -------------------------------------------------------------------------

  it('refundCredits returns full reserved amount', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 0,
          topup_available: 15,
          reserved: 35,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      credit_ledger: [
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
        {
          id: 'ledger-2',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'topup',
          amount: -5,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const result = await repo.refundCredits({ workspaceId: 'ws-1', jobId: 'job-1' });
    expect(result.refunded).toBe(35);

    const balance = await repo.getBalanceForWorkspace('ws-1');
    expect(balance!.reserved).toBe(0);
    expect(balance!.subscription_available).toBe(35); // full refund to subscription in v1
    expect(balance!.topup_available).toBe(15);
  });

  it('refundCredits fails when no reservation exists', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 100,
          topup_available: 0,
          reserved: 0,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    await expect(
      repo.refundCredits({ workspaceId: 'ws-1', jobId: 'job-1' })
    ).rejects.toThrow('Reservation not found');
  });

  it('captureCredits is idempotent-safe by rejecting duplicate', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 0,
          topup_available: 15,
          reserved: 35,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      credit_ledger: [
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
        {
          id: 'ledger-2',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'topup',
          amount: -5,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    // First capture succeeds
    const first = await repo.captureCredits({ workspaceId: 'ws-1', jobId: 'job-1', actualAmount: 35 });
    expect(first.captured).toBe(35);

    // Second capture fails because reservation was consumed
    await expect(
      repo.captureCredits({ workspaceId: 'ws-1', jobId: 'job-1', actualAmount: 35 })
    ).rejects.toThrow('Reservation not found');
  });

  it('refundCredits is idempotent-safe by rejecting duplicate', async () => {
    const repo = createRepo({
      credit_balances: [
        {
          workspace_id: 'ws-1',
          subscription_available: 0,
          topup_available: 15,
          reserved: 35,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      credit_ledger: [
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
        {
          id: 'ledger-2',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'topup',
          amount: -5,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    // First refund succeeds
    const first = await repo.refundCredits({ workspaceId: 'ws-1', jobId: 'job-1' });
    expect(first.refunded).toBe(35);

    // Second refund fails because reservation was consumed
    await expect(
      repo.refundCredits({ workspaceId: 'ws-1', jobId: 'job-1' })
    ).rejects.toThrow('Reservation not found');
  });

  // -------------------------------------------------------------------------
  // listLedgerForWorkspace
  // -------------------------------------------------------------------------

  it('listLedgerForWorkspace scopes by workspace', async () => {
    const repo = createRepo({
      credit_ledger: [
        {
          id: 'l1',
          workspace_id: 'ws-1',
          entry_type: 'grant',
          bucket: 'subscription',
          amount: 100,
          job_id: null,
          expires_at: null,
          metadata: {},
          created_at: '2026-01-03T00:00:00Z',
        },
        {
          id: 'l2',
          workspace_id: 'ws-2',
          entry_type: 'grant',
          bucket: 'topup',
          amount: 50,
          job_id: null,
          expires_at: null,
          metadata: {},
          created_at: '2026-01-02T00:00:00Z',
        },
        {
          id: 'l3',
          workspace_id: 'ws-1',
          entry_type: 'reserve',
          bucket: 'subscription',
          amount: -20,
          job_id: 'job-1',
          expires_at: null,
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const rows = await repo.listLedgerForWorkspace({ workspaceId: 'ws-1' });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id).sort()).toEqual(['l1', 'l3']);
  });

  it('listLedgerForWorkspace respects limit', async () => {
    const repo = createRepo({
      credit_ledger: Array.from({ length: 10 }, (_, i) => ({
        id: `l${i}`,
        workspace_id: 'ws-1',
        entry_type: 'grant',
        bucket: 'subscription',
        amount: 1,
        job_id: null,
        expires_at: null,
        metadata: {},
        created_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      })),
    });

    const rows = await repo.listLedgerForWorkspace({ workspaceId: 'ws-1', limit: 5 });
    expect(rows).toHaveLength(5);
  });
});
