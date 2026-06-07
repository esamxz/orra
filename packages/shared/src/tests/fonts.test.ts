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
  getDefaultFontForRole,
  getArabicFonts,
} from '../index.js';

const EXPECTED_FONT_COUNT = 39;

describe('Font catalog', () => {
  it(`contains ${EXPECTED_FONT_COUNT} curated fonts`, () => {
    expect(FONT_CATALOG).toHaveLength(EXPECTED_FONT_COUNT);
    expect(APP_FONT_CATALOG).toHaveLength(EXPECTED_FONT_COUNT);
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
      expect(font.category).toMatch(/^(brand|sans|serif|display|poster|script|mono|arabic)$/);
      expect(font.roleSuggestion).toMatch(/^(title|body|accent|caption|display|both)$/);
      expect(Array.isArray(font.roles)).toBe(true);
      expect(font.roles.length).toBeGreaterThan(0);
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
    expect(isSupportedFontFamily('Bebas Neue')).toBe(true);
    expect(isSupportedFontFamily('Cairo')).toBe(true);
  });

  it('isSupportedFontFamily rejects unknown families', () => {
    expect(isSupportedFontFamily('Comic Sans')).toBe(false);
    expect(isSupportedFontFamily('Arial')).toBe(false);
    expect(isSupportedFontFamily('Times New Roman')).toBe(false);
  });

  it('isSupportedFontId accepts catalog IDs', () => {
    expect(isSupportedFontId('inter')).toBe(true);
    expect(isSupportedFontId('newsreader')).toBe(true);
    expect(isSupportedFontId('bebas-neue')).toBe(true);
    expect(isSupportedFontId('cairo')).toBe(true);
  });

  it('isSupportedFontId rejects unknown IDs', () => {
    expect(isSupportedFontId('unknown')).toBe(false);
  });

  it('resolveFontFamily resolves ID to family', () => {
    expect(resolveFontFamily('inter')).toBe('Inter');
    expect(resolveFontFamily('newsreader')).toBe('Newsreader');
    expect(resolveFontFamily('bebas-neue')).toBe('Bebas Neue');
  });

  it('resolveFontFamily passes through valid family', () => {
    expect(resolveFontFamily('Inter')).toBe('Inter');
    expect(resolveFontFamily('DM Sans')).toBe('DM Sans');
    expect(resolveFontFamily('Cairo')).toBe('Cairo');
  });

  it('resolveFontFamily returns null for unknown input', () => {
    expect(resolveFontFamily('Comic Sans')).toBeNull();
  });

  it('getFontsByRole filters correctly', () => {
    const title = getFontsByRole('title');
    expect(title.length).toBeGreaterThan(0);
    for (const font of title) {
      const matches =
        font.roleSuggestion === 'title' ||
        font.roleSuggestion === 'both' ||
        (font.roles && font.roles.includes('title'));
      expect(matches).toBe(true);
    }

    const body = getFontsByRole('body');
    expect(body.length).toBeGreaterThan(0);
    for (const font of body) {
      const matches =
        font.roleSuggestion === 'body' ||
        font.roleSuggestion === 'both' ||
        (font.roles && font.roles.includes('body'));
      expect(matches).toBe(true);
    }
  });

  it('getDefaultFontForRole returns a valid font', () => {
    const title = getDefaultFontForRole('title');
    expect(title).toBeDefined();
    expect(isSupportedFontFamily(title.family)).toBe(true);

    const body = getDefaultFontForRole('body');
    expect(body).toBeDefined();
    expect(isSupportedFontFamily(body.family)).toBe(true);

    const accent = getDefaultFontForRole('accent');
    expect(accent).toBeDefined();
    expect(isSupportedFontFamily(accent.family)).toBe(true);

    const caption = getDefaultFontForRole('caption');
    expect(caption).toBeDefined();
    expect(isSupportedFontFamily(caption.family)).toBe(true);
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

    const poster = getFontsByCategory('poster');
    expect(poster.every((f) => f.category === 'poster')).toBe(true);

    const script = getFontsByCategory('script');
    expect(script.every((f) => f.category === 'script')).toBe(true);

    const arabic = getFontsByCategory('arabic');
    expect(arabic.every((f) => f.category === 'arabic')).toBe(true);
  });

  it('getArabicFonts returns only Arabic-supporting fonts', () => {
    const arabic = getArabicFonts();
    expect(arabic.length).toBeGreaterThan(0);
    expect(arabic.every((f) => f.supportsArabic)).toBe(true);
    expect(arabic.map((f) => f.family)).toContain('Cairo');
    expect(arabic.map((f) => f.family)).toContain('Tajawal');
  });

  it('getAllFontFamilies returns all families', () => {
    expect(getAllFontFamilies().length).toBe(EXPECTED_FONT_COUNT);
    expect(getAllFontFamilies()).toContain('Inter');
    expect(getAllFontFamilies()).toContain('Newsreader');
    expect(getAllFontFamilies()).toContain('Bebas Neue');
    expect(getAllFontFamilies()).toContain('Cairo');
  });

  it('getAllFontIds returns all IDs', () => {
    expect(getAllFontIds().length).toBe(EXPECTED_FONT_COUNT);
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

  it('APP_FONT_CATALOG contains new required fonts', () => {
    expect(APP_FONT_CATALOG).toContain('Figtree');
    expect(APP_FONT_CATALOG).toContain('Poppins');
    expect(APP_FONT_CATALOG).toContain('Montserrat');
    expect(APP_FONT_CATALOG).toContain('Bebas Neue');
    expect(APP_FONT_CATALOG).toContain('Anton');
    expect(APP_FONT_CATALOG).toContain('Caveat');
    expect(APP_FONT_CATALOG).toContain('Pacifico');
    expect(APP_FONT_CATALOG).toContain('Source Code Pro');
    expect(APP_FONT_CATALOG).toContain('Cairo');
    expect(APP_FONT_CATALOG).toContain('Noto Sans Arabic');
  });
});
