import { useState, useEffect, useRef, useCallback } from 'react';
import { getProjectAssetPreviewUrl } from '../api/assets.js';

export interface UseAssetPreviewUrlsResult {
  urls: Record<string, string>;
  fetchUrl: (assetId: string) => Promise<string | null>;
}

// Matches placeholder UUIDs produced by mock/test generators (e.g. 00000000-0000-0000-0000-000000000002).
// Generation handoff must replace these with real project asset IDs before the document is committed.
const PLACEHOLDER_UUID_RE = /^0{8}-0{4}-0{4}-0{4}-/;

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
      if (PLACEHOLDER_UUID_RE.test(assetId)) {
        if (import.meta.env.DEV) {
          console.warn(
            '[useAssetPreviewUrls] Document contains placeholder asset reference;' +
            ' generation handoff should replace this with a real project asset id.' +
            ` assetId=${assetId}`,
          );
        }
        return null;
      }
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
      (id) =>
        !PLACEHOLDER_UUID_RE.test(id) &&
        !cacheRef.current[id] &&
        !pendingRef.current.has(id),
    );
    for (const id of needed) {
      fetchUrl(id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, assetIds.join(','), fetchUrl]);

  return { urls: cacheRef.current, fetchUrl };
}
