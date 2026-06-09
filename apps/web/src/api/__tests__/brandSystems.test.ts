import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listBrandSystems,
  createBrandSystem,
  getBrandSystem,
  updateBrandSystem,
  deleteBrandSystem,
} from '../brandSystems.js';
import { apiClient } from '../client.js';
import { ApiClientError } from '../errors.js';

describe('brandSystems API', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'request').mockImplementation(async () => ({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listBrandSystems calls GET /brand-systems without params', async () => {
    await listBrandSystems();
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems');
  });

  it('listBrandSystems passes limit and search query params', async () => {
    await listBrandSystems({ limit: 10, search: 'serene' });
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems?limit=10&search=serene');
  });

  it('createBrandSystem sends correct body', async () => {
    const input = {
      name: 'Serene Studio',
      tone: 'Calm',
      colors: { primary: '#1d2a30', secondary: '#5e7680' },
      typography: { preset: 'editorial-calm', titleFont: 'Newsreader' },
    };
    await createBrandSystem(input);
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('getBrandSystem calls correct endpoint', async () => {
    await getBrandSystem('brand-123');
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems/brand-123');
  });

  it('updateBrandSystem sends PATCH with correct body', async () => {
    const input = { name: 'Updated Brand', tone: 'Bold' };
    await updateBrandSystem('brand-123', input);
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems/brand-123', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  });

  it('deleteBrandSystem sends DELETE', async () => {
    await deleteBrandSystem('brand-123');
    expect(apiClient.request).toHaveBeenCalledWith('/brand-systems/brand-123', {
      method: 'DELETE',
    });
  });

  it('errors map to ApiClientError', async () => {
    const error = new ApiClientError('NOT_FOUND', 'Brand system not found');
    vi.spyOn(apiClient, 'request').mockRejectedValue(error);

    await expect(listBrandSystems()).rejects.toThrow(ApiClientError);
    await expect(listBrandSystems()).rejects.toThrow('Brand system not found');
  });
});
