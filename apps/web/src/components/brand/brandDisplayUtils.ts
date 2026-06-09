import type { BrandSystemDto } from '../../api/types.js';

// ---------------------------------------------------------------------------
// Brand system display helpers
// ---------------------------------------------------------------------------
// Convert API DTOs into the display shape used by the existing UI.
// These are pure formatting functions — no business logic.

export interface DisplayBrand {
  id: string;
  name: string;
  initial: string;
  logoBg: string;
  logoFg: string;
  colors: string[];
  fonts: string[];
  tone: string[];
}

/**
 * Extract a display-friendly color array from the API colors object.
 * Preserves a sensible order so the conic-gradient looks coherent.
 */
function colorsToArray(colors: Record<string, string>): string[] {
  const ordered: string[] = [];
  const roles = ['primary', 'secondary', 'accent', 'background', 'text'];
  for (const role of roles) {
    const hex = colors[role];
    if (hex) ordered.push(hex);
  }
  // If the object has extra keys not in the standard roles, append them.
  for (const [key, hex] of Object.entries(colors)) {
    if (!roles.includes(key) && hex) {
      ordered.push(hex);
    }
  }
  // Fallback for truly empty color sets.
  if (ordered.length === 0) {
    ordered.push('#1d2a30', '#5e7680', '#a4b7bd', '#c8d1d8');
  }
  return ordered;
}

/**
 * Extract a display-friendly font array from the API typography object.
 */
function typographyToFonts(typography: Record<string, unknown>): string[] {
  const fontKeys = ['titleFont', 'headingFont', 'bodyFont', 'accentFont', 'captionFont'];
  const seen = new Set<string>();
  const fonts: string[] = [];
  for (const key of fontKeys) {
    const val = typography[key];
    if (typeof val === 'string' && val && !seen.has(val)) {
      seen.add(val);
      fonts.push(val);
    }
  }
  if (fonts.length === 0) {
    fonts.push('Newsreader', 'Hanken Grotesk');
  }
  return fonts;
}

/**
 * Extract a display-friendly tone array from the API tone string.
 */
function toneToArray(tone: string | null): string[] {
  if (!tone) return [];
  // Split on common separators and clean up.
  return tone
    .split(/[,.·—\-]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 30)
    .slice(0, 4);
}

function pickLogoColors(colors: string[]): { bg: string; fg: string } {
  const bg = colors[0] || '#1d2a30';
  // Simple luminance check for foreground color.
  const hex = bg.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const fg = luminance > 0.5 ? '#1d2a30' : '#f1f4f4';
  return { bg, fg };
}

/**
 * Convert an API BrandSystemDto into the DisplayBrand shape used by the
 * dashboard cards and workspace selectors.
 */
export function brandSystemDtoToDisplayBrand(dto: BrandSystemDto): DisplayBrand {
  const colors = colorsToArray(dto.colors);
  const fonts = typographyToFonts(dto.typography);
  const tone = toneToArray(dto.tone);
  const { bg: logoBg, fg: logoFg } = pickLogoColors(colors);

  return {
    id: dto.id,
    name: dto.name,
    initial: dto.name.charAt(0).toUpperCase(),
    logoBg,
    logoFg,
    colors,
    fonts,
    tone,
  };
}

/**
 * Convert a UI palette array into the API colors object.
 * Maps array positions to standard roles.
 */
export function paletteToColors(palette: string[]): Record<string, string> {
  const roles = ['primary', 'secondary', 'accent', 'background', 'text'];
  const colors: Record<string, string> = {};
  for (let i = 0; i < palette.length && i < roles.length; i++) {
    colors[roles[i]] = palette[i];
  }
  return colors;
}

/**
 * Convert a UI typography shape into the API typography object.
 */
export function brandTypographyToApi(
  typography: Record<string, string | number>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(typography)) {
    if (val !== undefined && val !== '') {
      result[key] = val;
    }
  }
  return result;
}
