import { describe, it, expect } from 'vitest';
import { BRAND_TYPOGRAPHY_PRESETS } from '../../../data/brandPresets';
import {
  isSupportedFontFamily,
  getFontsByCategory,
} from '@orra/shared';

describe('brand typography presets', () => {
  it('arabic-clean key does not exist in BRAND_TYPOGRAPHY_PRESETS', () => {
    expect(Object.keys(BRAND_TYPOGRAPHY_PRESETS)).not.toContain('arabic-clean');
  });

  it('preset keys are exactly: editorial-calm, modern-saas, bold-poster, custom', () => {
    const keys = Object.keys(BRAND_TYPOGRAPHY_PRESETS).sort();
    expect(keys).toEqual(['bold-poster', 'custom', 'editorial-calm', 'modern-saas']);
  });

  it('all preset fonts are supported catalog fonts', () => {
    for (const [key, preset] of Object.entries(BRAND_TYPOGRAPHY_PRESETS)) {
      expect(isSupportedFontFamily(preset.titleFont),   `${key}.titleFont   "${preset.titleFont}"`  ).toBe(true);
      expect(isSupportedFontFamily(preset.bodyFont),    `${key}.bodyFont    "${preset.bodyFont}"`   ).toBe(true);
      expect(isSupportedFontFamily(preset.accentFont),  `${key}.accentFont  "${preset.accentFont}"` ).toBe(true);
      expect(isSupportedFontFamily(preset.captionFont), `${key}.captionFont "${preset.captionFont}"`).toBe(true);
    }
  });

  it('all preset weights are within valid range (100–900)', () => {
    for (const [key, preset] of Object.entries(BRAND_TYPOGRAPHY_PRESETS)) {
      for (const weight of [preset.titleWeight, preset.bodyWeight, preset.accentWeight, preset.captionWeight]) {
        expect(weight, `${key} weight ${weight}`).toBeGreaterThanOrEqual(100);
        expect(weight, `${key} weight ${weight}`).toBeLessThanOrEqual(900);
      }
    }
  });

  it('Arabic fonts still exist in the shared font catalog', () => {
    const arabicFonts = getFontsByCategory('arabic');
    expect(arabicFonts.length).toBeGreaterThan(0);
    const families = arabicFonts.map((f) => f.family);
    expect(families).toContain('Cairo');
    expect(families).toContain('Tajawal');
    expect(families).toContain('Amiri');
    expect(families).toContain('Noto Sans Arabic');
  });

  it('Arabic fonts are individually selectable from the catalog', () => {
    expect(isSupportedFontFamily('Cairo')).toBe(true);
    expect(isSupportedFontFamily('Tajawal')).toBe(true);
    expect(isSupportedFontFamily('Amiri')).toBe(true);
    expect(isSupportedFontFamily('Noto Sans Arabic')).toBe(true);
  });

  it('editorial-calm preset uses correct fonts', () => {
    const p = BRAND_TYPOGRAPHY_PRESETS['editorial-calm'];
    expect(p.titleFont).toBe('Newsreader');
    expect(p.bodyFont).toBe('Hanken Grotesk');
  });

  it('modern-saas preset uses correct fonts', () => {
    const p = BRAND_TYPOGRAPHY_PRESETS['modern-saas'];
    expect(p.titleFont).toBe('Space Grotesk');
    expect(p.bodyFont).toBe('Inter');
  });

  it('bold-poster preset uses correct fonts', () => {
    const p = BRAND_TYPOGRAPHY_PRESETS['bold-poster'];
    expect(p.titleFont).toBe('Bebas Neue');
    expect(p.bodyFont).toBe('Montserrat');
  });

  it('each preset has a non-empty label', () => {
    for (const [key, preset] of Object.entries(BRAND_TYPOGRAPHY_PRESETS)) {
      expect(preset.label, `${key} label`).toBeTruthy();
    }
  });
});
