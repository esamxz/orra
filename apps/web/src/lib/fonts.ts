// ---------------------------------------------------------------------------
// Web font loading helpers
// ---------------------------------------------------------------------------

/**
 * Wait for all web fonts to be ready.
 * Returns a promise that resolves when document.fonts is ready.
 */
export function waitForFonts(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), timeoutMs);
    document.fonts.ready
      .then(() => {
        clearTimeout(timer);
        resolve();
      })
      .catch(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

/**
 * Wait for specific font families to load.
 * Uses document.fonts.load() for each family + weight combo.
 */
export async function waitForFontFamilies(
  families: Array<{ family: string; weight?: number | string }>,
  timeoutMs = 5000,
): Promise<void> {
  const timer = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  const loads = families.map(({ family, weight = '400' }) =>
    document.fonts.load(`${weight} 1em "${family}"`).catch(() => undefined),
  );
  await Promise.race([Promise.all(loads).then(() => {}), timer]);
}
