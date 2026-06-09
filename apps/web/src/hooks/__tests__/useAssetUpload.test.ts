// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAssetUpload } from '../useAssetUpload';
import * as assetsApi from '../../api/assets.js';
import * as uploadHelper from '../../uploads/uploadFileToSignedUrl.js';
import { ApiClientError } from '../../api/errors.js';
import type { AssetDto, UploadIntentResponse } from '../../api/types.js';

vi.mock('../../api/assets.js', () => ({
  createProjectAssetUploadIntent: vi.fn(),
  confirmProjectAssetUpload: vi.fn(),
  createBrandAssetUploadIntent: vi.fn(),
  confirmBrandAssetUpload: vi.fn(),
}));

vi.mock('../../uploads/uploadFileToSignedUrl.js', () => ({
  uploadFileToSignedUrl: vi.fn(),
}));

const mockAsset: AssetDto = {
  id: 'asset-1',
  workspaceId: 'ws-1',
  projectId: 'proj-1',
  brandSystemId: null,
  kind: 'upload',
  fileName: 'photo.png',
  contentType: 'image/png',
  sizeBytes: 1024,
  r2Key: 'workspace/ws-1/projects/proj-1/assets/asset-1/photo.png',
  status: 'uploaded',
  createdAt: '2026-01-01T00:00:00Z',
};

const mockIntent: UploadIntentResponse = {
  asset: { ...mockAsset, status: 'pending_upload' },
  upload: {
    method: 'PUT',
    url: 'https://r2.example.com/signed',
    headers: { 'Content-Type': 'image/png' },
    expiresAt: '2026-01-01T00:05:00Z',
  },
};

function makeFile(name = 'photo.png', type = 'image/png', size = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type });
}

describe('useAssetUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state is idle', () => {
    const { result } = renderHook(() => useAssetUpload());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.asset).toBeNull();
  });

  it('rejects unsupported MIME type before intent', async () => {
    const { result } = renderHook(() => useAssetUpload());
    const file = makeFile('doc.pdf', 'application/pdf');

    await act(async () => {
      await result.current.upload(file, { type: 'project', projectId: 'proj-1', kind: 'upload' });
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain('Unsupported file type');
    expect(assetsApi.createProjectAssetUploadIntent).not.toHaveBeenCalled();
  });

  it('rejects too-large file before intent', async () => {
    const { result } = renderHook(() => useAssetUpload());
    const file = makeFile('big.png', 'image/png', 11 * 1024 * 1024);

    await act(async () => {
      await result.current.upload(file, { type: 'project', projectId: 'proj-1', kind: 'upload' });
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain('too large');
    expect(assetsApi.createProjectAssetUploadIntent).not.toHaveBeenCalled();
  });

  it('successful project flow: intent → PUT → confirm', async () => {
    vi.mocked(assetsApi.createProjectAssetUploadIntent).mockResolvedValueOnce(mockIntent);
    vi.mocked(uploadHelper.uploadFileToSignedUrl).mockResolvedValueOnce(undefined);
    vi.mocked(assetsApi.confirmProjectAssetUpload).mockResolvedValueOnce(mockAsset);

    const { result } = renderHook(() => useAssetUpload());
    const file = makeFile();

    await act(async () => {
      await result.current.upload(file, { type: 'project', projectId: 'proj-1', kind: 'upload' });
    });

    await waitFor(() => expect(result.current.status).toBe('succeeded'));
    expect(result.current.asset).toEqual(mockAsset);
    expect(result.current.error).toBeNull();

    expect(assetsApi.createProjectAssetUploadIntent).toHaveBeenCalledWith('proj-1', {
      fileName: 'photo.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });
    expect(uploadHelper.uploadFileToSignedUrl).toHaveBeenCalledWith(
      file,
      mockIntent.upload,
      expect.any(AbortSignal),
    );
    expect(assetsApi.confirmProjectAssetUpload).toHaveBeenCalledWith('proj-1', 'asset-1', {
      expectedSizeBytes: 1024,
      expectedContentType: 'image/png',
    });
  });

  it('successful brand flow: intent → PUT → confirm', async () => {
    vi.mocked(assetsApi.createBrandAssetUploadIntent).mockResolvedValueOnce(mockIntent);
    vi.mocked(uploadHelper.uploadFileToSignedUrl).mockResolvedValueOnce(undefined);
    vi.mocked(assetsApi.confirmBrandAssetUpload).mockResolvedValueOnce(mockAsset);

    const { result } = renderHook(() => useAssetUpload());
    const file = makeFile('logo.png');

    await act(async () => {
      await result.current.upload(file, { type: 'brand', brandSystemId: 'brand-1', kind: 'logo' });
    });

    await waitFor(() => expect(result.current.status).toBe('succeeded'));
    expect(result.current.asset).toEqual(mockAsset);

    expect(assetsApi.createBrandAssetUploadIntent).toHaveBeenCalledWith('brand-1', {
      fileName: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'logo',
    });
    expect(assetsApi.confirmBrandAssetUpload).toHaveBeenCalledWith('brand-1', 'asset-1', {
      expectedSizeBytes: 1024,
      expectedContentType: 'image/png',
    });
  });

  it('R2 failure does not call confirm', async () => {
    vi.mocked(assetsApi.createProjectAssetUploadIntent).mockResolvedValueOnce(mockIntent);
    vi.mocked(uploadHelper.uploadFileToSignedUrl).mockRejectedValueOnce(
      new Error('Network error during upload'),
    );

    const { result } = renderHook(() => useAssetUpload());
    const file = makeFile();

    await act(async () => {
      await result.current.upload(file, { type: 'project', projectId: 'proj-1', kind: 'upload' });
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain('Network error during upload');
    expect(assetsApi.confirmProjectAssetUpload).not.toHaveBeenCalled();
  });

  it('confirm failure returns failed state', async () => {
    vi.mocked(assetsApi.createProjectAssetUploadIntent).mockResolvedValueOnce(mockIntent);
    vi.mocked(uploadHelper.uploadFileToSignedUrl).mockResolvedValueOnce(undefined);
    vi.mocked(assetsApi.confirmProjectAssetUpload).mockRejectedValueOnce(
      new ApiClientError('VALIDATION', 'Upload not found in storage'),
    );

    const { result } = renderHook(() => useAssetUpload());
    const file = makeFile();

    await act(async () => {
      await result.current.upload(file, { type: 'project', projectId: 'proj-1', kind: 'upload' });
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain('Upload not found in storage');
    expect(result.current.asset).toBeNull();
  });

  it('reset clears state', async () => {
    vi.mocked(assetsApi.createProjectAssetUploadIntent).mockResolvedValueOnce(mockIntent);
    vi.mocked(uploadHelper.uploadFileToSignedUrl).mockResolvedValueOnce(undefined);
    vi.mocked(assetsApi.confirmProjectAssetUpload).mockResolvedValueOnce(mockAsset);

    const { result } = renderHook(() => useAssetUpload());
    const file = makeFile();

    await act(async () => {
      await result.current.upload(file, { type: 'project', projectId: 'proj-1', kind: 'upload' });
    });

    await waitFor(() => expect(result.current.status).toBe('succeeded'));

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.asset).toBeNull();
  });
});
