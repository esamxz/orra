import { useState, useEffect, useRef, useCallback } from 'react';
import { getGenerationJob } from '../api/generation.js';
import { getArtifact } from '../api/artifacts.js';
import { ApiClientError } from '../api/errors.js';
import type { GenerationJobDto, GenerationJobStatus, ArtifactApiResponse } from '../api/types.js';

export type JobPollingState = 'idle' | 'polling' | 'succeeded' | 'failed';

export interface UseGenerationJobPollingResult {
  job: GenerationJobDto | null;
  state: JobPollingState;
  error: string | null;
  /** Artifact loaded after a succeeded job with resultVersionId. */
  artifact: ArtifactApiResponse | null;
  /** Calm error message if artifact reload failed after success. */
  artifactError: string | null;
}

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES: GenerationJobStatus[] = ['succeeded', 'failed'];

/**
 * Poll a generation job until it reaches a terminal status.
 * Starts polling when jobId is provided, stops automatically on
 * succeeded or failed.
 *
 * Phase 9H: when the job succeeds and carries a resultVersionId, the hook
 * automatically reloads the artifact (if artifactId is provided) and surfaces
 * the new document so the caller can hydrate the editor.
 */
export function useGenerationJobPolling(
  jobId: string | undefined,
  artifactId?: string
): UseGenerationJobPollingResult {
  const [job, setJob] = useState<GenerationJobDto | null>(null);
  const [state, setState] = useState<JobPollingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<ArtifactApiResponse | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setState('idle');
      setError(null);
      setArtifact(null);
      setArtifactError(null);
      clearTimer();
      return;
    }

    let cancelled = false;
    const activeJobId = jobId;
    setState('polling');
    setError(null);
    setArtifact(null);
    setArtifactError(null);

    async function poll() {
      try {
        const data = await getGenerationJob(activeJobId);
        if (cancelled) return;
        setJob(data);

        if (TERMINAL_STATUSES.includes(data.status)) {
          const isSuccess = data.status === 'succeeded';
          setState(isSuccess ? 'succeeded' : 'failed');
          clearTimer();

          // Phase 9H: on success with resultVersionId, reload artifact
          if (isSuccess && data.resultVersionId && artifactId) {
            try {
              const loaded = await getArtifact(artifactId);
              if (!cancelled) {
                setArtifact(loaded);
                setArtifactError(null);
              }
            } catch (artErr) {
              if (!cancelled) {
                const msg =
                  artErr instanceof ApiClientError
                    ? artErr.message
                    : 'Could not load the generated design. Please refresh the page.';
                setArtifactError(msg);
                setArtifact(null);
              }
            }
          }

          // If succeeded but no resultVersionId, do not reload — show safe message
          if (isSuccess && !data.resultVersionId) {
            setArtifactError('Generation completed but the result is not yet available.');
          }
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiClientError ? err.message : 'Failed to check job status.';
        setError(msg);
        // Stop polling on persistent errors to avoid spamming the API.
        clearTimer();
      }
    }

    // Poll immediately, then on interval
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [jobId, artifactId, clearTimer]);

  return { job, state, error, artifact, artifactError };
}
