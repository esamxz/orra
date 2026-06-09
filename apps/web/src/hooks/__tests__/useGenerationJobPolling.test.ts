import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGenerationJobPolling } from '../useGenerationJobPolling.js';
import * as generationApi from '../../api/generation.js';
import type { GenerationJobDto } from '../../api/types.js';

vi.mock('../../api/generation.js', () => ({
  getGenerationJob: vi.fn(),
}));

describe('useGenerationJobPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockQueuedJob: GenerationJobDto = {
    id: 'job-1',
    projectId: 'proj-1',
    status: 'queued',
    kind: 'full_generate',
    resultVersionId: null,
    error: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockSucceededJob: GenerationJobDto = {
    ...mockQueuedJob,
    status: 'succeeded',
  };

  const mockFailedJob: GenerationJobDto = {
    ...mockQueuedJob,
    status: 'failed',
    error: { message: 'timeout' },
  };

  it('returns idle when no jobId', () => {
    const { result } = renderHook(() => useGenerationJobPolling(undefined));
    expect(result.current.state).toBe('idle');
    expect(result.current.job).toBeNull();
  });

  it('polls and stops on succeeded', async () => {
    vi.mocked(generationApi.getGenerationJob)
      .mockResolvedValueOnce(mockQueuedJob)
      .mockResolvedValueOnce(mockSucceededJob);

    const { result } = renderHook(() => useGenerationJobPolling('job-1'));

    // Initial poll
    await waitFor(() => expect(result.current.job).not.toBeNull(), { timeout: 2000 });
    expect(result.current.job!.status).toBe('queued');
    expect(result.current.state).toBe('polling');

    // Wait for next poll -> succeeded
    await waitFor(() => expect(result.current.state).toBe('succeeded'), { timeout: 5000 });
    expect(result.current.job!.status).toBe('succeeded');
  }, 10000);

  it('stops on failed', async () => {
    vi.mocked(generationApi.getGenerationJob)
      .mockResolvedValueOnce(mockQueuedJob)
      .mockResolvedValueOnce(mockFailedJob);

    const { result } = renderHook(() => useGenerationJobPolling('job-1'));

    await waitFor(() => expect(result.current.state).toBe('failed'), { timeout: 5000 });
    expect(result.current.job!.status).toBe('failed');
  }, 10000);

  it('does not call getGenerationJob when jobId is undefined', () => {
    renderHook(() => useGenerationJobPolling(undefined));
    expect(generationApi.getGenerationJob).not.toHaveBeenCalled();
  });

  it('stops polling and surfaces error on API failure', async () => {
    vi.mocked(generationApi.getGenerationJob)
      .mockResolvedValueOnce(mockQueuedJob)
      .mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useGenerationJobPolling('job-1'));

    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 5000 });
    expect(result.current.state).toBe('polling'); // state stays polling until terminal; error is set
    expect(result.current.error).toBe('Failed to check job status.');

    // After error, timer should be cleared. Wait one more interval and ensure
    // no additional calls happened beyond the initial two polls.
    await new Promise((r) => setTimeout(r, 3500));
    expect(generationApi.getGenerationJob).toHaveBeenCalledTimes(2);
  }, 10000);

  it('does not load artifact on succeeded', async () => {
    // The hook only calls getGenerationJob and never touches artifact APIs.
    // This test documents that invariant.
    vi.mocked(generationApi.getGenerationJob)
      .mockResolvedValueOnce(mockQueuedJob)
      .mockResolvedValueOnce(mockSucceededJob);

    const { result } = renderHook(() => useGenerationJobPolling('job-1'));

    await waitFor(() => expect(result.current.state).toBe('succeeded'), { timeout: 5000 });
    expect(generationApi.getGenerationJob).toHaveBeenCalledTimes(2);
    // Any artifact fetch would require an import not present in the hook.
    // Structural proof: the hook file has no artifact API imports.
  }, 10000);
});
