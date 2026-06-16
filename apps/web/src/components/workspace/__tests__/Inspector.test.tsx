// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import Inspector from '../Inspector';
import { makeArtifactSinglePost } from '../../../data/mockArtifacts';
import type { TextLayer } from '@orra/shared';

function getTextLayer(doc: ReturnType<typeof makeArtifactSinglePost>): TextLayer {
  const layer = doc.cards[0].layers.find((l) => l.type === 'text');
  if (!layer) throw new Error('No text layer in mock artifact');
  return layer as TextLayer;
}

function renderInspector(overrides?: {
  onAction?: ReturnType<typeof vi.fn>;
  onPreview?: ReturnType<typeof vi.fn>;
  layer?: TextLayer;
}) {
  const doc = makeArtifactSinglePost('@test');
  const card = doc.cards[0];
  const textLayer = overrides?.layer ?? getTextLayer(doc);
  const onAction = overrides?.onAction ?? vi.fn();
  const onPreview = overrides?.onPreview ?? vi.fn();

  const { rerender, unmount } = render(
    <Inspector
      layer={textLayer}
      cardId={card.id}
      cardW={doc.ratio.w}
      cardH={doc.ratio.h}
      cardLayers={card.layers}
      onAction={onAction}
      onPreview={onPreview}
      onClose={vi.fn()}
    />,
  );

  return { onAction, onPreview, textLayer, rerender, unmount };
}

describe('Inspector — FontDropdown', () => {
  it('calls onAction exactly once when font family changes', () => {
    const { onAction } = renderInspector();

    const select = screen.getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'Newsreader' } });

    expect(onAction).toHaveBeenCalledTimes(1);
    const call = onAction.mock.calls[0][0] as any;
    expect(call.type).toBe('setTextStyle');
    expect(call.style.fontFamily).toBe('Newsreader');
  });
});

describe('Inspector — WeightDropdown', () => {
  it('calls onAction exactly once when weight changes', () => {
    const { onAction } = renderInspector();

    const selects = screen.getAllByRole('combobox');
    // Weight is the second combobox (after font family)
    const weightSelect = selects[1];
    fireEvent.change(weightSelect, { target: { value: '700' } });

    expect(onAction).toHaveBeenCalledTimes(1);
    const call = onAction.mock.calls[0][0] as any;
    expect(call.type).toBe('setTextStyle');
    expect(call.style.fontWeight).toBe(700);
  });
});

describe('Inspector — SliderInput (font size)', () => {
  it('does not call onAction on range input change events', () => {
    const { onAction } = renderInspector();

    const sliders = screen.getAllByRole('slider');
    // First slider is font size
    const fontSizeSlider = sliders[0];

    fireEvent.change(fontSizeSlider, { target: { value: '50' } });
    fireEvent.change(fontSizeSlider, { target: { value: '80' } });
    fireEvent.change(fontSizeSlider, { target: { value: '120' } });

    expect(onAction).not.toHaveBeenCalled();
  });

  it('calls onPreview on each range input change', () => {
    const { onPreview } = renderInspector();

    const sliders = screen.getAllByRole('slider');
    const fontSizeSlider = sliders[0];

    fireEvent.change(fontSizeSlider, { target: { value: '50' } });
    fireEvent.change(fontSizeSlider, { target: { value: '80' } });

    expect(onPreview).toHaveBeenCalledTimes(2);
    expect((onPreview.mock.calls[0][0] as any).style.fontSize).toBe(50);
    expect((onPreview.mock.calls[1][0] as any).style.fontSize).toBe(80);
  });

  it('calls onAction exactly once on pointerUp with final value', () => {
    const { onAction } = renderInspector();

    const sliders = screen.getAllByRole('slider');
    const fontSizeSlider = sliders[0];

    // Simulate drag: several change events, then pointer release
    fireEvent.pointerDown(fontSizeSlider, { pointerId: 1 });
    fireEvent.change(fontSizeSlider, { target: { value: '50' } });
    fireEvent.change(fontSizeSlider, { target: { value: '80' } });
    // pointerUp reads from e.currentTarget.value — set it before firing
    Object.defineProperty(fontSizeSlider, 'value', { value: '80', writable: true });
    fireEvent.pointerUp(fontSizeSlider, { pointerId: 1 });

    expect(onAction).toHaveBeenCalledTimes(1);
    const call = onAction.mock.calls[0][0] as any;
    expect(call.type).toBe('setTextStyle');
    expect(call.style.fontSize).toBe(80);
  });

  it('calls onPreview(null) to clear preview before committing on pointerUp', () => {
    const { onAction, onPreview } = renderInspector();

    const sliders = screen.getAllByRole('slider');
    const fontSizeSlider = sliders[0];

    fireEvent.pointerDown(fontSizeSlider, { pointerId: 1 });
    fireEvent.change(fontSizeSlider, { target: { value: '60' } });
    Object.defineProperty(fontSizeSlider, 'value', { value: '60', writable: true });
    fireEvent.pointerUp(fontSizeSlider, { pointerId: 1 });

    // clearPreview() fires null before the action dispatch
    const nullCall = onPreview.mock.calls.find((c: any[]) => c[0] === null);
    expect(nullCall).toBeDefined();
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('Inspector — CompactNumber', () => {
  it('does not call onAction on each keystroke', () => {
    const { onAction } = renderInspector();

    const numberInputs = screen
      .getAllByRole('spinbutton')
      .filter((el) => el.classList.contains('insp-compact-input'));
    // W (width) input
    const widthInput = numberInputs[0];

    fireEvent.change(widthInput, { target: { value: '100' } });
    fireEvent.change(widthInput, { target: { value: '150' } });

    expect(onAction).not.toHaveBeenCalled();
  });

  it('calls onAction once on blur with the typed value', () => {
    const { onAction } = renderInspector();

    const numberInputs = screen
      .getAllByRole('spinbutton')
      .filter((el) => el.classList.contains('insp-compact-input'));
    const widthInput = numberInputs[0];

    fireEvent.change(widthInput, { target: { value: '200' } });
    fireEvent.blur(widthInput);

    expect(onAction).toHaveBeenCalledTimes(1);
    const call = onAction.mock.calls[0][0] as any;
    expect(call.type).toBe('updateLayerProps');
    expect(call.props.w).toBe(200);
  });

  it('calls onAction once on Enter key', () => {
    const { onAction } = renderInspector();

    const numberInputs = screen
      .getAllByRole('spinbutton')
      .filter((el) => el.classList.contains('insp-compact-input'));
    const widthInput = numberInputs[0];

    fireEvent.change(widthInput, { target: { value: '300' } });
    fireEvent.keyDown(widthInput, { key: 'Enter' });
    fireEvent.blur(widthInput); // blur fires after Enter triggers blur()

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('Escape restores the original value and does not call onAction', () => {
    const { onAction } = renderInspector();

    const numberInputs = screen
      .getAllByRole('spinbutton')
      .filter((el) => el.classList.contains('insp-compact-input'));
    const widthInput = numberInputs[0];

    const originalValue = (widthInput as HTMLInputElement).value;

    fireEvent.change(widthInput, { target: { value: '999' } });
    fireEvent.keyDown(widthInput, { key: 'Escape' });
    fireEvent.blur(widthInput);

    expect(onAction).not.toHaveBeenCalled();
    expect((widthInput as HTMLInputElement).value).toBe(originalValue);
  });
});

describe('Inspector — SwatchInput', () => {
  it('calls onAction immediately when a swatch preset is clicked', () => {
    const { onAction } = renderInspector();

    const swatchButtons = screen
      .getAllByRole('button')
      .filter((b) => b.classList.contains('insp-swatch'));
    // Click the first non-active swatch
    const target = swatchButtons.find(
      (b) => !b.classList.contains('active'),
    );
    if (!target) return; // skip if all swatches are active

    fireEvent.click(target);

    expect(onAction).toHaveBeenCalledTimes(1);
    const call = onAction.mock.calls[0][0] as any;
    expect(call.type).toBe('setTextStyle');
    expect(typeof call.style.color).toBe('string');
  });

  it('calls onPreview during color picker change, not onAction', () => {
    const { onAction, onPreview } = renderInspector();

    const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    if (!colorInput) return;

    fireEvent.change(colorInput, { target: { value: '#123456' } });

    expect(onAction).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalled();
    const previewCall = onPreview.mock.calls.find(
      (c: any[]) => c[0] !== null && c[0].style?.color !== undefined,
    );
    expect(previewCall).toBeDefined();
  });

  it('calls onAction once when color picker blurs (commits)', () => {
    const { onAction } = renderInspector();

    const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    if (!colorInput) return;

    fireEvent.change(colorInput, { target: { value: '#abcdef' } });
    fireEvent.blur(colorInput);

    expect(onAction).toHaveBeenCalledTimes(1);
    const call = onAction.mock.calls[0][0] as any;
    expect(call.type).toBe('setTextStyle');
    expect(call.style.color).toBe('#abcdef');
  });
});

describe('Inspector — AlignmentInput', () => {
  it('calls onAction immediately on alignment button click', () => {
    const { onAction } = renderInspector();

    // AlignmentInput buttons each carry title="left", "center", or "right".
    // Query by title to avoid accidentally clicking StylePreset or Layer-order buttons,
    // which share the .insp-seg class.
    const btn = screen.getByTitle('center');
    fireEvent.click(btn);

    expect(onAction).toHaveBeenCalledTimes(1);
    const call = onAction.mock.calls[0][0] as any;
    expect(call.type).toBe('setTextStyle');
    expect(['left', 'center', 'right']).toContain(call.style.align);
  });
});

describe('Inspector — integration: drag font size slider', () => {
  it('canvas preview changes on each tick; exactly one action committed on pointerUp', () => {
    const { onAction, onPreview } = renderInspector();

    const sliders = screen.getAllByRole('slider');
    const fontSizeSlider = sliders[0];

    // Simulate a full drag gesture through several values
    fireEvent.pointerDown(fontSizeSlider, { pointerId: 1 });
    for (const size of [30, 50, 70, 100]) {
      fireEvent.change(fontSizeSlider, { target: { value: String(size) } });
    }
    Object.defineProperty(fontSizeSlider, 'value', { value: '100', writable: true });
    fireEvent.pointerUp(fontSizeSlider, { pointerId: 1 });

    // One preview call per drag tick
    const previewCalls = onPreview.mock.calls.filter(
      (c: any[]) => c[0] !== null && c[0].style?.fontSize !== undefined,
    );
    expect(previewCalls.length).toBe(4);
    expect(previewCalls[previewCalls.length - 1][0].style.fontSize).toBe(100);

    // Exactly one persisted action with the final value
    expect(onAction).toHaveBeenCalledTimes(1);
    const call = onAction.mock.calls[0][0] as any;
    expect(call.type).toBe('setTextStyle');
    expect(call.style.fontSize).toBe(100);
  });
});
