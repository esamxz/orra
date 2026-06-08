import { useState, useEffect, useRef, useCallback } from 'react';
import { getGenerationJob } from '../api/generation.js';
import { ApiClientError } from '../api/errors.js';
import type { GenerationJobDto, GenerationJobStatus } from '../api/types.js';

export type JobPollingState = 'idle' | 'polling' | 'succeeded' | 'failed';

export interface UseGenerationJobPollingResult {
  job: GenerationJobDto | null;
  state: JobPollingState;
  error: string | null;
}

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES: GenerationJobStatus[] = ['succeeded', 'failed'];

/**
 * Poll a generation job until it reaches a terminal status.
 * Starts polling when jobId is provided, stops automatically on
 * succeeded or failed. Does not load artifacts — the caller decides
 * what to do when the job completes.
 */
export function useGenerationJobPolling(
  jobId: string | undefined
): UseGenerationJobPollingResult {
  const [job, setJob] = useState<GenerationJobDto | null>(null);
  const [state, setState] = useState<JobPollingState>('idle');
  const [error, setError] = useState<string | null>(null);
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
      clearTimer();
      return;
    }

    let cancelled = false;
    const activeJobId = jobId; // narrowed by guard above
    setState('polling');
    setError(null);

    async function poll() {
      try {
        const data = await getGenerationJob(activeJobId);
        if (cancelled) return;
        setJob(data);

        if (TERMINAL_STATUSES.includes(data.status)) {
          setState(data.status === 'succeeded' ? 'succeeded' : 'failed');
          clearTimer();
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
  }, [jobId, clearTimer]);

  return { job, state, error };
}
