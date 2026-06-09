// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UsageStatus from '../UsageStatus';
import type { CreditStatusResponse } from '../../../api/types';

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

describe('UsageStatus', () => {
  it('renders real remaining credits in compact mode', () => {
    render(<UsageStatus compact status={mockStatus} />);
    expect(screen.getByText('770')).not.toBeNull();
    expect(screen.getByText('credits')).not.toBeNull();
  });

  it('shows reserved credits when nonzero', () => {
    render(<UsageStatus compact status={mockStatus} />);
    fireEvent.click(screen.getByTitle('Usage status'));
    expect(screen.getByText('Reserved')).not.toBeNull();
    expect(screen.getByText('30')).not.toBeNull();
  });

  it('does not show reserved when zero', () => {
    const statusNoReserved: CreditStatusResponse = {
      ...mockStatus,
      balance: { ...mockStatus.balance, reserved: 0 },
    };
    render(<UsageStatus compact status={statusNoReserved} />);
    fireEvent.click(screen.getByTitle('Usage status'));
    expect(screen.queryByText('Reserved')).toBeNull();
  });

  it('shows error state calmly', () => {
    render(<UsageStatus compact error="Unable to load usage status." />);
    expect(screen.getByText('Usage unavailable')).not.toBeNull();
  });

  it('shows loading state without crashing', () => {
    render(<UsageStatus compact loading={true} />);
    expect(screen.getByText('—')).not.toBeNull();
  });

  it('shows zero balance safely', () => {
    const zeroStatus: CreditStatusResponse = {
      balance: {
        workspaceId: 'ws-1',
        monthlyRemaining: 0,
        topupRemaining: 0,
        totalRemaining: 0,
        reserved: 0,
        resetAt: null,
      },
      recentLedger: [],
    };
    render(<UsageStatus status={zeroStatus} />);
    expect(screen.getByText('0 remaining')).not.toBeNull();
  });

  it('shows recent ledger entries in popover', () => {
    render(<UsageStatus compact status={mockStatus} />);
    fireEvent.click(screen.getByTitle('Usage status'));
    expect(screen.getByText('Recent usage')).not.toBeNull();
    expect(screen.getByText('reserve')).not.toBeNull();
  });

  it('Buy credits button is disabled placeholder', () => {
    render(<UsageStatus status={mockStatus} />);
    const btn = screen.getByRole('button', { name: /Buy credits/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('Upgrade button is disabled placeholder', () => {
    render(<UsageStatus status={mockStatus} />);
    const btn = screen.getByRole('button', { name: /Upgrade/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
