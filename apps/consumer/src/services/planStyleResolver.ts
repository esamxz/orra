import { isSupportedFontFamily } from '@orra/shared';
import type { BrandContextDto } from '@orra/shared';

// ---------------------------------------------------------------------------
// Layout and visual direction resolution
// ---------------------------------------------------------------------------
// Resolves free-text plan directions into deterministic style tokens used by
// the artifact builder. Brand context colors/fonts always win when present.
// Visual direction controls overlay opacity. Layout family controls geometry
// (position, size, font size, alignment) and whether the accent shape shows.

export type LayoutFamily =
  | 'editorial'
  | 'centered'
  | 'bold'
  | 'minimal'
  | 'quote'
  | 'split';

export type VisualStyle =
  | 'calm'
  | 'dark'
  | 'bold'
  | 'minimal'
  | 'elegant'
  | 'playful'
  | 'professional';

export interface CardLayerGeometry {
  title: {
    x: number;
    y: number;
    w: number;
    h: number;
    fontSize: number;
    fontWeight: number;
    align: 'left' | 'center' | 'right';
  };
  body: {
    x: number;
    y: number;
    w: number;
    h: number;
    fontSize: number;
    align: 'left' | 'center' | 'right';
  };
  /** x=0, w=cardW applied by caller */
  overlay: { y: number; h: number };
  cta: {
    x: number;
    y: number;
    w: number;
    h: number;
    align: 'left' | 'center' | 'right';
  };
}

export interface PlanStyleTokens {
  backgroundColor: string;
  textColor: string;
  bodyColor: string;
  accentColor: string;
  overlayStart: string;
  overlayEnd: string;
  titleFont: string;
  bodyFont: string;
  accentFont: string;
  overlayOpacity: number;
  showAccentShape: boolean;
  layoutFamily: LayoutFamily;
  visualStyle: VisualStyle;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const ORRA_PALETTE = ['#1d2a30', '#354e53', '#5e7680', '#a4b7bd', '#c8d1d8'];
const DEFAULT_TITLE_FONT = 'Newsreader';
const DEFAULT_BODY_FONT = 'Inter';
const DEFAULT_ACCENT_FONT = 'Space Grotesk';
const DEFAULT_TITLE_COLOR = '#c8d1d8';
const DEFAULT_BODY_COLOR = '#a4b7bd';
const DEFAULT_SHAPE_COLOR = '#a4b7bd';
const DEFAULT_OVERLAY_START = '#1d2a30';
const DEFAULT_OVERLAY_END = '#354e53';

// ---------------------------------------------------------------------------
// Layout family resolver
// ---------------------------------------------------------------------------

const LAYOUT_KEYWORD_MAP: Array<[string[], LayoutFamily]> = [
  [['center', 'centred', 'centered'], 'centered'],
  [['bold', 'impact', 'strong'], 'bold'],
  [['minimal', 'clean', 'simple'], 'minimal'],
  [['quote', 'statement'], 'quote'],
  [['split', 'comparison'], 'split'],
];

/** Maps a free-text layoutDirection string to a deterministic LayoutFamily. */
export function resolveLayoutFamily(layoutDirection?: string): LayoutFamily {
  if (!layoutDirection) return 'editorial';
  const words = layoutDirection.toLowerCase().split(/\s+/);
  for (const [keywords, family] of LAYOUT_KEYWORD_MAP) {
    if (keywords.some((kw) => words.includes(kw))) {
      return family;
    }
  }
  return 'editorial';
}

// ---------------------------------------------------------------------------
// Visual style resolver
// ---------------------------------------------------------------------------

const VISUAL_KEYWORD_MAP: Array<[string[], VisualStyle]> = [
  [['dark', 'night', 'moody'], 'dark'],
  [['minimal', 'clean', 'simple', 'light'], 'minimal'],
  [['bold', 'vibrant', 'strong'], 'bold'],
  [['elegant', 'premium', 'luxury'], 'elegant'],
  [['playful', 'fun', 'warm'], 'playful'],
  [['professional', 'corporate', 'formal'], 'professional'],
];

/** Maps a free-text visualDirection string to a deterministic VisualStyle. */
export function resolveVisualStyle(visualDirection?: string): VisualStyle {
  if (!visualDirection) return 'calm';
  const words = visualDirection.toLowerCase().split(/\s+/);
  for (const [keywords, style] of VISUAL_KEYWORD_MAP) {
    if (keywords.some((kw) => words.includes(kw))) {
      return style;
    }
  }
  return 'calm';
}

// ---------------------------------------------------------------------------
// Style token tables
// ---------------------------------------------------------------------------

const OVERLAY_OPACITY: Record<VisualStyle, number> = {
  calm: 0.35,
  dark: 0.55,
  minimal: 0.15,
  bold: 0.45,
  elegant: 0.25,
  playful: 0.30,
  professional: 0.40,
};

const LAYOUT_SHOW_SHAPE: Record<LayoutFamily, boolean> = {
  editorial: true,
  centered: false,
  bold: true,
  minimal: false,
  quote: false,
  split: true,
};

function isValidHexColor(color: string | undefined): color is string {
  return typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color);
}

// ---------------------------------------------------------------------------
// Plan style resolver
// ---------------------------------------------------------------------------

/**
 * Resolves all style tokens needed to build one card.
 *
 * Precedence:
 * - Colors: brand > Orra defaults
 * - Fonts: brand (validated) > Orra defaults
 * - Overlay opacity: visual style table
 * - showAccentShape: layout family table; 'minimal' visual style suppresses shape
 */
export function resolvePlanStyle(input: {
  layoutDirection?: string;
  visualDirection?: string;
  brandContext: BrandContextDto | null;
  cardIndex?: number;
}): PlanStyleTokens {
  const { layoutDirection, visualDirection, brandContext, cardIndex = 0 } = input;
  const brand = brandContext;

  const layoutFamily = resolveLayoutFamily(layoutDirection);
  const visualStyle = resolveVisualStyle(visualDirection);

  // Background / card base color
  const backgroundColor = brand?.colors?.background && isValidHexColor(brand.colors.background)
    ? brand.colors.background
    : brand?.colors?.primary && isValidHexColor(brand.colors.primary)
    ? brand.colors.primary
    : ORRA_PALETTE[cardIndex % ORRA_PALETTE.length];

  // Text colors
  const textColor = brand?.colors?.text && isValidHexColor(brand.colors.text)
    ? brand.colors.text
    : DEFAULT_TITLE_COLOR;

  const bodyColor = brand?.colors?.text && isValidHexColor(brand.colors.text)
    ? brand.colors.text
    : DEFAULT_BODY_COLOR;

  // Accent / shape color
  const accentColor = brand?.colors?.accent && isValidHexColor(brand.colors.accent)
    ? brand.colors.accent
    : brand?.colors?.secondary && isValidHexColor(brand.colors.secondary)
    ? brand.colors.secondary
    : DEFAULT_SHAPE_COLOR;

  // Overlay gradient stops
  const overlayStart = brand?.colors?.background && isValidHexColor(brand.colors.background)
    ? brand.colors.background
    : DEFAULT_OVERLAY_START;

  const overlayEnd = brand?.colors?.primary && isValidHexColor(brand.colors.primary)
    ? brand.colors.primary
    : DEFAULT_OVERLAY_END;

  // Fonts — brand heading/body fonts validated against shared catalog
  const titleFont = (() => {
    const font = brand?.typography?.headingFont;
    return font && isSupportedFontFamily(font) ? font : DEFAULT_TITLE_FONT;
  })();

  const bodyFont = (() => {
    const font = brand?.typography?.bodyFont;
    return font && isSupportedFontFamily(font) ? font : DEFAULT_BODY_FONT;
  })();

  const accentFont = (() => {
    const font = brand?.typography?.headingFont;
    return font && isSupportedFontFamily(font) ? font : DEFAULT_ACCENT_FONT;
  })();

  // Overlay opacity from visual style
  const overlayOpacity = OVERLAY_OPACITY[visualStyle];

  // Accent shape: layout family table; 'minimal' visual style suppresses shape
  const showAccentShape = LAYOUT_SHOW_SHAPE[layoutFamily] && visualStyle !== 'minimal';

  return {
    backgroundColor,
    textColor,
    bodyColor,
    accentColor,
    overlayStart,
    overlayEnd,
    titleFont,
    bodyFont,
    accentFont,
    overlayOpacity,
    showAccentShape,
    layoutFamily,
    visualStyle,
  };
}

// ---------------------------------------------------------------------------
// Card layer geometry by layout family
// ---------------------------------------------------------------------------

/** Returns per-layer geometry for a card given its layout family and dimensions. */
export function getCardLayerGeometry(
  family: LayoutFamily,
  cardW: number,
  cardH: number,
): CardLayerGeometry {
  switch (family) {
    case 'centered':
      return {
        title: {
          x: 40,
          y: Math.round(cardH * 0.24),
          w: cardW - 80,
          h: 250,
          fontSize: 68,
          fontWeight: 400,
          align: 'center',
        },
        body: {
          x: 60,
          y: Math.round(cardH * 0.54),
          w: cardW - 120,
          h: 220,
          fontSize: 22,
          align: 'center',
        },
        overlay: {
          y: Math.round(cardH * 0.50),
          h: Math.round(cardH * 0.50),
        },
        cta: {
          x: 60,
          y: Math.round(cardH * 0.83),
          w: cardW - 120,
          h: 60,
          align: 'center',
        },
      };

    case 'bold':
      return {
        title: {
          x: 60,
          y: 80,
          w: cardW - 120,
          h: 300,
          fontSize: 96,
          fontWeight: 700,
          align: 'left',
        },
        body: {
          x: 60,
          y: 430,
          w: cardW - 120,
          h: 260,
          fontSize: 22,
          align: 'left',
        },
        overlay: {
          y: Math.round(cardH * 0.45),
          h: Math.round(cardH * 0.55),
        },
        cta: {
          x: 60,
          y: 740,
          w: cardW - 120,
          h: 60,
          align: 'left',
        },
      };

    case 'minimal':
      return {
        title: {
          x: 60,
          y: 180,
          w: cardW - 120,
          h: 200,
          fontSize: 60,
          fontWeight: 300,
          align: 'left',
        },
        body: {
          x: 60,
          y: 420,
          w: cardW - 120,
          h: 280,
          fontSize: 22,
          align: 'left',
        },
        overlay: {
          y: Math.round(cardH * 0.60),
          h: Math.round(cardH * 0.40),
        },
        cta: {
          x: 60,
          y: 740,
          w: cardW - 120,
          h: 60,
          align: 'left',
        },
      };

    case 'quote':
      return {
        title: {
          x: 40,
          y: Math.round(cardH * 0.18),
          w: cardW - 80,
          h: 350,
          fontSize: 88,
          fontWeight: 400,
          align: 'center',
        },
        body: {
          x: 60,
          y: Math.round(cardH * 0.73),
          w: cardW - 120,
          h: 80,
          fontSize: 18,
          align: 'center',
        },
        overlay: {
          y: Math.round(cardH * 0.52),
          h: Math.round(cardH * 0.48),
        },
        cta: {
          x: 60,
          y: Math.round(cardH * 0.85),
          w: cardW - 120,
          h: 60,
          align: 'center',
        },
      };

    case 'split':
      return {
        title: {
          x: 60,
          y: 100,
          w: Math.round(cardW * 0.70),
          h: 300,
          fontSize: 68,
          fontWeight: 600,
          align: 'left',
        },
        body: {
          x: 60,
          y: 440,
          w: Math.round(cardW * 0.70),
          h: 280,
          fontSize: 22,
          align: 'left',
        },
        overlay: {
          y: Math.round(cardH * 0.55),
          h: Math.round(cardH * 0.45),
        },
        cta: {
          x: 60,
          y: Math.round(cardH * 0.83),
          w: Math.round(cardW * 0.70),
          h: 60,
          align: 'left',
        },
      };

    default: // editorial
      return {
        title: {
          x: 60,
          y: 140,
          w: cardW - 120,
          h: 200,
          fontSize: 72,
          fontWeight: 400,
          align: 'left',
        },
        body: {
          x: 60,
          y: 380,
          w: cardW - 120,
          h: 300,
          fontSize: 24,
          align: 'left',
        },
        overlay: {
          y: Math.round(cardH * 0.55),
          h: Math.round(cardH * 0.45),
        },
        cta: {
          x: 60,
          y: 720,
          w: cardW - 120,
          h: 60,
          align: 'left',
        },
      };
  }
}
