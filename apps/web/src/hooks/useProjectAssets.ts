import { useState, useEffect, useCallback, useRef } from 'react';
import { listProjectAssets, getProjectAssetPreviewUrl } from '../api/assets.js';
import { ApiClientError } from '../api/errors.js';
import type { AssetDto } from '../api/types.js';

export type ProjectAssetsLoadingState = 'idle' | 'loading' | 'error' | 'empty';

export interface UseProjectAssetsResult {
  assets: AssetDto[];
  state: ProjectAssetsLoadingState;
  error: string | null;
  reload: () => void;
  getPreviewUrl: (assetId: string) => Promise<string | null>;
  previewUrls: Record<string, string>;
}

/**
 * Fetch and manage project assets with on-demand preview URLs.
 *
 * Preview URLs are short-lived signed GET URLs (≈5 min). The hook caches
 * them per asset ID so repeated renders do not hammer the endpoint, but
 * callers should refetch if the URL is known to have expired.
 */
export function useProjectAssets(projectId: string | undefined): UseProjectAssetsResult {
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [state, setState] = useState<ProjectAssetsLoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const mutationVersionRef = useRef(0);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!projectId) {
      setAssets([]);
      setState('idle');
      setError(null);
      return;
    }

    let cancelled = false;
    const loadVersion = mutationVersionRef.current;
    const pid = projectId;

    async function load() {
      setState('loading');
      setError(null);

      try {
        const data = await listProjectAssets(pid);
        if (cancelled || mutationVersionRef.current !== loadVersion) return;
        setAssets(data);
        setState(data.length === 0 ? 'empty' : 'idle');
      } catch (err) {
        if (cancelled || mutationVersionRef.current !== loadVersion) return;
        const msg = err instanceof ApiClientError
          ? err.message
          : 'Failed to load project assets';
        setError(msg);
        setAssets([]);
        setState('error');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  const getPreviewUrl = useCallback(
    async (assetId: string): Promise<string | null> => {
      if (!projectId) return null;

      // Return cached URL if available
      const cached = previewUrls[assetId];
      if (cached) return cached;

      try {
        const res = await getProjectAssetPreviewUrl(projectId, assetId);
        setPreviewUrls((prev) => ({ ...prev, [assetId]: res.preview.url }));
        return res.preview.url;
      } catch (err) {
        const msg = err instanceof ApiClientError
          ? err.message
          : 'Failed to get preview URL';
        // Silent fallback — consumer can show filename/status instead
        console.warn('Preview URL failed:', msg);
        return null;
      }
    },
    [projectId, previewUrls],
  );

  return { assets, state, error, reload, getPreviewUrl, previewUrls };
}
