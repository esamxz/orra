import type { DbClient } from '../db/client.js';
import type { CreditBalanceRow, CreditLedgerRow, Json } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// Credit repository
// ---------------------------------------------------------------------------
// Workspace-scoped credit ledger and balance CRUD.
// All mutation methods delegate to Postgres RPCs for atomicity.
// Read methods use normal Supabase queries.

export interface GrantCreditsInput {
  workspaceId: string;
  bucket: CreditLedgerRow['bucket'];
  amount: number;
  metadata?: Json;
}

export interface ReserveCreditsInput {
  workspaceId: string;
  amount: number;
  jobId: string;
  metadata?: Json;
}

export interface CaptureCreditsInput {
  workspaceId: string;
  jobId: string;
  actualAmount: number;
  metadata?: Json;
}

export interface RefundCreditsInput {
  workspaceId: string;
  jobId: string;
  metadata?: Json;
}

export interface ListLedgerInput {
  workspaceId: string;
  limit?: number;
}

export interface CreditRepository {
  getBalanceForWorkspace(workspaceId: string): Promise<CreditBalanceRow | null>;
  listLedgerForWorkspace(input: ListLedgerInput): Promise<CreditLedgerRow[]>;
  grantCredits(input: GrantCreditsInput): Promise<{ ledgerId: string }>;
  reserveCredits(input: ReserveCreditsInput): Promise<{ reservedAmount: number }>;
  captureCredits(input: CaptureCreditsInput): Promise<{ captured: number; refunded: number }>;
  refundCredits(input: RefundCreditsInput): Promise<{ refunded: number }>;
}

/**
 * Stub implementation that satisfies the interface but throws
 * "not implemented" for every method. Kept for testability.
 */
export class StubCreditRepository implements CreditRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getBalanceForWorkspace(_workspaceId: string): Promise<CreditBalanceRow | null> {
    throw new Error('CreditRepository.getBalanceForWorkspace is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async listLedgerForWorkspace(_input: ListLedgerInput): Promise<CreditLedgerRow[]> {
    throw new Error('CreditRepository.listLedgerForWorkspace is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async grantCredits(_input: GrantCreditsInput): Promise<{ ledgerId: string }> {
    throw new Error('CreditRepository.grantCredits is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async reserveCredits(_input: ReserveCreditsInput): Promise<{ reservedAmount: number }> {
    throw new Error('CreditRepository.reserveCredits is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async captureCredits(_input: CaptureCreditsInput): Promise<{ captured: number; refunded: number }> {
    throw new Error('CreditRepository.captureCredits is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refundCredits(_input: RefundCreditsInput): Promise<{ refunded: number }> {
    throw new Error('CreditRepository.refundCredits is not implemented yet.');
  }
}

/**
 * Production implementation backed by Supabase.
 * Mutations use atomic Postgres RPCs. Reads use normal queries.
 */
export class SupabaseCreditRepository implements CreditRepository {
  constructor(private db: DbClient) {}

  async getBalanceForWorkspace(workspaceId: string): Promise<CreditBalanceRow | null> {
    const { data, error } = await this.db
      .from('credit_balances')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async listLedgerForWorkspace(input: ListLedgerInput): Promise<CreditLedgerRow[]> {
    const limit = input.limit ?? 50;
    const { data, error } = await this.db
      .from('credit_ledger')
      .select('*')
      .eq('workspace_id', input.workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw mapDbError(error);
    }

    return data ?? [];
  }

  async grantCredits(input: GrantCreditsInput): Promise<{ ledgerId: string }> {
    const { data, error } = await this.db.rpc('grant_credits', {
      p_workspace_id: input.workspaceId,
      p_bucket: input.bucket,
      p_amount: input.amount,
      p_metadata: input.metadata ?? {},
    });

    if (error) {
      throw mapDbError(error);
    }

    const result = (data ?? {}) as Record<string, unknown>;
    return { ledgerId: String(result.ledger_id ?? '') };
  }

  async reserveCredits(input: ReserveCreditsInput): Promise<{ reservedAmount: number }> {
    const { data, error } = await this.db.rpc('reserve_credits', {
      p_workspace_id: input.workspaceId,
      p_amount: input.amount,
      p_job_id: input.jobId,
      p_metadata: input.metadata ?? {},
    });

    if (error) {
      throw mapDbError(error);
    }

    const result = (data ?? {}) as Record<string, unknown>;
    return { reservedAmount: Number(result.reserved_amount ?? 0) };
  }

  async captureCredits(input: CaptureCreditsInput): Promise<{ captured: number; refunded: number }> {
    const { data, error } = await this.db.rpc('capture_credits', {
      p_workspace_id: input.workspaceId,
      p_job_id: input.jobId,
      p_actual_amount: input.actualAmount,
      p_metadata: input.metadata ?? {},
    });

    if (error) {
      throw mapDbError(error);
    }

    const result = (data ?? {}) as Record<string, unknown>;
    return {
      captured: Number(result.captured ?? 0),
      refunded: Number(result.refunded ?? 0),
    };
  }

  async refundCredits(input: RefundCreditsInput): Promise<{ refunded: number }> {
    const { data, error } = await this.db.rpc('refund_credits', {
      p_workspace_id: input.workspaceId,
      p_job_id: input.jobId,
      p_metadata: input.metadata ?? {},
    });

    if (error) {
      throw mapDbError(error);
    }

    const result = (data ?? {}) as Record<string, unknown>;
    return { refunded: Number(result.refunded ?? 0) };
  }
}
