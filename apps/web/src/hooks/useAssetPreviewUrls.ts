import { useState, useEffect, useRef, useCallback } from 'react';
import { getProjectAssetPreviewUrl } from '../api/assets.js';

export interface UseAssetPreviewUrlsResult {
  urls: Record<string, string>;
  fetchUrl: (assetId: string) => Promise<string | null>;
}

/**
 * Resolve short-lived signed preview URLs for a set of asset IDs.
 *
 * Preview URLs are cached by asset ID and refreshed only when missing.
 * Callers should not persist these URLs; they expire within minutes.
 */
export function useAssetPreviewUrls(
  projectId: string | undefined,
  assetIds: string[],
): UseAssetPreviewUrlsResult {
  const [, setVersion] = useState(0);
  const cacheRef = useRef<Record<string, string>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  const fetchUrl = useCallback(
    async (assetId: string): Promise<string | null> => {
      if (!projectId) return null;
      if (cacheRef.current[assetId]) return cacheRef.current[assetId];
      if (pendingRef.current.has(assetId)) return null;

      pendingRef.current.add(assetId);
      try {
        const res = await getProjectAssetPreviewUrl(projectId, assetId);
        const url = res.preview.url;
        cacheRef.current = { ...cacheRef.current, [assetId]: url };
        setVersion((v) => v + 1);
        return url;
      } catch (err) {
        console.warn('Preview URL failed for', assetId, err);
        return null;
      } finally {
        pendingRef.current.delete(assetId);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!projectId) return;
    const needed = [...new Set(assetIds)].filter(
      (id) => !cacheRef.current[id] && !pendingRef.current.has(id),
    );
    for (const id of needed) {
      fetchUrl(id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, assetIds.join(','), fetchUrl]);

  return { urls: cacheRef.current, fetchUrl };
}
