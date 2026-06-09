import { apiClient } from './client.js';
import type {
  CreditStatusResponse,
  CreditLedgerEntryDto,
  ListCreditLedgerParams,
} from './types.js';

// ---------------------------------------------------------------------------
// Credit API — read-only frontend interface
// ---------------------------------------------------------------------------
// Phase 10D: frontend reads credit status from the backend.
// All mutations (grant, reserve, capture, refund) remain backend/internal.

export async function getCreditStatus(): Promise<CreditStatusResponse> {
  return apiClient.request<CreditStatusResponse>('/credits');
}

export async function listCreditLedger(
  params?: ListCreditLedgerParams,
): Promise<CreditLedgerEntryDto[]> {
  const query = params?.limit ? `?limit=${params.limit}` : '';
  return apiClient.request<CreditLedgerEntryDto[]>(`/credits/ledger${query}`);
}
