import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAssetPreviewUrls } from '../useAssetPreviewUrls';

vi.mock('../../api/assets', () => ({
  getProjectAssetPreviewUrl: vi.fn(),
}));

import { getProjectAssetPreviewUrl } from '../../api/assets';

const mockedGetUrl = getProjectAssetPreviewUrl as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedGetUrl.mockReset();
});

function wrapper(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}

describe('useAssetPreviewUrls', () => {
  it('returns empty urls initially', () => {
    const { result } = renderHook(() => useAssetPreviewUrls('project-1', []), { wrapper });
    expect(result.current.urls).toEqual({});
  });

  it('fetches urls for provided asset ids', async () => {
    mockedGetUrl.mockResolvedValueOnce({ preview: { url: 'https://signed.example.com/a' } });
    mockedGetUrl.mockResolvedValueOnce({ preview: { url: 'https://signed.example.com/b' } });

    const { result } = renderHook(
      () => useAssetPreviewUrls('project-1', ['asset-a', 'asset-b']),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.urls['asset-a']).toBe('https://signed.example.com/a');
      expect(result.current.urls['asset-b']).toBe('https://signed.example.com/b');
    });

    expect(mockedGetUrl).toHaveBeenCalledTimes(2);
    expect(mockedGetUrl).toHaveBeenCalledWith('project-1', 'asset-a');
    expect(mockedGetUrl).toHaveBeenCalledWith('project-1', 'asset-b');
  });

  it('does not re-fetch already cached urls', async () => {
    mockedGetUrl.mockResolvedValue({ preview: { url: 'https://signed.example.com/a' } });

    const { result, rerender } = renderHook(
      ({ ids }) => useAssetPreviewUrls('project-1', ids),
      { wrapper, initialProps: { ids: ['asset-a'] } },
    );

    await waitFor(() => expect(result.current.urls['asset-a']).toBeDefined());
    expect(mockedGetUrl).toHaveBeenCalledTimes(1);

    rerender({ ids: ['asset-a', 'asset-b'] });
    await waitFor(() => expect(mockedGetUrl).toHaveBeenCalledTimes(2));
    expect(mockedGetUrl).toHaveBeenLastCalledWith('project-1', 'asset-b');
  });

  it('handles fetch failures gracefully', async () => {
    mockedGetUrl.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(
      () => useAssetPreviewUrls('project-1', ['asset-x']),
      { wrapper },
    );

    await waitFor(() => expect(mockedGetUrl).toHaveBeenCalled());
    expect(result.current.urls['asset-x']).toBeUndefined();
  });

  it('allows manual fetch via returned function', async () => {
    mockedGetUrl.mockResolvedValueOnce({ preview: { url: 'https://signed.example.com/c' } });

    const { result } = renderHook(
      () => useAssetPreviewUrls('project-1', []),
      { wrapper },
    );

    result.current.fetchUrl('asset-c');
    await waitFor(() => {
      expect(result.current.urls['asset-c']).toBe('https://signed.example.com/c');
    });
  });

  it('deduplicates simultaneous fetches for the same asset', async () => {
    let resolve: ((v: { preview: { url: string } }) => void) | undefined;
    mockedGetUrl.mockImplementation(() => new Promise((r) => { resolve = r; }));

    const { result } = renderHook(
      () => useAssetPreviewUrls('project-1', ['asset-d']),
      { wrapper },
    );

    // Trigger two fetches for the same asset quickly
    result.current.fetchUrl('asset-d');
    result.current.fetchUrl('asset-d');

    resolve?.({ preview: { url: 'https://signed.example.com/d' } });

    await waitFor(() => {
      expect(result.current.urls['asset-d']).toBe('https://signed.example.com/d');
    });

    // Only one network call despite two fetchUrl invocations
    expect(mockedGetUrl).toHaveBeenCalledTimes(1);
  });

  it('returns null when no projectId is provided', async () => {
    const { result } = renderHook(() => useAssetPreviewUrls(undefined, ['asset-e']), { wrapper });
    expect(result.current.urls).toEqual({});
    result.current.fetchUrl('asset-e');
    // fetchUrl should resolve to null without calling the API
    await waitFor(() => {
      expect(mockedGetUrl).not.toHaveBeenCalled();
    });
  });

  it('skips preview-url fetch for placeholder asset IDs in assetIds array', async () => {
    const { result } = renderHook(
      () => useAssetPreviewUrls('project-1', ['00000000-0000-0000-0000-000000000002']),
      { wrapper },
    );
    // Allow any microtasks/effects to run
    await waitFor(() => expect(result.current.urls).toEqual({}));
    expect(mockedGetUrl).not.toHaveBeenCalled();
    expect(result.current.urls['00000000-0000-0000-0000-000000000002']).toBeUndefined();
  });

  it('fetchUrl returns null without API call for placeholder IDs', async () => {
    const { result } = renderHook(
      () => useAssetPreviewUrls('project-1', []),
      { wrapper },
    );
    const url = await result.current.fetchUrl('00000000-0000-0000-0000-000000000099');
    expect(url).toBeNull();
    expect(mockedGetUrl).not.toHaveBeenCalled();
  });

  it('does not skip real asset IDs that happen to start with zeros in later groups', async () => {
    // This ID does NOT match the placeholder pattern (first 4 groups are not all zeros)
    const realId = 'a1b2c3d4-0000-0000-0000-000000000001';
    mockedGetUrl.mockResolvedValueOnce({ preview: { url: 'https://signed.example.com/real' } });
    const { result } = renderHook(
      () => useAssetPreviewUrls('project-1', [realId]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.urls[realId]).toBeDefined());
    expect(mockedGetUrl).toHaveBeenCalledWith('project-1', realId);
  });
});
