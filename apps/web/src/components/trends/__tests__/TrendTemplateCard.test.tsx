// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrendTemplateCard } from '../TrendTemplateCard';

const TITLE = 'Quiet Editorial';
const LABEL = 'Style';
const PROMPT = 'Create a calm editorial post with minimal typography.';

function renderCard(props: Partial<React.ComponentProps<typeof TrendTemplateCard>> = {}) {
  return render(
    <TrendTemplateCard
      title={TITLE}
      label={LABEL}
      previewUrl="https://example.com/preview.png"
      onClick={vi.fn()}
      {...props}
    />
  );
}

describe('TrendTemplateCard', () => {
  it('renders the title', () => {
    renderCard();
    expect(screen.getByText(TITLE)).not.toBeNull();
  });

  it('renders the label when provided', () => {
    renderCard();
    expect(screen.getByText(LABEL)).not.toBeNull();
  });

  it('renders a default label when label is missing', () => {
    renderCard({ label: null });
    expect(screen.getByText('Template')).not.toBeNull();
  });

  it('does not render the prompt text', () => {
    renderCard({ previewUrl: null });
    expect(screen.queryByText(PROMPT)).toBeNull();
  });

  it('does not render a heart or like button', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
    expect(screen.queryByLabelText(/favorite/i)).toBeNull();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    renderCard({ onClick: handleClick });
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('has an accessible aria-label including the title', () => {
    renderCard();
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toContain(TITLE);
  });

  it('renders the preview image when previewUrl exists', () => {
    renderCard({ previewUrl: 'https://example.com/preview.png' });
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://example.com/preview.png');
    expect(img.getAttribute('alt')).toBe(TITLE);
  });

  it('renders fallback visual when previewUrl is null', () => {
    const { container } = renderCard({ previewUrl: null });
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('.bg-gradient-to-br')).not.toBeNull();
  });

  it('renders fallback visual after image fails to load', () => {
    const { container } = renderCard({ previewUrl: 'https://example.com/broken.png' });
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('.bg-gradient-to-br')).not.toBeNull();
  });

  it('is disabled when disabled prop is true', () => {
    renderCard({ disabled: true });
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });
});
