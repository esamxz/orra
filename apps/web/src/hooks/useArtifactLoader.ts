import { useState, useRef, useCallback } from 'react';
import { getArtifact } from '../api/artifacts.js';
import { ApiClientError } from '../api/errors.js';
import type { ArtifactDocument } from '@orra/shared';

export type ArtifactLoadState = 'idle' | 'loading' | 'error' | 'not_found';

export interface UseArtifactLoaderResult {
  document: ArtifactDocument | null;
  state: ArtifactLoadState;
  error: string | null;
  load: (artifactId: string) => void;
  clear: () => void;
}

/**
 * Load an artifact document from the API and validate it against the shared
 * ArtifactDocumentSchema. Returns a calm error state instead of crashing.
 */
export function useArtifactLoader(
  onLoaded?: (doc: ArtifactDocument) => void,
): UseArtifactLoaderResult {
  const [document, setDocument] = useState<ArtifactDocument | null>(null);
  const [state, setState] = useState<ArtifactLoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const load = useCallback(
    async (artifactId: string) => {
      if (!artifactId) return;
      activeIdRef.current = artifactId;
      setState('loading');
      setError(null);

      try {
        const result = await getArtifact(artifactId);
        // Guard against a stale load if the caller switched artifacts quickly.
        if (activeIdRef.current !== artifactId) return;
        setDocument(result.document);
        setState('idle');
        onLoaded?.(result.document);
      } catch (err) {
        if (activeIdRef.current !== artifactId) return;
        if (err instanceof ApiClientError && err.code === 'NOT_FOUND') {
          setState('not_found');
          setError('This artifact no longer exists.');
        } else if (err instanceof ApiClientError && err.code === 'VALIDATION') {
          setState('error');
          setError('The artifact document is corrupted and cannot be loaded.');
        } else {
          setState('error');
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load the artifact. Please try again.',
          );
        }
        setDocument(null);
      }
    },
    [onLoaded],
  );

  const clear = useCallback(() => {
    activeIdRef.current = null;
    setDocument(null);
    setState('idle');
    setError(null);
  }, []);

  return { document, state, error, load, clear };
}
