import type { BrandTypography } from '../stores/dashboardStore';

export type BrandPresetKey = BrandTypography['preset'];

export const BRAND_TYPOGRAPHY_PRESETS: Record<
  BrandPresetKey,
  { label: string } & Omit<BrandTypography, 'preset' | 'notes'>
> = {
  'editorial-calm': {
    label: 'Editorial',
    titleFont: 'Newsreader',
    titleWeight: 500,
    bodyFont: 'Hanken Grotesk',
    bodyWeight: 400,
    accentFont: 'Space Grotesk',
    accentWeight: 500,
    captionFont: 'IBM Plex Mono',
    captionWeight: 400,
  },
  'modern-saas': {
    label: 'Modern',
    titleFont: 'Space Grotesk',
    titleWeight: 700,
    bodyFont: 'Inter',
    bodyWeight: 400,
    accentFont: 'Manrope',
    accentWeight: 600,
    captionFont: 'Source Code Pro',
    captionWeight: 400,
  },
  'bold-poster': {
    label: 'Bold Poster',
    titleFont: 'Bebas Neue',
    titleWeight: 400,
    bodyFont: 'Montserrat',
    bodyWeight: 400,
    accentFont: 'Anton',
    accentWeight: 400,
    captionFont: 'Inter',
    captionWeight: 400,
  },
  custom: {
    label: 'Custom',
    titleFont: 'Newsreader',
    titleWeight: 500,
    bodyFont: 'Inter',
    bodyWeight: 400,
    accentFont: 'Space Grotesk',
    accentWeight: 500,
    captionFont: 'IBM Plex Mono',
    captionWeight: 400,
  },
};
