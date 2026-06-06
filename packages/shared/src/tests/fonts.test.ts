import { describe, it, expect } from 'vitest';
import {
  FONT_CATALOG,
  APP_FONT_CATALOG,
  getFontById,
  getFontByFamily,
  isSupportedFontFamily,
  isSupportedFontId,
  resolveFontFamily,
  getFontsByRole,
  getFontsByCategory,
  getAllFontFamilies,
  getAllFontIds,
  isValidFontFamily,
} from '../index.js';

describe('Font catalog', () => {
  it('contains 12 curated fonts', () => {
    expect(FONT_CATALOG).toHaveLength(12);
    expect(APP_FONT_CATALOG).toHaveLength(12);
  });

  it('has unique IDs and families', () => {
    const ids = FONT_CATALOG.map((f) => f.id);
    const families = FONT_CATALOG.map((f) => f.family);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(families).size).toBe(families.length);
  });

  it('has required metadata fields on every entry', () => {
    for (const font of FONT_CATALOG) {
      expect(font.id).toBeTruthy();
      expect(font.family).toBeTruthy();
      expect(font.category).toMatch(/^(serif|sans|mono|display)$/);
      expect(font.roleSuggestion).toMatch(/^(display|body|both)$/);
      expect(Array.isArray(font.weights)).toBe(true);
      expect(font.weights.length).toBeGreaterThan(0);
      expect(Array.isArray(font.styles)).toBe(true);
      expect(font.styles.length).toBeGreaterThan(0);
      expect(font.fallback).toBeTruthy();
      expect(font.provider).toMatch(/^(google|fontsource|local)$/);
      expect(font.license).toBeTruthy();
    }
  });

  it('getFontById returns correct font', () => {
    const font = getFontById('inter');
    expect(font).toBeDefined();
    expect(font?.family).toBe('Inter');
    expect(font?.category).toBe('sans');
  });

  it('getFontById returns undefined for unknown id', () => {
    expect(getFontById('comic-sans')).toBeUndefined();
  });

  it('getFontByFamily returns correct font', () => {
    const font = getFontByFamily('Newsreader');
    expect(font).toBeDefined();
    expect(font?.id).toBe('newsreader');
    expect(font?.roleSuggestion).toBe('display');
  });

  it('getFontByFamily returns undefined for unknown family', () => {
    expect(getFontByFamily('Papyrus')).toBeUndefined();
  });

  it('isSupportedFontFamily accepts catalog families', () => {
    expect(isSupportedFontFamily('Inter')).toBe(true);
    expect(isSupportedFontFamily('Hanken Grotesk')).toBe(true);
    expect(isSupportedFontFamily('Geist')).toBe(true);
  });

  it('isSupportedFontFamily rejects unknown families', () => {
    expect(isSupportedFontFamily('Comic Sans')).toBe(false);
    expect(isSupportedFontFamily('Arial')).toBe(false);
  });

  it('isSupportedFontId accepts catalog IDs', () => {
    expect(isSupportedFontId('inter')).toBe(true);
    expect(isSupportedFontId('newsreader')).toBe(true);
  });

  it('isSupportedFontId rejects unknown IDs', () => {
    expect(isSupportedFontId('unknown')).toBe(false);
  });

  it('resolveFontFamily resolves ID to family', () => {
    expect(resolveFontFamily('inter')).toBe('Inter');
    expect(resolveFontFamily('newsreader')).toBe('Newsreader');
  });

  it('resolveFontFamily passes through valid family', () => {
    expect(resolveFontFamily('Inter')).toBe('Inter');
    expect(resolveFontFamily('DM Sans')).toBe('DM Sans');
  });

  it('resolveFontFamily returns null for unknown input', () => {
    expect(resolveFontFamily('Comic Sans')).toBeNull();
  });

  it('getFontsByRole filters correctly', () => {
    const display = getFontsByRole('display');
    expect(display.length).toBeGreaterThan(0);
    for (const font of display) {
      expect(font.roleSuggestion === 'display' || font.roleSuggestion === 'both').toBe(true);
    }

    const body = getFontsByRole('body');
    expect(body.length).toBeGreaterThan(0);
    for (const font of body) {
      expect(font.roleSuggestion === 'body' || font.roleSuggestion === 'both').toBe(true);
    }
  });

  it('getFontsByCategory filters correctly', () => {
    const serifs = getFontsByCategory('serif');
    expect(serifs.every((f) => f.category === 'serif')).toBe(true);

    const sans = getFontsByCategory('sans');
    expect(sans.every((f) => f.category === 'sans')).toBe(true);

    const mono = getFontsByCategory('mono');
    expect(mono.every((f) => f.category === 'mono')).toBe(true);

    const display = getFontsByCategory('display');
    expect(display.every((f) => f.category === 'display')).toBe(true);
  });

  it('getAllFontFamilies returns all families', () => {
    expect(getAllFontFamilies().length).toBe(12);
    expect(getAllFontFamilies()).toContain('Inter');
    expect(getAllFontFamilies()).toContain('Newsreader');
  });

  it('getAllFontIds returns all IDs', () => {
    expect(getAllFontIds().length).toBe(12);
    expect(getAllFontIds()).toContain('inter');
    expect(getAllFontIds()).toContain('newsreader');
  });

  it('isValidFontFamily is backwards-compatible', () => {
    expect(isValidFontFamily('Inter')).toBe(true);
    expect(isValidFontFamily('Comic Sans')).toBe(false);
  });

  it('APP_FONT_CATALOG contains the original required fonts', () => {
    expect(APP_FONT_CATALOG).toContain('Hanken Grotesk');
    expect(APP_FONT_CATALOG).toContain('Newsreader');
    expect(APP_FONT_CATALOG).toContain('Inter');
    expect(APP_FONT_CATALOG).toContain('Geist');
    expect(APP_FONT_CATALOG).toContain('DM Sans');
  });
});
