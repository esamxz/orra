import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGenerationJobPolling } from '../useGenerationJobPolling.js';
import * as generationApi from '../../api/generation.js';
import * as artifactsApi from '../../api/artifacts.js';
import type { GenerationJobDto, ArtifactApiResponse } from '../../api/types.js';

vi.mock('../../api/generation.js', () => ({
  getGenerationJob: vi.fn(),
}));

vi.mock('../../api/artifacts.js', () => ({
  getArtifact: vi.fn(),
}));

describe('useGenerationJobPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generationApi.getGenerationJob).mockReset();
    vi.mocked(artifactsApi.getArtifact).mockReset();
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

  const mockSucceededWithResultJob: GenerationJobDto = {
    ...mockQueuedJob,
    status: 'succeeded',
    resultVersionId: 'ver-99',
  };

  const mockFailedJob: GenerationJobDto = {
    ...mockQueuedJob,
    status: 'failed',
    error: { message: 'timeout' },
  };

  const mockArtifact: ArtifactApiResponse = {
    artifactId: 'art-1',
    projectId: 'proj-1',
    currentVersionId: 'ver-99',
    version: 2,
    document: {
      schemaVersion: 1,
      artifactId: 'art-1',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      cards: [
        {
          id: 'card-1',
          index: 0,
          baseColor: '#1d2a30',
          layers: [],
        },
      ],
      version: 2,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('returns idle when no jobId', () => {
    const { result } = renderHook(() => useGenerationJobPolling(undefined));
    expect(result.current.state).toBe('idle');
    expect(result.current.job).toBeNull();
    expect(result.current.artifact).toBeNull();
    expect(result.current.artifactError).toBeNull();
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

  it('reloads artifact on succeeded with resultVersionId when artifactId provided', async () => {
    vi.mocked(generationApi.getGenerationJob)
      .mockResolvedValueOnce(mockQueuedJob)
      .mockResolvedValueOnce(mockSucceededWithResultJob);
    vi.mocked(artifactsApi.getArtifact).mockResolvedValueOnce(mockArtifact);

    const { result } = renderHook(() => useGenerationJobPolling('job-1', 'art-1'));

    await waitFor(() => expect(result.current.state).toBe('succeeded'), { timeout: 5000 });
    expect(result.current.job!.status).toBe('succeeded');

    await waitFor(() => expect(result.current.artifact).not.toBeNull(), { timeout: 3000 });
    expect(result.current.artifact!.artifactId).toBe('art-1');
    expect(result.current.artifactError).toBeNull();
    expect(artifactsApi.getArtifact).toHaveBeenCalledTimes(1);
    expect(artifactsApi.getArtifact).toHaveBeenCalledWith('art-1');
  }, 10000);

  it('does not reload artifact before job succeeds', async () => {
    vi.mocked(generationApi.getGenerationJob)
      .mockResolvedValueOnce(mockQueuedJob)
      .mockResolvedValueOnce(mockQueuedJob);

    const { result } = renderHook(() => useGenerationJobPolling('job-1', 'art-1'));

    await waitFor(() => expect(result.current.job).not.toBeNull(), { timeout: 2000 });
    expect(result.current.state).toBe('polling');
    expect(artifactsApi.getArtifact).not.toHaveBeenCalled();
  }, 10000);

  it('sets artifactError when succeeded has no resultVersionId', async () => {
    vi.mocked(generationApi.getGenerationJob)
      .mockResolvedValueOnce(mockQueuedJob)
      .mockResolvedValueOnce(mockSucceededJob);

    const { result } = renderHook(() => useGenerationJobPolling('job-1', 'art-1'));

    await waitFor(() => expect(result.current.state).toBe('succeeded'), { timeout: 5000 });
    expect(result.current.artifact).toBeNull();
    expect(result.current.artifactError).toBe(
      'Generation completed but the result is not yet available.'
    );
    expect(artifactsApi.getArtifact).not.toHaveBeenCalled();
  }, 10000);

  it('sets artifactError when artifact reload fails after success', async () => {
    vi.mocked(generationApi.getGenerationJob)
      .mockResolvedValueOnce(mockQueuedJob)
      .mockResolvedValueOnce(mockSucceededWithResultJob);
    vi.mocked(artifactsApi.getArtifact).mockRejectedValueOnce(new Error('Artifact not found'));

    const { result } = renderHook(() => useGenerationJobPolling('job-1', 'art-1'));

    await waitFor(() => expect(result.current.state).toBe('succeeded'), { timeout: 5000 });
    await waitFor(() => expect(result.current.artifactError).not.toBeNull(), { timeout: 3000 });
    expect(result.current.artifact).toBeNull();
    expect(result.current.artifactError).toBe(
      'Could not load the generated design. Please refresh the page.'
    );
  }, 10000);
});
