// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProjectMessages } from '../useProjectMessages';
import * as chatApi from '../../api/chat.js';
import { ApiClientError } from '../../api/errors.js';

vi.mock('../../api/chat.js');

describe('useProjectMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMessage = {
    id: 'msg-1',
    projectId: 'proj-1',
    threadId: 'thread-1',
    role: 'user' as const,
    kind: 'text' as const,
    content: 'Hello',
    metadata: {},
    seq: 1,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('initial state is idle with no messages when projectId is undefined', () => {
    const { result } = renderHook(() => useProjectMessages(undefined));
    expect(result.current.state).toBe('idle');
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('loads messages successfully', async () => {
    vi.mocked(chatApi.listProjectMessages).mockResolvedValueOnce([mockMessage]);

    const { result } = renderHook(() => useProjectMessages('proj-1'));

    await waitFor(() => expect(result.current.messages).toEqual([mockMessage]));
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('handles empty messages', async () => {
    vi.mocked(chatApi.listProjectMessages).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useProjectMessages('proj-1'));

    await waitFor(() => expect(result.current.state).toBe('empty'));
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('handles error state', async () => {
    vi.mocked(chatApi.listProjectMessages).mockRejectedValueOnce(
      new ApiClientError('NOT_FOUND', 'Project not found'),
    );

    const { result } = renderHook(() => useProjectMessages('proj-1'));

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toContain('Project not found');
  });

  it('does not call API without projectId', async () => {
    renderHook(() => useProjectMessages(undefined));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chatApi.listProjectMessages).not.toHaveBeenCalled();
  });

  it('avoids stale load overwriting newer state', async () => {
    vi.mocked(chatApi.listProjectMessages)
      .mockImplementation(async (projectId) => {
        if (projectId === 'proj-slow') {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return [{ ...mockMessage, id: 'msg-slow', projectId: 'proj-slow' }];
        }
        return [{ ...mockMessage, id: 'msg-fast', projectId: 'proj-fast' }];
      });

    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectMessages(projectId),
      { initialProps: { projectId: 'proj-slow' as string | undefined } },
    );

    // Immediately switch to a different project before the first one resolves
    rerender({ projectId: 'proj-fast' });

    await waitFor(() => expect(result.current.messages[0]?.id).toBe('msg-fast'));
    expect(result.current.messages[0]?.projectId).toBe('proj-fast');
  });

  it('exposes reload that refetches messages', async () => {
    vi.mocked(chatApi.listProjectMessages)
      .mockResolvedValueOnce([mockMessage])
      .mockResolvedValueOnce([{ ...mockMessage, content: 'Updated' }]);

    const { result } = renderHook(() => useProjectMessages('proj-1'));

    await waitFor(() => expect(result.current.messages).toEqual([mockMessage]));

    result.current.reload();

    await waitFor(() => expect(result.current.messages[0]?.content).toBe('Updated'));
  });
});
