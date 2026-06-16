import { useState, useEffect, useCallback, useMemo } from 'react';
import { listTrendTemplates } from '../api/trendTemplates.js';
import { ApiClientError } from '../api/errors.js';
import type { TrendTemplateDto } from '../api/types.js';

export interface UseTrendTemplatesResult {
  data: TrendTemplateDto[];
  featured: TrendTemplateDto[];
  categories: string[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useTrendTemplates(enabled: boolean = true): UseTrendTemplatesResult {
  const [data, setData] = useState<TrendTemplateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const templates = await listTrendTemplates();
        if (cancelled) return;
        setData(templates);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.code === 'UNAUTHENTICATED') {
          setData([]);
          setError(null);
        } else {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load templates');
          setData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [enabled, refreshKey]);

  const featured = useMemo(() => data.filter((t) => t.isFeatured), [data]);

  const categories = useMemo(
    () => [...new Set(data.map((t) => t.category).filter((c): c is string => c !== null))].sort(),
    [data]
  );

  return { data, featured, categories, loading, error, reload };
}
