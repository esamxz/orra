import { useState, useEffect, useCallback, useRef } from 'react';
import { getProject } from '../api/projects.js';
import { ApiClientError } from '../api/errors.js';
import type { Project } from '../api/types.js';

export type ProjectLoadState = 'idle' | 'loading' | 'error' | 'not_found';

export interface UseProjectResult {
  project: Project | null;
  state: ProjectLoadState;
  error: string | null;
  reload: () => void;
}

/**
 * Fetch a single project by ID from the API.
 *
 * Used by WorkspacePage to resolve currentArtifactId and project metadata
 * when the page is opened via direct URL or refresh (no router state).
 * Returns a calm error state instead of crashing.
 */
export function useProject(projectId: string | undefined): UseProjectResult {
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<ProjectLoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const activeIdRef = useRef<string | undefined>(undefined);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setState('idle');
      setError(null);
      activeIdRef.current = undefined;
      return;
    }

    let cancelled = false;
    activeIdRef.current = projectId;
    const pid = projectId;

    async function load() {
      setState('loading');
      setError(null);

      try {
        const data = await getProject(pid);
        if (cancelled || activeIdRef.current !== pid) return;
        setProject(data);
        setState('idle');
      } catch (err) {
        if (cancelled || activeIdRef.current !== pid) return;
        if (err instanceof ApiClientError && err.code === 'NOT_FOUND') {
          setState('not_found');
          setError('This project no longer exists.');
        } else {
          const msg = err instanceof ApiClientError
            ? err.message
            : 'Failed to load project. Please try again.';
          setError(msg);
          setState('error');
        }
        setProject(null);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  return { project, state, error, reload };
}
