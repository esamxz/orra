import { useState, useEffect, useCallback, useRef } from 'react';
import { getProjectMemory } from '../api/projectMemory.js';
import { ApiClientError } from '../api/errors.js';
import type { ProjectContextMemoryDto } from '../api/types.js';

export interface UseProjectMemoryResult {
  memory: ProjectContextMemoryDto | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetch project memory for a given project.
 * Returns null memory without error when no memory row exists yet.
 * Does not block workspace rendering — all states are graceful.
 * Guards against stale results when projectId changes quickly.
 */
export function useProjectMemory(projectId: string | undefined): UseProjectMemoryResult {
  const [memory, setMemory] = useState<ProjectContextMemoryDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const activeIdRef = useRef<string | undefined>(undefined);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!projectId) {
      setMemory(null);
      setLoading(false);
      setError(null);
      activeIdRef.current = undefined;
      return;
    }

    let cancelled = false;
    activeIdRef.current = projectId;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await getProjectMemory(projectId!);
        if (cancelled || activeIdRef.current !== projectId) return;
        setMemory(data);
        setLoading(false);
      } catch (err) {
        if (cancelled || activeIdRef.current !== projectId) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Could not load project memory.';
        setError(msg);
        setMemory(null);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  return { memory, loading, error, reload };
}
