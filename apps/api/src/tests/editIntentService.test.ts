import { describe, it, expect } from 'vitest';
import { classifyEditIntent } from '../services/editIntentService.js';

describe('classifyEditIntent', () => {
  // ---------------------------------------------------------------------------
  // Text content: title
  // ---------------------------------------------------------------------------

  it('"change title to Build better habits" → text_content role=title', () => {
    const result = classifyEditIntent('change title to Build better habits');
    expect(result).toEqual({ type: 'text_content', targetRole: 'title', newContent: 'Build better habits' });
  });

  it('"set title to: Start today" → strips colon, role=title', () => {
    const result = classifyEditIntent('set title to: Start today');
    expect(result).toEqual({ type: 'text_content', targetRole: 'title', newContent: 'Start today' });
  });

  it('change title to "Morning Routine" → strips quotes', () => {
    const result = classifyEditIntent('change title to "Morning Routine"');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('text_content');
    expect(result?.targetRole).toBe('title');
    expect(result?.newContent).toBe('Morning Routine');
  });

  it('"update the title to Consistency wins" → role=title', () => {
    const result = classifyEditIntent('update the title to Consistency wins');
    expect(result).toEqual({ type: 'text_content', targetRole: 'title', newContent: 'Consistency wins' });
  });

  // ---------------------------------------------------------------------------
  // Text content: CTA
  // ---------------------------------------------------------------------------

  it('"change CTA to Learn more" → text_content role=cta', () => {
    const result = classifyEditIntent('change CTA to Learn more');
    expect(result).toEqual({ type: 'text_content', targetRole: 'cta', newContent: 'Learn more' });
  });

  it('"set the button to Join now" → role=cta', () => {
    const result = classifyEditIntent('set the button to Join now');
    expect(result).toEqual({ type: 'text_content', targetRole: 'cta', newContent: 'Join now' });
  });

  it('"make the button say Get started" → role=cta', () => {
    const result = classifyEditIntent('make the button say Get started');
    expect(result).toEqual({ type: 'text_content', targetRole: 'cta', newContent: 'Get started' });
  });

  it('"make cta read Start free" → role=cta', () => {
    const result = classifyEditIntent('make cta read Start free');
    expect(result).toEqual({ type: 'text_content', targetRole: 'cta', newContent: 'Start free' });
  });

  // ---------------------------------------------------------------------------
  // Text size
  // ---------------------------------------------------------------------------

  it('"make text bigger" → text_size_increase', () => {
    const result = classifyEditIntent('make text bigger');
    expect(result).toEqual({ type: 'text_size_increase' });
  });

  it('"make the font larger" → text_size_increase', () => {
    const result = classifyEditIntent('make the font larger');
    expect(result).toEqual({ type: 'text_size_increase' });
  });

  it('"increase the text size" → text_size_increase', () => {
    const result = classifyEditIntent('increase the text size');
    expect(result).toEqual({ type: 'text_size_increase' });
  });

  it('"make text smaller" → text_size_decrease', () => {
    const result = classifyEditIntent('make text smaller');
    expect(result).toEqual({ type: 'text_size_decrease' });
  });

  it('"decrease the font size" → text_size_decrease', () => {
    const result = classifyEditIntent('decrease the font size');
    expect(result).toEqual({ type: 'text_size_decrease' });
  });

  // ---------------------------------------------------------------------------
  // Card operations
  // ---------------------------------------------------------------------------

  it('"duplicate this card" → card_duplicate', () => {
    const result = classifyEditIntent('duplicate this card');
    expect(result).toEqual({ type: 'card_duplicate' });
  });

  it('"copy the card" → card_duplicate', () => {
    const result = classifyEditIntent('copy the card');
    expect(result).toEqual({ type: 'card_duplicate' });
  });

  it('"clone card" → card_duplicate', () => {
    const result = classifyEditIntent('clone card');
    expect(result).toEqual({ type: 'card_duplicate' });
  });

  it('"delete this card" → card_delete', () => {
    const result = classifyEditIntent('delete this card');
    expect(result).toEqual({ type: 'card_delete' });
  });

  it('"remove card" → card_delete', () => {
    const result = classifyEditIntent('remove card');
    expect(result).toEqual({ type: 'card_delete' });
  });

  it('"add a card" → card_add', () => {
    const result = classifyEditIntent('add a card');
    expect(result).toEqual({ type: 'card_add' });
  });

  it('"add another card" → card_add', () => {
    const result = classifyEditIntent('add another card');
    expect(result).toEqual({ type: 'card_add' });
  });

  // ---------------------------------------------------------------------------
  // Background color
  // ---------------------------------------------------------------------------

  it('"make background darker" → card_background_dark', () => {
    const result = classifyEditIntent('make background darker');
    expect(result).toEqual({ type: 'card_background_dark' });
  });

  it('"make the background black" → card_background_dark', () => {
    const result = classifyEditIntent('make the background black');
    expect(result).toEqual({ type: 'card_background_dark' });
  });

  it('"make background lighter" → card_background_light', () => {
    const result = classifyEditIntent('make background lighter');
    expect(result).toEqual({ type: 'card_background_light' });
  });

  it('"make the background white" → card_background_light', () => {
    const result = classifyEditIntent('make the background white');
    expect(result).toEqual({ type: 'card_background_light' });
  });

  // ---------------------------------------------------------------------------
  // Unsupported image edits
  // ---------------------------------------------------------------------------

  it('"remove background from image" → unsupported_image_edit', () => {
    const result = classifyEditIntent('remove background from image');
    expect(result).toEqual({ type: 'unsupported_image_edit' });
  });

  it('"replace the photo" → unsupported_image_edit', () => {
    const result = classifyEditIntent('replace the photo');
    expect(result).toEqual({ type: 'unsupported_image_edit' });
  });

  it('"edit this image" → unsupported_image_edit', () => {
    const result = classifyEditIntent('edit this image');
    expect(result).toEqual({ type: 'unsupported_image_edit' });
  });

  // ---------------------------------------------------------------------------
  // No-match cases (fall through to generation/conversation)
  // ---------------------------------------------------------------------------

  it('"create a post about discipline" → null', () => {
    expect(classifyEditIntent('create a post about discipline')).toBeNull();
  });

  it('"what do you think about this layout?" → null', () => {
    expect(classifyEditIntent('what do you think about this layout?')).toBeNull();
  });

  it('"make a carousel about focus" → null (is a generation request)', () => {
    expect(classifyEditIntent('make a carousel about focus')).toBeNull();
  });

  it('empty string → null', () => {
    expect(classifyEditIntent('')).toBeNull();
  });

  it('random text → null', () => {
    expect(classifyEditIntent('hello world')).toBeNull();
  });
});
