// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProjectMemory } from '../useProjectMemory';
import * as memoryApi from '../../api/projectMemory.js';
import { ApiClientError } from '../../api/errors.js';
import type { ProjectContextMemoryDto } from '../../api/types.js';

vi.mock('../../api/projectMemory.js', () => ({
  getProjectMemory: vi.fn(),
}));

const mockMemory: ProjectContextMemoryDto = {
  projectId: 'proj-1',
  topic: 'self-improvement',
  audience: 'professionals',
  tone: 'calm',
  platform: 'LinkedIn',
  slideCount: 5,
  rejectedIdeas: [],
  constraints: [],
  summary: 'A calm self-improvement carousel',
  updatedAt: '2026-06-01T00:00:00Z',
};

describe('useProjectMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state: memory null, loading false when no projectId', () => {
    const { result } = renderHook(() => useProjectMemory(undefined));
    expect(result.current.memory).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets loading true then resolves memory on success', async () => {
    vi.mocked(memoryApi.getProjectMemory).mockResolvedValueOnce(mockMemory);

    const { result } = renderHook(() => useProjectMemory('proj-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.memory).not.toBeNull();
    expect(result.current.memory!.topic).toBe('self-improvement');
    expect(result.current.error).toBeNull();
  });

  it('handles null memory (no memory row yet) without error', async () => {
    vi.mocked(memoryApi.getProjectMemory).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useProjectMemory('proj-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.memory).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets error on ApiClientError', async () => {
    vi.mocked(memoryApi.getProjectMemory).mockRejectedValueOnce(
      new ApiClientError('INTERNAL_ERROR', 'Internal server error'),
    );

    const { result } = renderHook(() => useProjectMemory('proj-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.memory).toBeNull();
    expect(result.current.error).toBe('Internal server error');
  });

  it('sets generic error on network failure', async () => {
    vi.mocked(memoryApi.getProjectMemory).mockRejectedValueOnce(
      new Error('net::ERR_FAILED'),
    );

    const { result } = renderHook(() => useProjectMemory('proj-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Could not load project memory.');
    expect(result.current.memory).toBeNull();
  });

  it('reload() triggers re-fetch', async () => {
    vi.mocked(memoryApi.getProjectMemory)
      .mockResolvedValueOnce(mockMemory)
      .mockResolvedValueOnce({ ...mockMemory, topic: 'health' });

    const { result } = renderHook(() => useProjectMemory('proj-1'));

    await waitFor(() => expect(result.current.memory?.topic).toBe('self-improvement'));

    result.current.reload();

    await waitFor(() => expect(result.current.memory?.topic).toBe('health'));
    expect(memoryApi.getProjectMemory).toHaveBeenCalledTimes(2);
  });

  it('does not call API when projectId is undefined', async () => {
    renderHook(() => useProjectMemory(undefined));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(memoryApi.getProjectMemory).not.toHaveBeenCalled();
  });

  it('clears memory when projectId changes to undefined', async () => {
    vi.mocked(memoryApi.getProjectMemory).mockResolvedValueOnce(mockMemory);

    const { result, rerender } = renderHook(
      ({ id }: { id: string | undefined }) => useProjectMemory(id),
      { initialProps: { id: 'proj-1' as string | undefined } },
    );

    await waitFor(() => expect(result.current.memory).not.toBeNull());

    rerender({ id: undefined });

    expect(result.current.memory).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
