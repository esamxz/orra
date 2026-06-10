// Pure helpers — no Konva, no DOM dependency. Safe to import in node tests.

import type { ArtifactDocument } from '@orra/shared';

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

export function buildZipFilename(projectName?: string): string {
  if (projectName?.trim().length) {
    const slug = projectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (slug.length > 0) return `${slug}-carousel.zip`;
  }
  return 'orra-carousel.zip';
}

export function assertCarouselExportReady(doc: ArtifactDocument): void {
  if (doc.cards.length < 2) {
    throw new Error('ZIP export requires at least 2 cards');
  }
}

const IMAGE_LOAD_TIMEOUT_MS = 15_000;

/**
 * Loads an HTMLImageElement for export rendering.
 *
 * Sets crossOrigin = 'anonymous' so the canvas is not tainted when Konva calls
 * toDataURL(). R2 must allow GET requests from the app origin via CORS headers,
 * otherwise the image load will succeed but the canvas will be tainted and export
 * will throw a security error.
 *
 * @throws if the image fails to load or the optional timeout expires.
 */
export function loadImageForExport(
  url: string,
  timeoutMs = IMAGE_LOAD_TIMEOUT_MS,
): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    img.onload = () => {
      cleanup();
      resolve(img);
    };

    img.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load image: ${url}`));
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        img.src = '';
        reject(new Error(`Image load timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    img.src = url;
  });
}
