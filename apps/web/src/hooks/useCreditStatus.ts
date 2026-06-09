import { useState, useEffect, useCallback, useRef } from 'react';
import { getCreditStatus } from '../api/credits.js';
import { ApiClientError } from '../api/errors.js';
import type { CreditStatusResponse } from '../api/types.js';

export interface UseCreditStatusResult {
  data: CreditStatusResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Load workspace credit status from GET /v1/credits.
 *
 * Behavior:
 * - Loads on mount when enabled.
 * - Exposes loading, error, data, and a manual reload function.
 * - Handles UNAUTHENTICATED calmly by showing empty state (no crash).
 * - Does not poll; reload is triggered manually (e.g. after generation job finishes).
 */
export function useCreditStatus(enabled: boolean = true): UseCreditStatusResult {
  const [data, setData] = useState<CreditStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const versionRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const version = ++versionRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getCreditStatus();
      if (version === versionRef.current && !cancelledRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (version === versionRef.current && !cancelledRef.current) {
        if (err instanceof ApiClientError && err.code === 'UNAUTHENTICATED') {
          // Calm fallback: unauthenticated users see no credit data instead of an error banner
          setData(null);
          setError(null);
        } else {
          const msg = err instanceof ApiClientError
            ? err.message
            : 'Unable to load usage status.';
          setError(msg);
          setData(null);
        }
      }
    } finally {
      if (version === versionRef.current && !cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const reload = useCallback(() => {
    setError(null);
    load();
  }, [load]);

  return { data, loading, error, reload };
}
