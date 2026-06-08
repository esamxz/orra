import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listProjectMessages, appendProjectMessage } from '../chat.js';
import * as clientModule from '../client.js';
import { ApiClientError } from '../errors.js';

describe('chat API', () => {
  beforeEach(() => {
    vi.spyOn(clientModule.apiClient, 'request').mockImplementation(async () => ({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('listProjectMessages calls GET /v1/projects/:id/messages without params', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce([mockMessage]);

    await listProjectMessages('proj-1');
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects/proj-1/messages');
  });

  it('listProjectMessages passes limit query param', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce([mockMessage]);

    await listProjectMessages('proj-1', { limit: 10 });
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects/proj-1/messages?limit=10');
  });

  it('listProjectMessages returns message data', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce([mockMessage]);

    const result = await listProjectMessages('proj-1');
    expect(result).toEqual([mockMessage]);
  });

  it('appendProjectMessage calls POST /v1/projects/:id/messages with content', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce({ message: mockMessage, intent: { mode: 'conversation', confidence: 'high', reason: 'Test' } });

    await appendProjectMessage('proj-1', { content: 'Hello' });
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects/proj-1/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'Hello' }),
    });
  });

  it('appendProjectMessage returns message and intent', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce({
      message: mockMessage,
      intent: { mode: 'conversation', confidence: 'high', reason: 'Test' },
    });

    const result = await appendProjectMessage('proj-1', { content: 'Hello' });
    expect(result.message).toEqual(mockMessage);
    expect(result.intent.mode).toBe('conversation');
  });

  it('listProjectMessages maps ApiClientError on failure', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('NOT_FOUND', 'Project not found'),
    );

    await expect(listProjectMessages('proj-1')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('appendProjectMessage maps ApiClientError on failure', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('VALIDATION', 'Content is required'),
    );

    await expect(appendProjectMessage('proj-1', { content: '' })).rejects.toBeInstanceOf(ApiClientError);
  });
});
