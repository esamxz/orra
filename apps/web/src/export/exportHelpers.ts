// Pure helpers — no Konva, no DOM dependency. Safe to import in node tests.

export async function waitForFonts(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }
}

export function buildExportFilename(
  projectName: string | undefined,
  cardIndex: number,
): string {
  const paddedIndex = String(cardIndex + 1).padStart(2, '0');
  if (projectName?.trim().length) {
    const slug = projectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (slug.length > 0) return `${slug}-${paddedIndex}.png`;
  }
  return `orra-card-${paddedIndex}.png`;
}
