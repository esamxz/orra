import { useState, useEffect, useCallback } from 'react';
import { listProjects } from '../api/projects.js';
import { ApiClientError } from '../api/errors.js';
import type { Project } from '../api/types.js';

export type ProjectsLoadingState = 'idle' | 'loading' | 'error' | 'empty';

export interface UseProjectsResult {
  projects: Project[];
  state: ProjectsLoadingState;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch the workspace project list from the API.
 * Falls back to empty array on error so the UI can decide whether to show
 * mocks or an error state.
 */
export function useProjects(tab: 'recent' | 'all' = 'recent'): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [state, setState] = useState<ProjectsLoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState('loading');
      setError(null);

      try {
        const data = await listProjects(tab);
        if (cancelled) return;
        setProjects(data);
        setState(data.length === 0 ? 'empty' : 'idle');
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiClientError
          ? err.message
          : 'Failed to load projects';
        setError(msg);
        setProjects([]);
        setState('error');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tab, refreshKey]);

  return { projects, state, error, refresh };
}
