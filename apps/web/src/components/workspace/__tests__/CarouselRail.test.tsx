// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CarouselRail from '../CarouselRail';
import type { ArtifactDocument } from '@orra/shared';

function makeArtifact(cardCount = 3): ArtifactDocument {
  const cards = Array.from({ length: cardCount }, (_, i) => ({
    id: `card-${i + 1}-${'0'.repeat(24 - String(i + 1).length)}${i + 1}`.padEnd(36, '0').slice(0, 36).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'),
    index: i,
    baseColor: '#1d2a30',
    layers: [],
  }));
  // Use deterministic UUIDs
  const fixedCards = cards.map((c, i) => ({
    ...c,
    id: `${String(i + 1).padStart(8, '0')}-0000-0000-0000-000000000000`,
  }));
  return {
    schemaVersion: 1,
    artifactId: 'aaaaaaaa-0000-0000-0000-000000000000',
    type: 'carousel',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: fixedCards,
    version: 1,
  };
}

const defaultProps = {
  activeCardIndex: 0,
  ratio: '4:5',
  isCardByCardMode: false,
  activeJobId: undefined,
  onSelectCard: vi.fn(),
  onAddCard: vi.fn(),
  onDuplicateCard: vi.fn(),
  onDeleteCard: vi.fn(),
  onGenerateCard: undefined,
};

describe('CarouselRail', () => {
  it('renders card thumbnails for each card', () => {
    const artifact = makeArtifact(3);
    const { container } = render(
      <CarouselRail {...defaultProps} artifact={artifact} />,
    );
    const items = container.querySelectorAll('.rail-item');
    expect(items.length).toBe(3);
  });

  it('renders card number labels', () => {
    const artifact = makeArtifact(3);
    render(<CarouselRail {...defaultProps} artifact={artifact} />);
    expect(screen.getByText('1')).not.toBeNull();
    expect(screen.getByText('2')).not.toBeNull();
    expect(screen.getByText('3')).not.toBeNull();
  });

  it('highlights the active card', () => {
    const artifact = makeArtifact(3);
    const { container } = render(
      <CarouselRail {...defaultProps} artifact={artifact} activeCardIndex={1} />,
    );
    const items = container.querySelectorAll('.rail-item');
    expect(items[0].classList.contains('active')).toBe(false);
    expect(items[1].classList.contains('active')).toBe(true);
    expect(items[2].classList.contains('active')).toBe(false);
  });

  it('calls onSelectCard with the correct index when a card is clicked', () => {
    const onSelectCard = vi.fn();
    const artifact = makeArtifact(3);
    const { container } = render(
      <CarouselRail {...defaultProps} artifact={artifact} onSelectCard={onSelectCard} />,
    );
    const items = container.querySelectorAll('.rail-item');
    fireEvent.click(items[2]);
    expect(onSelectCard).toHaveBeenCalledWith(2);
  });

  it('calls onAddCard when the add button is clicked', () => {
    const onAddCard = vi.fn();
    const artifact = makeArtifact(2);
    render(<CarouselRail {...defaultProps} artifact={artifact} onAddCard={onAddCard} />);
    fireEvent.click(screen.getByTitle('Add card'));
    expect(onAddCard).toHaveBeenCalledOnce();
  });

  it('calls onDeleteCard when a per-card delete button is clicked', () => {
    const onDeleteCard = vi.fn();
    const artifact = makeArtifact(3);
    const { container } = render(
      <CarouselRail {...defaultProps} artifact={artifact} onDeleteCard={onDeleteCard} />,
    );
    const delButtons = container.querySelectorAll('.del');
    fireEvent.click(delButtons[1]);
    expect(onDeleteCard).toHaveBeenCalledWith(1, expect.anything());
  });

  it('disables add/duplicate/delete buttons when activeJobId is set', () => {
    const artifact = makeArtifact(2);
    const { container } = render(
      <CarouselRail {...defaultProps} artifact={artifact} activeJobId="job-123" />,
    );
    const buttons = container.querySelectorAll('button');
    const disabledButtons = Array.from(buttons).filter((b) => b.disabled);
    expect(disabledButtons.length).toBeGreaterThan(0);
  });

  it('does not show generate buttons when isCardByCardMode is false', () => {
    const artifact = makeArtifact(3);
    const { container } = render(
      <CarouselRail
        {...defaultProps}
        artifact={artifact}
        isCardByCardMode={false}
        onGenerateCard={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('.rail-gen').length).toBe(0);
  });

  it('shows generate buttons per card when isCardByCardMode is true and onGenerateCard provided', () => {
    const artifact = makeArtifact(3);
    const { container } = render(
      <CarouselRail
        {...defaultProps}
        artifact={artifact}
        isCardByCardMode={true}
        onGenerateCard={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('.rail-gen').length).toBe(3);
  });

  it('calls onGenerateCard with the correct card id', () => {
    const onGenerateCard = vi.fn();
    const artifact = makeArtifact(3);
    const { container } = render(
      <CarouselRail
        {...defaultProps}
        artifact={artifact}
        isCardByCardMode={true}
        onGenerateCard={onGenerateCard}
      />,
    );
    const genButtons = container.querySelectorAll('.rail-gen');
    fireEvent.click(genButtons[1]);
    expect(onGenerateCard).toHaveBeenCalledWith(artifact.cards[1].id);
  });

  it('shows card-by-card badge when isCardByCardMode is true', () => {
    const artifact = makeArtifact(2);
    const { container } = render(
      <CarouselRail {...defaultProps} artifact={artifact} isCardByCardMode={true} />,
    );
    expect(container.querySelector('.cbcb-badge')).not.toBeNull();
  });

  it('does not show card-by-card badge when isCardByCardMode is false', () => {
    const artifact = makeArtifact(2);
    const { container } = render(
      <CarouselRail {...defaultProps} artifact={artifact} isCardByCardMode={false} />,
    );
    expect(container.querySelector('.cbcb-badge')).toBeNull();
  });
});
