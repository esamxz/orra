// ---------------------------------------------------------------------------
// Font Catalog
//
// Curated open-source/self-hostable font library for Orra v1.
// All fonts must be listed here to be usable in text layers and brand systems.
// ---------------------------------------------------------------------------

export type FontCategory = 'serif' | 'sans' | 'mono' | 'display';
export type FontRole = 'display' | 'body' | 'both';
export type FontStyle = 'normal' | 'italic';
export type FontProvider = 'google' | 'fontsource' | 'local';

export interface FontEntry {
  id: string;
  family: string;
  category: FontCategory;
  roleSuggestion: FontRole;
  weights: number[];
  styles: FontStyle[];
  fallback: string;
  provider: FontProvider;
  license: string;
}

export const FONT_CATALOG: FontEntry[] = [
  {
    id: 'newsreader',
    family: 'Newsreader',
    category: 'serif',
    roleSuggestion: 'display',
    weights: [200, 300, 400, 500, 600, 700, 800],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'hanken-grotesk',
    family: 'Hanken Grotesk',
    category: 'sans',
    roleSuggestion: 'both',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'inter',
    family: 'Inter',
    category: 'sans',
    roleSuggestion: 'body',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'geist',
    family: 'Geist',
    category: 'sans',
    roleSuggestion: 'body',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'dm-sans',
    family: 'DM Sans',
    category: 'sans',
    roleSuggestion: 'body',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'manrope',
    family: 'Manrope',
    category: 'sans',
    roleSuggestion: 'both',
    weights: [200, 300, 400, 500, 600, 700, 800],
    styles: ['normal'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'space-grotesk',
    family: 'Space Grotesk',
    category: 'sans',
    roleSuggestion: 'display',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'plus-jakarta-sans',
    family: 'Plus Jakarta Sans',
    category: 'sans',
    roleSuggestion: 'both',
    weights: [200, 300, 400, 500, 600, 700, 800],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'ibm-plex-mono',
    family: 'IBM Plex Mono',
    category: 'mono',
    roleSuggestion: 'body',
    weights: [100, 200, 300, 400, 500, 600, 700],
    styles: ['normal', 'italic'],
    fallback: "'Courier New', Courier, monospace",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'jetbrains-mono',
    family: 'JetBrains Mono',
    category: 'mono',
    roleSuggestion: 'body',
    weights: [100, 200, 300, 400, 500, 600, 700, 800],
    styles: ['normal', 'italic'],
    fallback: "'Courier New', Courier, monospace",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'playfair-display',
    family: 'Playfair Display',
    category: 'display',
    roleSuggestion: 'display',
    weights: [400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
  },
  {
    id: 'fraunces',
    family: 'Fraunces',
    category: 'display',
    roleSuggestion: 'display',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
  },
];

// ---------------------------------------------------------------------------
// Derived lookups
// ---------------------------------------------------------------------------

const FONT_BY_ID = new Map<string, FontEntry>();
const FONT_BY_FAMILY = new Map<string, FontEntry>();
const SUPPORTED_FAMILIES = new Set<string>();
const SUPPORTED_IDS = new Set<string>();

for (const font of FONT_CATALOG) {
  FONT_BY_ID.set(font.id, font);
  FONT_BY_FAMILY.set(font.family, font);
  SUPPORTED_FAMILIES.add(font.family);
  SUPPORTED_IDS.add(font.id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getFontById(id: string): FontEntry | undefined {
  return FONT_BY_ID.get(id);
}

export function getFontByFamily(family: string): FontEntry | undefined {
  return FONT_BY_FAMILY.get(family);
}

export function isSupportedFontFamily(family: string): boolean {
  return SUPPORTED_FAMILIES.has(family);
}

export function isSupportedFontId(id: string): boolean {
  return SUPPORTED_IDS.has(id);
}

export function resolveFontFamily(input: string): string | null {
  // If input is an ID, resolve to family
  const byId = getFontById(input);
  if (byId) return byId.family;
  // If input is a family, validate it
  if (isSupportedFontFamily(input)) return input;
  return null;
}

export function getFontsByRole(role: FontRole): FontEntry[] {
  return FONT_CATALOG.filter(
    (f) => f.roleSuggestion === role || f.roleSuggestion === 'both',
  );
}

export function getFontsByCategory(category: FontCategory): FontEntry[] {
  return FONT_CATALOG.filter((f) => f.category === category);
}

export function getAllFontFamilies(): string[] {
  return FONT_CATALOG.map((f) => f.family);
}

export function getAllFontIds(): string[] {
  return FONT_CATALOG.map((f) => f.id);
}

// ---------------------------------------------------------------------------
// Backwards-compatible catalog array (for existing code that expects string[])
// ---------------------------------------------------------------------------

export const APP_FONT_CATALOG = getAllFontFamilies() as Readonly<string[]>;

export type AppFontFamily = (typeof APP_FONT_CATALOG)[number];

/** @deprecated Use isSupportedFontFamily instead */
export function isValidFontFamily(font: string): font is AppFontFamily {
  return isSupportedFontFamily(font);
}
