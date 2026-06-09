import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createProjectAssetUploadIntent,
  confirmProjectAssetUpload,
  createBrandAssetUploadIntent,
  confirmBrandAssetUpload,
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
});
