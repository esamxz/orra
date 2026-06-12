// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useProjectAssets } from '../useProjectAssets';
import * as assetsApi from '../../api/assets.js';
import { ApiClientError } from '../../api/errors.js';

vi.mock('../../api/assets.js', () => ({
  listProjectAssets: vi.fn(),
  getProjectAssetPreviewUrl: vi.fn(),
}));

const mockAsset = {
  id: 'asset-1',
  workspaceId: 'ws-1',
  projectId: 'proj-1',
  brandSystemId: null,
  kind: 'upload',
  fileName: 'hero.png',
  contentType: 'image/png',
  sizeBytes: 1024,
  status: 'uploaded',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('useProjectAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns idle state when no projectId', () => {
    const { result } = renderHook(() => useProjectAssets(undefined));
    expect(result.current.state).toBe('idle');
    expect(result.current.assets).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.previewUrls).toEqual({});
  });

  it('loads assets successfully', async () => {
    vi.mocked(assetsApi.listProjectAssets).mockResolvedValueOnce([mockAsset]);

    const { result } = renderHook(() => useProjectAssets('proj-1'));

    expect(result.current.state).toBe('loading');

    await waitFor(() => expect(result.current.state).toBe('idle'));
    expect(result.current.assets).toHaveLength(1);
    expect(result.current.assets[0].id).toBe('asset-1');
    expect(result.current.error).toBeNull();
  });

  it('enters empty state for zero assets', async () => {
    vi.mocked(assetsApi.listProjectAssets).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useProjectAssets('proj-1'));

    await waitFor(() => expect(result.current.state).toBe('empty'));
    expect(result.current.assets).toEqual([]);
  });

  it('handles load error', async () => {
    vi.mocked(assetsApi.listProjectAssets).mockRejectedValueOnce(
      new ApiClientError('NOT_FOUND', 'Project not found'),
    );

    const { result } = renderHook(() => useProjectAssets('proj-1'));

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.error).toContain('Project not found');
    expect(result.current.assets).toEqual([]);
  });

  it('reload triggers refetch', async () => {
    vi.mocked(assetsApi.listProjectAssets)
      .mockResolvedValueOnce([mockAsset])
      .mockResolvedValueOnce([mockAsset, { ...mockAsset, id: 'asset-2' }]);

    const { result } = renderHook(() => useProjectAssets('proj-1'));

    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    act(() => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.assets).toHaveLength(2));
  });

  it('getPreviewUrl fetches and caches preview URL', async () => {
    vi.mocked(assetsApi.listProjectAssets).mockResolvedValueOnce([mockAsset]);
    vi.mocked(assetsApi.getProjectAssetPreviewUrl).mockResolvedValueOnce({
      asset: mockAsset,
      preview: {
        method: 'GET',
        url: 'https://fake-r2.orra.local/read?key=hero',
        expiresAt: '2026-01-01T00:05:00Z',
      },
    });

    const { result } = renderHook(() => useProjectAssets('proj-1'));

    await waitFor(() => expect(result.current.state).toBe('idle'));

    let url: string | null = null;
    await act(async () => {
      url = await result.current.getPreviewUrl('asset-1');
    });

    expect(url).toBe('https://fake-r2.orra.local/read?key=hero');
    expect(result.current.previewUrls['asset-1']).toBe('https://fake-r2.orra.local/read?key=hero');
    expect(assetsApi.getProjectAssetPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it('getPreviewUrl returns cached URL without refetching', async () => {
    vi.mocked(assetsApi.listProjectAssets).mockResolvedValueOnce([mockAsset]);
    vi.mocked(assetsApi.getProjectAssetPreviewUrl).mockResolvedValueOnce({
      asset: mockAsset,
      preview: {
        method: 'GET',
        url: 'https://fake-r2.orra.local/read?key=hero',
        expiresAt: '2026-01-01T00:05:00Z',
      },
    });

    const { result } = renderHook(() => useProjectAssets('proj-1'));

    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.getPreviewUrl('asset-1');
    });

    // Second call should use cache
    let url: string | null = null;
    await act(async () => {
      url = await result.current.getPreviewUrl('asset-1');
    });

    expect(url).toBe('https://fake-r2.orra.local/read?key=hero');
    expect(assetsApi.getProjectAssetPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it('getPreviewUrl returns null when no projectId', async () => {
    const { result } = renderHook(() => useProjectAssets(undefined));

    let url: string | null = 'initial';
    await act(async () => {
      url = await result.current.getPreviewUrl('asset-1');
    });

    expect(url).toBeNull();
    expect(assetsApi.getProjectAssetPreviewUrl).not.toHaveBeenCalled();
  });

  it('getPreviewUrl handles API errors gracefully', async () => {
    vi.mocked(assetsApi.listProjectAssets).mockResolvedValueOnce([mockAsset]);
    vi.mocked(assetsApi.getProjectAssetPreviewUrl).mockRejectedValueOnce(
      new ApiClientError('VALIDATION', 'Asset not yet uploaded'),
    );

    const { result } = renderHook(() => useProjectAssets('proj-1'));

    await waitFor(() => expect(result.current.state).toBe('idle'));

    let url: string | null = 'initial';
    await act(async () => {
      url = await result.current.getPreviewUrl('asset-1');
    });

    expect(url).toBeNull();
    expect(result.current.previewUrls).not.toHaveProperty('asset-1');
  });
});
