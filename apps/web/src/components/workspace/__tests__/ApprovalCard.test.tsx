// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ApprovalCard from '../ApprovalCard';

function makeSpecs(overrides: Record<string, unknown> = {}) {
  return {
    lead: 'Ready to create a post about focus.',
    style: 'calm, premium, focused',
    format: '4:5',
    brand: 'No brand selected',
    cta: 'Not set',
    ...overrides,
  };
}

describe('ApprovalCard', () => {
  it('renders the lead text', () => {
    render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('Ready to create a post about focus.')).not.toBeNull();
  });

  it('renders style, format, and brand rows', () => {
    render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('Style')).not.toBeNull();
    expect(screen.getByText('calm, premium, focused')).not.toBeNull();
    expect(screen.getByText('Format')).not.toBeNull();
    expect(screen.getByText('4:5')).not.toBeNull();
    expect(screen.getByText('Brand')).not.toBeNull();
    expect(screen.getByText('No brand selected')).not.toBeNull();
  });

  it('renders Cards row when cardCount is provided', () => {
    render(
      <ApprovalCard
        specs={makeSpecs({ cardCount: 5 })}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('Cards')).not.toBeNull();
    expect(screen.getByText('5')).not.toBeNull();
  });

  it('hides Cards row when cardCount is absent', () => {
    render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByText('Cards')).toBeNull();
  });

  it('renders Visual row when visualDirection is provided', () => {
    render(
      <ApprovalCard
        specs={makeSpecs({ visualDirection: 'soft natural light, muted tones' })}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('Visual')).not.toBeNull();
    expect(screen.getByText('soft natural light, muted tones')).not.toBeNull();
  });

  it('hides Visual row when visualDirection is absent', () => {
    render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByText('Visual')).toBeNull();
  });

  it('renders Context row when memorySummary is provided', () => {
    render(
      <ApprovalCard
        specs={makeSpecs({ memorySummary: 'User focuses on wellness content for Instagram.' })}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('Context')).not.toBeNull();
    expect(screen.getByText('User focuses on wellness content for Instagram.')).not.toBeNull();
  });

  it('hides Context row when memorySummary is absent', () => {
    render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByText('Context')).toBeNull();
  });

  it('renders styleNotes tags when provided', () => {
    render(
      <ApprovalCard
        specs={makeSpecs({ styleNotes: ['Keep backgrounds clean.'] })}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('Keep backgrounds clean.')).not.toBeNull();
  });

  it('hides styleNotes section when absent', () => {
    const { container } = render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(container.querySelector('.ap-notes')).toBeNull();
  });

  it('calls onApprove when Approve button is clicked', () => {
    const onApprove = vi.fn();
    render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={onApprove}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve & create/i }));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('calls onEdit when Edit direction button is clicked', () => {
    const onEdit = vi.fn();
    render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit direction/i }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('shows Add CTA button when ctaSet is false', () => {
    render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Add CTA/i })).not.toBeNull();
  });

  it('hides Add CTA button when ctaSet is true', () => {
    render(
      <ApprovalCard
        specs={makeSpecs({ cta: 'Visit the link in bio' })}
        ctaSet={true}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Add CTA/i })).toBeNull();
  });

  it('returns null when specs is null', () => {
    const { container } = render(
      <ApprovalCard
        specs={null}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders all new optional fields together without errors', () => {
    render(
      <ApprovalCard
        specs={makeSpecs({
          cardCount: 5,
          visualDirection: 'editorial, clean',
          styleNotes: ['No clutter.', 'Brand colors only.'],
          memorySummary: 'Wellness content for founders.',
        })}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('5')).not.toBeNull();
    expect(screen.getByText('editorial, clean')).not.toBeNull();
    expect(screen.getByText('No clutter.')).not.toBeNull();
    expect(screen.getByText('Wellness content for founders.')).not.toBeNull();
  });

  it('disabled prop reduces opacity', () => {
    const { container } = render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        disabled={true}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    const approval = container.querySelector('.approval') as HTMLElement;
    expect(approval.style.opacity).toBe('0.6');
  });

  // W5: carousel approval variants
  it('renders "Create all cards" button when cardCount is present', () => {
    render(
      <ApprovalCard
        specs={makeSpecs({ cardCount: 5 })}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Create all cards/i })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Approve & create/i })).toBeNull();
  });

  it('renders "Create card by card" button when cardCount is present and onCreateCardByCard provided', () => {
    render(
      <ApprovalCard
        specs={makeSpecs({ cardCount: 5 })}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
        onCreateCardByCard={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Create card by card/i })).not.toBeNull();
  });

  it('does not render "Create card by card" when onCreateCardByCard is absent', () => {
    render(
      <ApprovalCard
        specs={makeSpecs({ cardCount: 5 })}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Create card by card/i })).toBeNull();
  });

  it('calls onCreateCardByCard when "Create card by card" is clicked', () => {
    const onCreateCardByCard = vi.fn();
    render(
      <ApprovalCard
        specs={makeSpecs({ cardCount: 3 })}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
        onCreateCardByCard={onCreateCardByCard}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Create card by card/i }));
    expect(onCreateCardByCard).toHaveBeenCalledOnce();
  });

  it('renders "Approve & create" for single post (no cardCount)', () => {
    render(
      <ApprovalCard
        specs={makeSpecs()}
        ctaSet={false}
        onApprove={vi.fn()}
        onAddCta={vi.fn()}
        onEdit={vi.fn()}
        onCreateCardByCard={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Approve & create/i })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Create all cards/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Create card by card/i })).toBeNull();
  });
});
