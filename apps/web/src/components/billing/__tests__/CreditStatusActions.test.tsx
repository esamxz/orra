// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreditStatusActions from '../CreditStatusActions';

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('CreditStatusActions', () => {
  it('renders compact credit status with real remaining value', () => {
    renderWithRouter(
      <CreditStatusActions remaining={847} monthlyCredits={500} compact />
    );
    expect(screen.getByTestId('credit-remaining').textContent).toBe('847');
    expect(screen.getByText('credits')).not.toBeNull();
  });

  it('shows loading state without crashing', () => {
    renderWithRouter(
      <CreditStatusActions remaining={null} monthlyCredits={null} loading compact />
    );
    expect(screen.getByTestId('credit-remaining').textContent).toBe('—');
  });

  it('renders gracefully when credits are unavailable', () => {
    renderWithRouter(
      <CreditStatusActions remaining={null} monthlyCredits={null} />
    );
    expect(screen.getByText('Usage unavailable')).not.toBeNull();
    expect(screen.queryByTestId('credit-remaining')).toBeNull();
  });

  it('does not show Buy credits button when onBuyCredits is omitted', () => {
    renderWithRouter(
      <CreditStatusActions remaining={100} monthlyCredits={100} compact />
    );
    expect(screen.queryByTestId('buy-credits-link')).toBeNull();
  });

  it('does not show Upgrade button when onUpgrade is omitted', () => {
    renderWithRouter(
      <CreditStatusActions remaining={100} monthlyCredits={100} compact />
    );
    expect(screen.queryByTestId('upgrade-link')).toBeNull();
  });

  it('calls onBuyCredits when Buy credits link is clicked', () => {
    const onBuy = vi.fn();
    renderWithRouter(
      <CreditStatusActions remaining={100} monthlyCredits={100} compact onBuyCredits={onBuy} />
    );
    fireEvent.click(screen.getByTestId('buy-credits-link'));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it('calls onUpgrade when Upgrade link is clicked', () => {
    const onUpgrade = vi.fn();
    renderWithRouter(
      <CreditStatusActions remaining={100} monthlyCredits={100} compact onUpgrade={onUpgrade} />
    );
    fireEvent.click(screen.getByTestId('upgrade-link'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('renders full mode with monthly credits', () => {
    renderWithRouter(
      <CreditStatusActions remaining={250} monthlyCredits={200} onBuyCredits={vi.fn()} onUpgrade={vi.fn()} />
    );
    expect(screen.getByTestId('credit-remaining').textContent).toBe('250 remaining');
    expect(screen.getByText(/Monthly credits:/)).not.toBeNull();
    expect(screen.getByText('200')).not.toBeNull();
  });

  it('renders zero credits safely', () => {
    renderWithRouter(
      <CreditStatusActions remaining={0} monthlyCredits={0} compact />
    );
    expect(screen.getByTestId('credit-remaining').textContent).toBe('0');
  });
});
