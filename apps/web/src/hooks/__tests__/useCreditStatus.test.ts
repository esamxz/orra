// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCreditStatus } from '../useCreditStatus';
import * as creditsApi from '../../api/credits.js';
import { ApiClientError } from '../../api/errors.js';
import type { CreditStatusResponse } from '../../api/types.js';

vi.mock('../../api/credits.js', () => ({
  getCreditStatus: vi.fn(),
}));

const mockStatus: CreditStatusResponse = {
  balance: {
    workspaceId: 'ws-1',
    monthlyRemaining: 620,
    topupRemaining: 150,
    totalRemaining: 770,
    reserved: 30,
    resetAt: '2026-07-01',
  },
  recentLedger: [
    {
      id: 'ledger-1',
      workspaceId: 'ws-1',
      entryType: 'reserve',
      bucket: 'subscription',
      amount: -30,
      jobId: 'job-1',
      metadata: {},
      createdAt: '2026-06-08T00:00:00Z',
    },
  ],
};

describe('useCreditStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state is loading with no data', () => {
    const { result } = renderHook(() => useCreditStatus(false));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loads credit status successfully', async () => {
    vi.mocked(creditsApi.getCreditStatus).mockResolvedValueOnce(mockStatus);

    const { result } = renderHook(() => useCreditStatus(true));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data!.balance.totalRemaining).toBe(770);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles UNAUTHENTICATED calmly', async () => {
    vi.mocked(creditsApi.getCreditStatus).mockRejectedValueOnce(
      new ApiClientError('UNAUTHENTICATED', 'Not authenticated'),
    );

    const { result } = renderHook(() => useCreditStatus(true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('handles network error', async () => {
    vi.mocked(creditsApi.getCreditStatus).mockRejectedValueOnce(new Error('net::ERR_FAILED'));

    const { result } = renderHook(() => useCreditStatus(true));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Unable to load usage status.');
  });

  it('handles ApiClientError with custom message', async () => {
    vi.mocked(creditsApi.getCreditStatus).mockRejectedValueOnce(
      new ApiClientError('NOT_FOUND', 'Workspace not found'),
    );

    const { result } = renderHook(() => useCreditStatus(true));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe('Workspace not found');
  });

  it('reload refetches credit status', async () => {
    vi.mocked(creditsApi.getCreditStatus)
      .mockResolvedValueOnce(mockStatus)
      .mockResolvedValueOnce({
        ...mockStatus,
        balance: { ...mockStatus.balance, totalRemaining: 500 },
      });

    const { result } = renderHook(() => useCreditStatus(true));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data!.balance.totalRemaining).toBe(770);

    result.current.reload();

    await waitFor(() => expect(result.current.data!.balance.totalRemaining).toBe(500));
    expect(result.current.error).toBeNull();
  });

  it('does not call API when disabled', async () => {
    renderHook(() => useCreditStatus(false));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(creditsApi.getCreditStatus).not.toHaveBeenCalled();
  });

  it('shows zero balance safely', async () => {
    vi.mocked(creditsApi.getCreditStatus).mockResolvedValueOnce({
      balance: {
        workspaceId: 'ws-1',
        monthlyRemaining: 0,
        topupRemaining: 0,
        totalRemaining: 0,
        reserved: 0,
        resetAt: null,
      },
      recentLedger: [],
    });

    const { result } = renderHook(() => useCreditStatus(true));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data!.balance.totalRemaining).toBe(0);
    expect(result.current.error).toBeNull();
  });
});
