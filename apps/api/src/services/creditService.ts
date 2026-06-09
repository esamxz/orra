import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { CreditRepository } from '../repositories/creditRepository.js';
import type { CreditBalanceRow, CreditLedgerRow, Json } from '@orra/db';

// ---------------------------------------------------------------------------
// Credit service
// ---------------------------------------------------------------------------
// Business logic for credit balance and ledger operations.
// Mutation methods are internal-only in Phase 10A; no public routes expose
// grant, reserve, capture, or refund.

export interface CreditBalanceDto {
  workspaceId: string;
  monthlyRemaining: number;
  topupRemaining: number;
  totalRemaining: number;
  reserved: number;
  resetAt: string | null;
}

export interface CreditLedgerEntryDto {
  id: string;
  workspaceId: string;
  entryType: CreditLedgerRow['entry_type'];
  bucket: CreditLedgerRow['bucket'];
  amount: number;
  jobId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreditStatusResponse {
  balance: CreditBalanceDto;
  recentLedger: CreditLedgerEntryDto[];
}

export interface GrantCreditsInternalInput {
  bucket: CreditLedgerRow['bucket'];
  amount: number;
  metadata?: Json;
}

export interface ReserveCreditsInternalInput {
  amount: number;
  jobId: string;
  metadata?: Json;
}

export interface CaptureCreditsInternalInput {
  jobId: string;
  actualAmount: number;
  metadata?: Json;
}

export interface RefundCreditsInternalInput {
  jobId: string;
  metadata?: Json;
}

function mapBalanceRow(row: CreditBalanceRow): CreditBalanceDto {
  const monthlyRemaining = row.subscription_available;
  const topupRemaining = row.topup_available;
  return {
    workspaceId: row.workspace_id,
    monthlyRemaining,
    topupRemaining,
    totalRemaining: monthlyRemaining + topupRemaining,
    reserved: row.reserved,
    resetAt: null,
  };
}

function mapLedgerRow(row: CreditLedgerRow): CreditLedgerEntryDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    entryType: row.entry_type,
    bucket: row.bucket,
    amount: row.amount,
    jobId: row.job_id ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

export class CreditService {
  constructor(private creditRepo: CreditRepository) {}

  /**
   * Get the current credit status for the authenticated workspace.
   * Returns balance and a limited set of recent ledger entries.
   */
  async getCreditStatus(ctx: ServiceContext): Promise<CreditStatusResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const balanceRow = await this.creditRepo.getBalanceForWorkspace(workspaceId);
    const ledgerRows = await this.creditRepo.listLedgerForWorkspace({
      workspaceId,
      limit: 20,
    });

    const balance: CreditBalanceDto = balanceRow
      ? mapBalanceRow(balanceRow)
      : {
          workspaceId,
          monthlyRemaining: 0,
          topupRemaining: 0,
          totalRemaining: 0,
          reserved: 0,
          resetAt: null,
        };

    return {
      balance,
      recentLedger: ledgerRows.map(mapLedgerRow),
    };
  }

  /**
   * List ledger entries for the authenticated workspace.
   */
  async listLedger(
    ctx: ServiceContext,
    query: { limit?: number }
  ): Promise<CreditLedgerEntryDto[]> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const rows = await this.creditRepo.listLedgerForWorkspace({
      workspaceId,
      limit: query.limit ?? 50,
    });

    return rows.map(mapLedgerRow);
  }

  /**
   * Internal: grant credits to a workspace bucket.
   * Not exposed as a public route in Phase 10A.
   */
  async grantCreditsInternal(
    ctx: ServiceContext,
    input: GrantCreditsInternalInput
  ): Promise<{ ledgerId: string }> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    if (input.amount <= 0) {
      throw new ApiError('VALIDATION', 'Grant amount must be positive.');
    }

    return this.creditRepo.grantCredits({
      workspaceId,
      bucket: input.bucket,
      amount: input.amount,
      metadata: input.metadata,
    });
  }

  /**
   * Internal: reserve credits for a generation job.
   * Not exposed as a public route in Phase 10A.
   * Throws INSUFFICIENT_CREDITS when the workspace lacks enough available credits.
   */
  async reserveCreditsInternal(
    ctx: ServiceContext,
    input: ReserveCreditsInternalInput
  ): Promise<{ reservedAmount: number }> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    if (input.amount <= 0) {
      throw new ApiError('VALIDATION', 'Reserve amount must be positive.');
    }

    try {
      return await this.creditRepo.reserveCredits({
        workspaceId,
        amount: input.amount,
        jobId: input.jobId,
        metadata: input.metadata,
      });
    } catch (err) {
      // Map the RPC insufficient-credits exception to a stable ApiError.
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION' || err.code === 'CONFLICT') {
          throw new ApiError('INSUFFICIENT_CREDITS', 'Insufficient credits to reserve for this job.');
        }
        throw err;
      }

      // Heuristic: inspect raw error messages from the DB mapping layer.
      const msg = String((err as Error)?.message ?? '').toLowerCase();
      if (msg.includes('insufficient credits') || msg.includes('p0001')) {
        throw new ApiError('INSUFFICIENT_CREDITS', 'Insufficient credits to reserve for this job.');
      }
      throw err;
    }
  }

  /**
   * Internal: capture actual credits from a previous reservation.
   * Not exposed as a public route in Phase 10A.
   */
  async captureCreditsInternal(
    ctx: ServiceContext,
    input: CaptureCreditsInternalInput
  ): Promise<{ captured: number; refunded: number }> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    if (input.actualAmount < 0) {
      throw new ApiError('VALIDATION', 'Capture amount cannot be negative.');
    }

    return this.creditRepo.captureCredits({
      workspaceId,
      jobId: input.jobId,
      actualAmount: input.actualAmount,
      metadata: input.metadata,
    });
  }

  /**
   * Internal: refund all reserved credits for a job.
   * Not exposed as a public route in Phase 10A.
   */
  async refundCreditsInternal(
    ctx: ServiceContext,
    input: RefundCreditsInternalInput
  ): Promise<{ refunded: number }> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    return this.creditRepo.refundCredits({
      workspaceId,
      jobId: input.jobId,
      metadata: input.metadata,
    });
  }
}
