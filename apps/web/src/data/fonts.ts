export const APP_FONT_CATALOG = [
  'Hanken Grotesk',
  'Newsreader',
  'Inter',
  'Geist',
  'DM Sans',
] as const;

export type AppFontFamily = (typeof APP_FONT_CATALOG)[number];
