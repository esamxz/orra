// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateBrandSystemModal from '../CreateBrandSystemModal';

describe('CreateBrandSystemModal upload', () => {
  function renderModal(props?: Partial<Parameters<typeof CreateBrandSystemModal>[0]>) {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    const { container } = render(
      <CreateBrandSystemModal
        open={true}
        onClose={onClose}
        onCreate={onCreate}
        {...props}
      />,
    );
    return { onClose, onCreate, container };
  }

  it('brand creation still succeeds if no logo selected', async () => {
    const { onCreate, container } = renderModal();

    const nameInput = screen.getByPlaceholderText('Enter brand name');
    fireEvent.change(nameInput, { target: { value: 'Test Brand' } });

    const form = container.querySelector('form');
    fireEvent.submit(form!);

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Brand' }),
      null,
    );
  });

  it('logo file selection triggers upload after brand creation', async () => {
    const { onCreate, container } = renderModal();

    const nameInput = screen.getByPlaceholderText('Enter brand name');
    fireEvent.change(nameInput, { target: { value: 'Test Brand' } });

    // Select a logo file via the hidden input
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const form = container.querySelector('form');
    fireEvent.submit(form!);

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Brand' }),
      expect.any(File),
    );
  });

  it('rejects unsupported logo file type client-side', async () => {
    const { container } = renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['logo'], 'logo.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(container.textContent).toContain('Unsupported file type');
    });
  });

  it('rejects oversized logo file client-side', async () => {
    const { container } = renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'.repeat(11 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(container.textContent).toContain('too large');
    });
  });
});
