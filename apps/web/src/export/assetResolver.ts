import { getProjectAssetPreviewUrl } from '../api/assets.js';

/** Async function that resolves a short-lived signed GET URL for an asset. */
export type AssetUrlResolver = (assetId: string) => Promise<string | null>;

/**
 * Creates an export-time asset URL resolver for a project.
 *
 * Resolves short-lived signed preview URLs on demand and caches them for the
 * lifetime of the resolver instance (one export run). URLs are never stored
 * in the ArtifactDocument.
 */
export function createProjectAssetResolver(projectId: string): AssetUrlResolver {
  const cache = new Map<string, string>();

  return async function resolveAssetUrl(assetId: string): Promise<string | null> {
    const cached = cache.get(assetId);
    if (cached !== undefined) return cached;

    try {
      const res = await getProjectAssetPreviewUrl(projectId, assetId);
      const url = res.preview.url;
      cache.set(assetId, url);
      return url;
    } catch (err) {
      console.warn('[export] Failed to resolve preview URL for asset', assetId, err);
      return null;
    }
  };
}
