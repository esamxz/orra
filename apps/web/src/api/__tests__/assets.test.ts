import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createProjectAssetUploadIntent,
  confirmProjectAssetUpload,
  createBrandAssetUploadIntent,
  confirmBrandAssetUpload,
  listProjectAssets,
  listBrandAssets,
  getProjectAssetPreviewUrl,
  getBrandAssetPreviewUrl,
} from '../assets.js';
import { apiClient } from '../client.js';
import { ApiClientError } from '../errors.js';

describe('assets API', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'request').mockImplementation(async () => ({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createProjectAssetUploadIntent calls correct endpoint', async () => {
    const input = {
      fileName: 'photo.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    };
    await createProjectAssetUploadIntent('proj-1', input);
    expect(apiClient.request).toHaveBeenCalledWith('/projects/proj-1/assets/upload-intent', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('confirmProjectAssetUpload calls correct endpoint', async () => {
    await confirmProjectAssetUpload('proj-1', 'asset-1', { expectedSizeBytes: 1024 });
    expect(apiClient.request).toHaveBeenCalledWith('/projects/proj-1/assets/asset-1/confirm', {
      method: 'POST',
      body: JSON.stringify({ expectedSizeBytes: 1024 }),
    });
  });

  it('confirmProjectAssetUpload works without optional input', async () => {
    await confirmProjectAssetUpload('proj-1', 'asset-1');
    expect(apiClient.request).toHaveBeenCalledWith('/projects/proj-1/assets/asset-1/confirm', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  });

  it('createBrandAssetUploadIntent calls correct endpoint', async () => {
    const input = {
      fileName: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 2048,
      kind: 'logo',
    };
    await createBrandAssetUploadIntent('brand-1', input);
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems/brand-1/assets/upload-intent', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('confirmBrandAssetUpload calls correct endpoint', async () => {
    await confirmBrandAssetUpload('brand-1', 'asset-1', { expectedContentType: 'image/png' });
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems/brand-1/assets/asset-1/confirm', {
      method: 'POST',
      body: JSON.stringify({ expectedContentType: 'image/png' }),
    });
  });

  it('errors map to ApiClientError', async () => {
    const error = new ApiClientError('NOT_FOUND', 'Asset not found');
    vi.spyOn(apiClient, 'request').mockRejectedValue(error);

    await expect(createProjectAssetUploadIntent('proj-1', {
      fileName: 'x.png',
      contentType: 'image/png',
      sizeBytes: 1,
      kind: 'upload',
    })).rejects.toThrow(ApiClientError);
    await expect(createProjectAssetUploadIntent('proj-1', {
      fileName: 'x.png',
      contentType: 'image/png',
      sizeBytes: 1,
      kind: 'upload',
    })).rejects.toThrow('Asset not found');
  });

  it('listProjectAssets calls correct endpoint', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValueOnce([
      { id: 'a1', kind: 'upload', fileName: 'hero.png' },
      { id: 'a2', kind: 'reference', fileName: 'ref.jpg' },
    ]);

    const result = await listProjectAssets('proj-1');
    expect(apiClient.request).toHaveBeenCalledWith('/projects/proj-1/assets', {
      method: 'GET',
    });
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe('upload');
  });

  it('listBrandAssets calls correct endpoint', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValueOnce([
      { id: 'b1', kind: 'logo', fileName: 'logo.png' },
    ]);

    const result = await listBrandAssets('brand-1');
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems/brand-1/assets', {
      method: 'GET',
    });
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('logo');
  });

  it('getProjectAssetPreviewUrl calls correct endpoint', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValueOnce({
      asset: { id: 'a1', status: 'uploaded' },
      preview: { method: 'GET', url: 'https://fake-r2.orra.local/read?key=abc', expiresAt: '2026-01-01T00:05:00Z' },
    });

    const result = await getProjectAssetPreviewUrl('proj-1', 'a1');
    expect(apiClient.request).toHaveBeenCalledWith('/projects/proj-1/assets/a1/preview-url', {
      method: 'GET',
    });
    expect(result.preview.method).toBe('GET');
    expect(result.preview.url).toContain('fake-r2.orra.local');
  });

  it('getBrandAssetPreviewUrl calls correct endpoint', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValueOnce({
      asset: { id: 'b1', status: 'uploaded' },
      preview: { method: 'GET', url: 'https://fake-r2.orra.local/read?key=logo', expiresAt: '2026-01-01T00:05:00Z' },
    });

    const result = await getBrandAssetPreviewUrl('brand-1', 'b1');
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems/brand-1/assets/b1/preview-url', {
      method: 'GET',
    });
    expect(result.preview.method).toBe('GET');
  });
});
