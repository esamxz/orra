import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProjectMemory } from '../projectMemory.js';
import * as clientModule from '../client.js';
import { ApiClientError } from '../errors.js';
import type { ProjectContextMemoryDto } from '../types.js';

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

const mockMemory: ProjectContextMemoryDto = {
  projectId: 'proj-1',
  topic: 'fitness',
  audience: 'gym goers',
  tone: 'energetic',
  platform: 'Instagram',
  slideCount: 5,
  visualDirection: 'bold and dynamic',
  approvedDirection: 'Use strong contrast',
  rejectedIdeas: ['soft pastel colors'],
  constraints: ['no text on images'],
  summary: 'A fitness carousel for Instagram',
  updatedAt: '2026-06-01T00:00:00Z',
};

describe('projectMemory API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls GET /projects/:id/memory with correct path', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockMemory);

    await getProjectMemory('proj-1');

    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects/proj-1/memory');
  });

  it('returns memory DTO when API returns memory', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(mockMemory);

    const result = await getProjectMemory('proj-1');

    expect(result).not.toBeNull();
    expect(result!.topic).toBe('fitness');
    expect(result!.platform).toBe('Instagram');
    expect(result!.rejectedIdeas).toEqual(['soft pastel colors']);
  });

  it('returns null when API returns null (no memory yet)', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(null);

    const result = await getProjectMemory('proj-1');

    expect(result).toBeNull();
  });

  it('propagates ApiClientError on API failure', async () => {
    vi.mocked(clientModule.apiClient.request).mockRejectedValueOnce(
      new ApiClientError('NOT_FOUND', 'Project not found'),
    );

    await expect(getProjectMemory('proj-1')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('uses the projectId in the path', async () => {
    vi.mocked(clientModule.apiClient.request).mockResolvedValueOnce(null);

    await getProjectMemory('proj-abc-123');

    expect(clientModule.apiClient.request).toHaveBeenCalledWith(
      expect.stringContaining('proj-abc-123'),
    );
  });
});
