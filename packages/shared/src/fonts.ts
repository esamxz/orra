// ---------------------------------------------------------------------------
// Font Catalog
//
// Curated open-source/self-hostable font library for Orra v1.
// All fonts must be listed here to be usable in text layers and brand systems.
// ---------------------------------------------------------------------------

export type FontCategory =
  | 'brand'
  | 'sans'
  | 'serif'
  | 'display'
  | 'poster'
  | 'script'
  | 'mono'
  | 'arabic';

export type FontRole =
  | 'title'
  | 'body'
  | 'accent'
  | 'caption'
  | 'display'
  | 'both';

export type FontStyle = 'normal' | 'italic';
export type FontProvider = 'google' | 'fontsource' | 'local';

export interface FontEntry {
  id: string;
  family: string;
  category: FontCategory;
  /** @deprecated Use `roles` instead. Kept for backwards compatibility. */
  roleSuggestion: FontRole;
  /** Preferred roles this font can serve in brand systems and layer styling. */
  roles: FontRole[];
  weights: number[];
  styles: FontStyle[];
  fallback: string;
  provider: FontProvider;
  license: string;
  supportsArabic?: boolean;
  mood?: string[];
}

export const FONT_CATALOG: FontEntry[] = [
  // ── Clean / SaaS ──
  {
    id: 'figtree',
    family: 'Figtree',
    category: 'sans',
    roleSuggestion: 'body',
    roles: ['body', 'accent'],
    weights: [300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['clean', 'modern', 'friendly'],
  },
  {
    id: 'inter',
    family: 'Inter',
    category: 'sans',
    roleSuggestion: 'body',
    roles: ['body', 'caption'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['neutral', 'clean', 'technical'],
  },
  {
    id: 'hanken-grotesk',
    family: 'Hanken Grotesk',
    category: 'sans',
    roleSuggestion: 'both',
    roles: ['body', 'accent', 'title'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['modern', 'geometric', 'calm'],
  },
  {
    id: 'dm-sans',
    family: 'DM Sans',
    category: 'sans',
    roleSuggestion: 'body',
    roles: ['body', 'accent'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['clean', 'modern', 'friendly'],
  },
  {
    id: 'manrope',
    family: 'Manrope',
    category: 'sans',
    roleSuggestion: 'both',
    roles: ['body', 'accent', 'title'],
    weights: [200, 300, 400, 500, 600, 700, 800],
    styles: ['normal'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['geometric', 'modern', 'elegant'],
  },
  {
    id: 'poppins',
    family: 'Poppins',
    category: 'sans',
    roleSuggestion: 'body',
    roles: ['body', 'accent'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['friendly', 'round', 'modern'],
  },
  {
    id: 'montserrat',
    family: 'Montserrat',
    category: 'sans',
    roleSuggestion: 'both',
    roles: ['body', 'title', 'accent'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['versatile', 'modern', 'bold'],
  },
  {
    id: 'open-sans',
    family: 'Open Sans',
    category: 'sans',
    roleSuggestion: 'body',
    roles: ['body', 'caption'],
    weights: [300, 400, 500, 600, 700, 800],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['neutral', 'readable', 'classic'],
  },
  {
    id: 'roboto',
    family: 'Roboto',
    category: 'sans',
    roleSuggestion: 'body',
    roles: ['body', 'caption'],
    weights: [100, 300, 400, 500, 700, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'Apache-2.0',
    mood: ['neutral', 'technical', 'universal'],
  },
  {
    id: 'lato',
    family: 'Lato',
    category: 'sans',
    roleSuggestion: 'body',
    roles: ['body', 'accent'],
    weights: [100, 300, 400, 700, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['warm', 'humanist', 'classic'],
  },
  {
    id: 'nunito',
    family: 'Nunito',
    category: 'sans',
    roleSuggestion: 'body',
    roles: ['body', 'accent'],
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['friendly', 'round', 'soft'],
  },
  {
    id: 'raleway',
    family: 'Raleway',
    category: 'sans',
    roleSuggestion: 'both',
    roles: ['body', 'title', 'accent'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['elegant', 'thin', 'modern'],
  },
  {
    id: 'space-grotesk',
    family: 'Space Grotesk',
    category: 'sans',
    roleSuggestion: 'display',
    roles: ['title', 'accent', 'display'],
    weights: [300, 400, 500, 600, 700],
    styles: ['normal'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['geometric', 'quirky', 'modern'],
  },
  {
    id: 'plus-jakarta-sans',
    family: 'Plus Jakarta Sans',
    category: 'sans',
    roleSuggestion: 'both',
    roles: ['body', 'accent', 'title'],
    weights: [200, 300, 400, 500, 600, 700, 800],
    styles: ['normal', 'italic'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['modern', 'friendly', 'clean'],
  },
  {
    id: 'geist',
    family: 'Geist',
    category: 'sans',
    roleSuggestion: 'body',
    roles: ['body', 'caption'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['technical', 'clean', 'modern'],
  },

  // ── Editorial / premium ──
  {
    id: 'newsreader',
    family: 'Newsreader',
    category: 'serif',
    roleSuggestion: 'display',
    roles: ['title', 'display'],
    weights: [200, 300, 400, 500, 600, 700, 800],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
    mood: ['editorial', 'elegant', 'calm'],
  },
  {
    id: 'lora',
    family: 'Lora',
    category: 'serif',
    roleSuggestion: 'both',
    roles: ['body', 'title'],
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
    mood: ['literary', 'warm', 'elegant'],
  },
  {
    id: 'playfair-display',
    family: 'Playfair Display',
    category: 'display',
    roleSuggestion: 'display',
    roles: ['title', 'display'],
    weights: [400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
    mood: ['luxury', 'editorial', 'dramatic'],
  },
  {
    id: 'merriweather',
    family: 'Merriweather',
    category: 'serif',
    roleSuggestion: 'both',
    roles: ['body', 'title'],
    weights: [300, 400, 700, 900],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
    mood: ['readable', 'warm', 'classic'],
  },
  {
    id: 'source-serif-four',
    family: 'Source Serif 4',
    category: 'serif',
    roleSuggestion: 'body',
    roles: ['body', 'caption'],
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
    mood: ['technical', 'readable', 'editorial'],
  },
  {
    id: 'im-fell-english',
    family: 'IM Fell English',
    category: 'serif',
    roleSuggestion: 'display',
    roles: ['title', 'display'],
    weights: [400],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
    mood: ['vintage', 'literary', 'classic'],
  },
  {
    id: 'fraunces',
    family: 'Fraunces',
    category: 'display',
    roleSuggestion: 'display',
    roles: ['title', 'display'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
    mood: ['whimsical', 'editorial', 'warm'],
  },

  // ── Poster / bold ──
  {
    id: 'bebas-neue',
    family: 'Bebas Neue',
    category: 'poster',
    roleSuggestion: 'display',
    roles: ['title', 'display'],
    weights: [400],
    styles: ['normal'],
    fallback: "Impact, Helvetica Neue, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['bold', 'condensed', 'impactful'],
  },
  {
    id: 'anton',
    family: 'Anton',
    category: 'poster',
    roleSuggestion: 'display',
    roles: ['title', 'display', 'accent'],
    weights: [400],
    styles: ['normal'],
    fallback: "Impact, Helvetica Neue, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['bold', 'heavy', 'poster'],
  },
  {
    id: 'oswald',
    family: 'Oswald',
    category: 'poster',
    roleSuggestion: 'display',
    roles: ['title', 'display', 'accent'],
    weights: [200, 300, 400, 500, 600, 700],
    styles: ['normal'],
    fallback: "Impact, Helvetica Neue, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['condensed', 'bold', 'modern'],
  },
  {
    id: 'righteous',
    family: 'Righteous',
    category: 'poster',
    roleSuggestion: 'display',
    roles: ['title', 'display'],
    weights: [400],
    styles: ['normal'],
    fallback: "Impact, Helvetica Neue, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['playful', 'geometric', 'unique'],
  },
  {
    id: 'bangers',
    family: 'Bangers',
    category: 'poster',
    roleSuggestion: 'display',
    roles: ['title', 'display', 'accent'],
    weights: [400],
    styles: ['normal'],
    fallback: "Impact, Helvetica Neue, sans-serif",
    provider: 'google',
    license: 'OFL',
    mood: ['comic', 'loud', 'energetic'],
  },

  // ── Script / handwritten ──
  {
    id: 'caveat',
    family: 'Caveat',
    category: 'script',
    roleSuggestion: 'display',
    roles: ['accent', 'display'],
    weights: [400, 500, 600, 700],
    styles: ['normal'],
    fallback: "cursive",
    provider: 'google',
    license: 'OFL',
    mood: ['handwritten', 'casual', 'personal'],
  },
  {
    id: 'kalam',
    family: 'Kalam',
    category: 'script',
    roleSuggestion: 'display',
    roles: ['accent', 'display'],
    weights: [300, 400, 700],
    styles: ['normal'],
    fallback: "cursive",
    provider: 'google',
    license: 'OFL',
    mood: ['handwritten', 'friendly', 'informal'],
  },
  {
    id: 'pacifico',
    family: 'Pacifico',
    category: 'script',
    roleSuggestion: 'display',
    roles: ['accent', 'display'],
    weights: [400],
    styles: ['normal'],
    fallback: "cursive",
    provider: 'google',
    license: 'OFL',
    mood: ['playful', 'retro', 'friendly'],
  },
  {
    id: 'dancing-script',
    family: 'Dancing Script',
    category: 'script',
    roleSuggestion: 'display',
    roles: ['accent', 'display'],
    weights: [400, 500, 600, 700],
    styles: ['normal'],
    fallback: "cursive",
    provider: 'google',
    license: 'OFL',
    mood: ['elegant', 'flowing', 'romantic'],
  },
  {
    id: 'lobster',
    family: 'Lobster',
    category: 'script',
    roleSuggestion: 'display',
    roles: ['accent', 'display'],
    weights: [400],
    styles: ['normal'],
    fallback: "cursive",
    provider: 'google',
    license: 'OFL',
    mood: ['bold', 'script', 'vintage'],
  },

  // ── Mono ──
  {
    id: 'source-code-pro',
    family: 'Source Code Pro',
    category: 'mono',
    roleSuggestion: 'body',
    roles: ['caption', 'body'],
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal', 'italic'],
    fallback: "'Courier New', Courier, monospace",
    provider: 'google',
    license: 'OFL',
    mood: ['technical', 'code', 'clean'],
  },
  {
    id: 'ibm-plex-mono',
    family: 'IBM Plex Mono',
    category: 'mono',
    roleSuggestion: 'body',
    roles: ['caption', 'body'],
    weights: [100, 200, 300, 400, 500, 600, 700],
    styles: ['normal', 'italic'],
    fallback: "'Courier New', Courier, monospace",
    provider: 'google',
    license: 'OFL',
    mood: ['technical', 'editorial', 'precise'],
  },
  {
    id: 'jetbrains-mono',
    family: 'JetBrains Mono',
    category: 'mono',
    roleSuggestion: 'body',
    roles: ['caption', 'body'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800],
    styles: ['normal', 'italic'],
    fallback: "'Courier New', Courier, monospace",
    provider: 'google',
    license: 'OFL',
    mood: ['technical', 'code', 'modern'],
  },

  // ── Arabic ──
  {
    id: 'cairo',
    family: 'Cairo',
    category: 'arabic',
    roleSuggestion: 'both',
    roles: ['title', 'body', 'accent', 'caption'],
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    supportsArabic: true,
    mood: ['clean', 'modern', 'geometric'],
  },
  {
    id: 'tajawal',
    family: 'Tajawal',
    category: 'arabic',
    roleSuggestion: 'body',
    roles: ['body', 'caption'],
    weights: [200, 300, 400, 500, 700, 800, 900],
    styles: ['normal'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    supportsArabic: true,
    mood: ['clean', 'modern', 'friendly'],
  },
  {
    id: 'amiri',
    family: 'Amiri',
    category: 'arabic',
    roleSuggestion: 'display',
    roles: ['title', 'display'],
    weights: [400, 700],
    styles: ['normal', 'italic'],
    fallback: "Georgia, 'Times New Roman', serif",
    provider: 'google',
    license: 'OFL',
    supportsArabic: true,
    mood: ['classical', 'literary', 'elegant'],
  },
  {
    id: 'noto-sans-arabic',
    family: 'Noto Sans Arabic',
    category: 'arabic',
    roleSuggestion: 'body',
    roles: ['body', 'accent', 'caption'],
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    styles: ['normal'],
    fallback: "system-ui, -apple-system, sans-serif",
    provider: 'google',
    license: 'OFL',
    supportsArabic: true,
    mood: ['neutral', 'universal', 'clean'],
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
    (f) =>
      f.roleSuggestion === role ||
      f.roleSuggestion === 'both' ||
      (f.roles && f.roles.includes(role)),
  );
}

export function getFontsByCategory(category: FontCategory): FontEntry[] {
  return FONT_CATALOG.filter((f) => f.category === category);
}

export function getDefaultFontForRole(role: FontRole): FontEntry {
  const candidates = getFontsByRole(role);
  if (candidates.length > 0) return candidates[0];
  // Safe fallback chain
  if (role === 'title') return getFontByFamily('Newsreader') ?? FONT_CATALOG[0];
  if (role === 'body') return getFontByFamily('Inter') ?? FONT_CATALOG[0];
  if (role === 'accent') return getFontByFamily('Space Grotesk') ?? FONT_CATALOG[0];
  if (role === 'caption') return getFontByFamily('IBM Plex Mono') ?? FONT_CATALOG[0];
  return FONT_CATALOG[0];
}

export function getAllFontFamilies(): string[] {
  return FONT_CATALOG.map((f) => f.family);
}

export function getAllFontIds(): string[] {
  return FONT_CATALOG.map((f) => f.id);
}

export function getArabicFonts(): FontEntry[] {
  return FONT_CATALOG.filter((f) => f.supportsArabic);
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
