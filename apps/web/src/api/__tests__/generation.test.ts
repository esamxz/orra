import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGenerationJob, getGenerationJob } from '../generation.js';
import * as clientModule from '../client.js';
import { ApiClientError } from '../errors.js';

// Use the real module name so vi.spyOn works with hoisted vitest mocks
vi.mock('../client.js', async () => {
  const actual = await vi.importActual<typeof import('../client.js')>('../client.js');
  return {
    ...actual,
    apiClient: {
      request: vi.fn(),
      getAuthToken: vi.fn().mockResolvedValue(null),
      setAuthTokenProvider: vi.fn(),
    },
  };
});

describe('generation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockJob = {
    id: 'job-1',
    projectId: 'proj-1',
    status: 'queued',
    kind: 'full_generate',
    resultVersionId: null,
    error: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('createGenerationJob calls POST /v1/generate', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockJob);

    await createGenerationJob({ projectId: 'proj-1', approvalMessageId: 'msg-1' });
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/generate', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj-1', approvalMessageId: 'msg-1' }),
    });
  });

  it('createGenerationJob returns job DTO', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockJob);

    const result = await createGenerationJob({ projectId: 'proj-1', approvalMessageId: 'msg-1' });
    expect(result.id).toBe('job-1');
    expect(result.status).toBe('queued');
    expect(result.kind).toBe('full_generate');
  });

  it('getGenerationJob calls GET /v1/jobs/:id', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockJob);

    await getGenerationJob('job-1');
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/jobs/job-1');
  });

  it('getGenerationJob returns job DTO', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockJob);

    const result = await getGenerationJob('job-1');
    expect(result.id).toBe('job-1');
    expect(result.status).toBe('queued');
  });

  it('createGenerationJob maps ApiClientError on failure', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('CONFLICT', 'Approval must be approved'),
    );

    await expect(createGenerationJob({ projectId: 'proj-1', approvalMessageId: 'msg-1' })).rejects.toBeInstanceOf(ApiClientError);
  });

  it('getGenerationJob maps ApiClientError on failure', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('NOT_FOUND', 'Job not found'),
    );

    await expect(getGenerationJob('job-1')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('maps INSUFFICIENT_CREDITS ApiClientError', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValue(
      new ApiClientError('INSUFFICIENT_CREDITS', 'Not enough credits for this generation.'),
    );

    await expect(createGenerationJob({ projectId: 'proj-1', approvalMessageId: 'msg-1' })).rejects.toBeInstanceOf(ApiClientError);
    await expect(createGenerationJob({ projectId: 'proj-1', approvalMessageId: 'msg-1' })).rejects.toThrow('Not enough credits');
  });
});
