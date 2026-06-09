import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCreditStatus, listCreditLedger } from '../credits.js';
import * as clientModule from '../client.js';
import { ApiClientError } from '../errors.js';

vi.mock('../client.js', async () => {
  const actual = await vi.importActual<typeof import('../client.js')>('../client.js');
  return {
    ...actual,
    apiClient: {
      request: vi.fn(),
      getAuthToken: vi.fn().mockResolvedValue(null),
      setAuthTokenProvider: vi.fn(),
    },
  };
});

const mockStatus = {
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

describe('credits API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getCreditStatus calls GET /v1/credits', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockStatus);

    await getCreditStatus();
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/credits');
  });

  it('getCreditStatus returns CreditStatusResponse', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockStatus);

    const result = await getCreditStatus();
    expect(result.balance.totalRemaining).toBe(770);
    expect(result.balance.monthlyRemaining).toBe(620);
    expect(result.recentLedger.length).toBe(1);
  });

  it('listCreditLedger calls GET /v1/credits/ledger', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockStatus.recentLedger);

    await listCreditLedger();
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/credits/ledger');
  });

  it('listCreditLedger passes limit query param', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockStatus.recentLedger);

    await listCreditLedger({ limit: 10 });
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/credits/ledger?limit=10');
  });

  it('maps ApiClientError on getCreditStatus failure', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('UNAUTHENTICATED', 'Not authenticated'),
    );

    await expect(getCreditStatus()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('maps ApiClientError message on getCreditStatus failure', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('UNAUTHENTICATED', 'Not authenticated'),
    );

    await expect(getCreditStatus()).rejects.toThrow('Not authenticated');
  });

  it('maps ApiClientError on listCreditLedger failure', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('NETWORK_ERROR', 'Unable to reach server'),
    );

    await expect(listCreditLedger()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('maps INSUFFICIENT_CREDITS if backend returns it', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('INSUFFICIENT_CREDITS', 'Not enough credits'),
    );

    await expect(getCreditStatus()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('maps INSUFFICIENT_CREDITS message if backend returns it', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('INSUFFICIENT_CREDITS', 'Not enough credits'),
    );

    await expect(getCreditStatus()).rejects.toThrow('Not enough credits');
  });
});
