import { describe, it, expect } from 'vitest';
import {
  resolveLayoutFamily,
  resolveVisualStyle,
  resolvePlanStyle,
  getCardLayerGeometry,
} from '../services/planStyleResolver.js';
import type { BrandContextDto } from '@orra/shared';

const CARD_W = 1080;
const CARD_H = 1350;

const brand: BrandContextDto = {
  brandSystemId: 'brand-1',
  name: 'Acme',
  colors: {
    primary: '#123456',
    background: '#654321',
    text: '#ffffff',
    accent: '#aabbcc',
  },
  typography: {
    headingFont: 'Newsreader',
    bodyFont: 'Inter',
  },
};

// ---------------------------------------------------------------------------
// resolveLayoutFamily
// ---------------------------------------------------------------------------

describe('resolveLayoutFamily', () => {
  it('returns editorial for undefined input', () => {
    expect(resolveLayoutFamily(undefined)).toBe('editorial');
  });

  it('returns editorial for empty string', () => {
    expect(resolveLayoutFamily('')).toBe('editorial');
  });

  it('returns editorial for unknown input', () => {
    expect(resolveLayoutFamily('unknown garbage xyz')).toBe('editorial');
  });

  it('returns editorial for the literal word "editorial" (not a keyword — falls through to default)', () => {
    expect(resolveLayoutFamily('editorial')).toBe('editorial');
  });

  it('maps "centered" to centered', () => {
    expect(resolveLayoutFamily('centered')).toBe('centered');
  });

  it('maps "center" keyword to centered', () => {
    expect(resolveLayoutFamily('center align')).toBe('centered');
  });

  it('maps "BOLD" (uppercase) to bold', () => {
    expect(resolveLayoutFamily('BOLD')).toBe('bold');
  });

  it('maps "minimal clean" to minimal (first matching row)', () => {
    expect(resolveLayoutFamily('minimal clean')).toBe('minimal');
  });

  it('maps "quote" to quote', () => {
    expect(resolveLayoutFamily('quote')).toBe('quote');
  });

  it('maps "split layout" to split', () => {
    expect(resolveLayoutFamily('split layout')).toBe('split');
  });

  it('first matching row wins when multiple keywords present', () => {
    // 'center' (row 0) appears before 'bold' (row 1)
    expect(resolveLayoutFamily('center bold')).toBe('centered');
  });
});

// ---------------------------------------------------------------------------
// resolveVisualStyle
// ---------------------------------------------------------------------------

describe('resolveVisualStyle', () => {
  it('returns calm for undefined input', () => {
    expect(resolveVisualStyle(undefined)).toBe('calm');
  });

  it('returns calm for empty string', () => {
    expect(resolveVisualStyle('')).toBe('calm');
  });

  it('returns calm for unknown input', () => {
    expect(resolveVisualStyle('unknown style xyz')).toBe('calm');
  });

  it('maps "dark" to dark', () => {
    expect(resolveVisualStyle('dark')).toBe('dark');
  });

  it('maps "minimal" to minimal', () => {
    expect(resolveVisualStyle('minimal')).toBe('minimal');
  });

  it('maps "bold" to bold', () => {
    expect(resolveVisualStyle('bold')).toBe('bold');
  });

  it('maps "elegant premium" to elegant', () => {
    expect(resolveVisualStyle('elegant premium')).toBe('elegant');
  });

  it('maps "playful fun" to playful', () => {
    expect(resolveVisualStyle('playful fun')).toBe('playful');
  });

  it('maps "professional" to professional', () => {
    expect(resolveVisualStyle('professional')).toBe('professional');
  });
});

// ---------------------------------------------------------------------------
// resolvePlanStyle
// ---------------------------------------------------------------------------

describe('resolvePlanStyle', () => {
  it('no brand, no directions — editorial/calm defaults', () => {
    const style = resolvePlanStyle({ brandContext: null });
    expect(style.layoutFamily).toBe('editorial');
    expect(style.visualStyle).toBe('calm');
    expect(style.backgroundColor).toBe('#1d2a30');
    expect(style.textColor).toBe('#c8d1d8');
    expect(style.overlayOpacity).toBe(0.35);
    expect(style.showAccentShape).toBe(true);
  });

  it('layoutDirection "centered" → layoutFamily centered, showAccentShape false', () => {
    const style = resolvePlanStyle({ layoutDirection: 'centered', brandContext: null });
    expect(style.layoutFamily).toBe('centered');
    expect(style.showAccentShape).toBe(false);
  });

  it('visualDirection "minimal" → overlayOpacity 0.15, showAccentShape false', () => {
    const style = resolvePlanStyle({ visualDirection: 'minimal', brandContext: null });
    expect(style.overlayOpacity).toBe(0.15);
    expect(style.showAccentShape).toBe(false);
  });

  it('visualDirection "dark" → overlayOpacity 0.55', () => {
    const style = resolvePlanStyle({ visualDirection: 'dark', brandContext: null });
    expect(style.overlayOpacity).toBe(0.55);
  });

  it('visualDirection "bold" → overlayOpacity 0.45, showAccentShape true (editorial default)', () => {
    const style = resolvePlanStyle({ visualDirection: 'bold', brandContext: null });
    expect(style.overlayOpacity).toBe(0.45);
    expect(style.showAccentShape).toBe(true);
  });

  it('layoutDirection "bold" → showAccentShape true', () => {
    const style = resolvePlanStyle({ layoutDirection: 'bold', brandContext: null });
    expect(style.showAccentShape).toBe(true);
  });

  it('layoutDirection "quote" → showAccentShape false', () => {
    const style = resolvePlanStyle({ layoutDirection: 'quote', brandContext: null });
    expect(style.showAccentShape).toBe(false);
  });

  it('brand colors present → backgroundColor from brand.colors.background', () => {
    const style = resolvePlanStyle({ brandContext: brand });
    expect(style.backgroundColor).toBe('#654321');
    expect(style.textColor).toBe('#ffffff');
    expect(style.accentColor).toBe('#aabbcc');
  });

  it('brand colors override visual direction color defaults', () => {
    const style = resolvePlanStyle({ visualDirection: 'dark', brandContext: brand });
    expect(style.backgroundColor).toBe('#654321');
    expect(style.textColor).toBe('#ffffff');
  });

  it('layout minimal + visual dark → layoutFamily minimal, overlayOpacity 0.55, showAccentShape false', () => {
    const style = resolvePlanStyle({
      layoutDirection: 'minimal',
      visualDirection: 'dark',
      brandContext: null,
    });
    expect(style.layoutFamily).toBe('minimal');
    expect(style.visualStyle).toBe('dark');
    expect(style.overlayOpacity).toBe(0.55);
    expect(style.showAccentShape).toBe(false);
  });

  it('cardIndex cycles background color in ORRA palette when no brand', () => {
    const style0 = resolvePlanStyle({ brandContext: null, cardIndex: 0 });
    const style1 = resolvePlanStyle({ brandContext: null, cardIndex: 1 });
    expect(style0.backgroundColor).not.toBe(style1.backgroundColor);
  });
});

// ---------------------------------------------------------------------------
// getCardLayerGeometry
// ---------------------------------------------------------------------------

describe('getCardLayerGeometry', () => {
  it('editorial returns title at y=140, fontSize=72, fontWeight=400', () => {
    const g = getCardLayerGeometry('editorial', CARD_W, CARD_H);
    expect(g.title.y).toBe(140);
    expect(g.title.fontSize).toBe(72);
    expect(g.title.fontWeight).toBe(400);
    expect(g.title.align).toBe('left');
  });

  it('centered returns title align center, x=40, w=cardW-80', () => {
    const g = getCardLayerGeometry('centered', CARD_W, CARD_H);
    expect(g.title.align).toBe('center');
    expect(g.title.x).toBe(40);
    expect(g.title.w).toBe(CARD_W - 80);
    expect(g.body.align).toBe('center');
  });

  it('centered title y = round(0.24 * cardH)', () => {
    const g = getCardLayerGeometry('centered', CARD_W, CARD_H);
    expect(g.title.y).toBe(Math.round(CARD_H * 0.24));
  });

  it('bold returns title fontSize=96, fontWeight=700', () => {
    const g = getCardLayerGeometry('bold', CARD_W, CARD_H);
    expect(g.title.fontSize).toBe(96);
    expect(g.title.fontWeight).toBe(700);
  });

  it('minimal returns title fontSize=60, fontWeight=300', () => {
    const g = getCardLayerGeometry('minimal', CARD_W, CARD_H);
    expect(g.title.fontSize).toBe(60);
    expect(g.title.fontWeight).toBe(300);
  });

  it('quote returns title fontSize=88, align center', () => {
    const g = getCardLayerGeometry('quote', CARD_W, CARD_H);
    expect(g.title.fontSize).toBe(88);
    expect(g.title.align).toBe('center');
  });

  it('all layouts: title.x + title.w <= cardW', () => {
    const families = ['editorial', 'centered', 'bold', 'minimal', 'quote', 'split'] as const;
    for (const f of families) {
      const g = getCardLayerGeometry(f, CARD_W, CARD_H);
      expect(g.title.x + g.title.w).toBeLessThanOrEqual(CARD_W);
    }
  });

  it('all layouts: title.y + title.h <= cardH', () => {
    const families = ['editorial', 'centered', 'bold', 'minimal', 'quote', 'split'] as const;
    for (const f of families) {
      const g = getCardLayerGeometry(f, CARD_W, CARD_H);
      expect(g.title.y + g.title.h).toBeLessThanOrEqual(CARD_H);
    }
  });
});
