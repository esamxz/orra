// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useBrandSystems } from '../useBrandSystems';
import * as brandApi from '../../api/brandSystems.js';
import { ApiClientError } from '../../api/errors.js';
import type { BrandSystemDto } from '../../api/types.js';

vi.mock('../../api/brandSystems.js', () => ({
  listBrandSystems: vi.fn(),
  createBrandSystem: vi.fn(),
  updateBrandSystem: vi.fn(),
  deleteBrandSystem: vi.fn(),
}));

const mockBrand: BrandSystemDto = {
  id: 'brand-1',
  workspaceId: 'ws-1',
  name: 'Serene Studio',
  description: 'Calm wellness brand',
  tone: 'Calm, reassuring',
  visualDirection: 'Soft natural light',
  rules: null,
  colors: { primary: '#1d2a30', secondary: '#5e7680' },
  typography: { preset: 'editorial-calm', titleFont: 'Newsreader' },
  logoAssetId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('useBrandSystems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state is loading', () => {
    const { result } = renderHook(() => useBrandSystems());
    expect(result.current.brands).toEqual([]);
    expect(result.current.state).toBe('loading');
    expect(result.current.error).toBeNull();
  });

  it('loads brands successfully', async () => {
    vi.mocked(brandApi.listBrandSystems).mockResolvedValueOnce([mockBrand]);

    const { result } = renderHook(() => useBrandSystems());

    await waitFor(() => expect(result.current.state).toBe('idle'));
    expect(result.current.brands).toHaveLength(1);
    expect(result.current.brands[0].name).toBe('Serene Studio');
    expect(result.current.error).toBeNull();
  });

  it('handles empty state', async () => {
    vi.mocked(brandApi.listBrandSystems).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useBrandSystems());

    await waitFor(() => expect(result.current.state).toBe('empty'));
    expect(result.current.brands).toEqual([]);
  });

  it('handles API error', async () => {
    vi.mocked(brandApi.listBrandSystems).mockRejectedValueOnce(
      new ApiClientError('NETWORK_ERROR', 'Unable to reach the server'),
    );

    const { result } = renderHook(() => useBrandSystems());

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.brands).toEqual([]);
    expect(result.current.error).toBe('Unable to reach the server');
  });

  it('reload refreshes brand list', async () => {
    vi.mocked(brandApi.listBrandSystems)
      .mockResolvedValueOnce([mockBrand])
      .mockResolvedValueOnce([{ ...mockBrand, name: 'Updated Brand' }]);

    const { result } = renderHook(() => useBrandSystems());

    await waitFor(() => expect(result.current.brands[0].name).toBe('Serene Studio'));

    act(() => { result.current.reload(); });

    await waitFor(() => expect(result.current.brands[0].name).toBe('Updated Brand'));
  });

  it('createBrand adds new brand optimistically', async () => {
    vi.mocked(brandApi.listBrandSystems).mockResolvedValueOnce([]);
    vi.mocked(brandApi.createBrandSystem).mockResolvedValueOnce(mockBrand);

    const { result } = renderHook(() => useBrandSystems());

    await waitFor(() => expect(result.current.state).toBe('empty'));

    const created = await act(async () => result.current.createBrand({
      name: 'Serene Studio',
      tone: 'Calm',
    }));

    expect(created).not.toBeNull();
    expect(result.current.brands).toHaveLength(1);
    expect(result.current.brands[0].name).toBe('Serene Studio');
    expect(result.current.state).toBe('idle');
  });

  it('createBrand returns null on error', async () => {
    vi.mocked(brandApi.listBrandSystems).mockResolvedValueOnce([]);
    vi.mocked(brandApi.createBrandSystem).mockRejectedValueOnce(
      new ApiClientError('VALIDATION', 'Name is required'),
    );

    const { result } = renderHook(() => useBrandSystems());

    await waitFor(() => expect(result.current.state).toBe('empty'));

    const created = await act(async () => result.current.createBrand({ name: '' }));

    expect(created).toBeNull();
    expect(result.current.error).toBe('Name is required');
  });

  it('deleteBrand removes brand from list', async () => {
    vi.mocked(brandApi.listBrandSystems).mockResolvedValueOnce([mockBrand]);
    vi.mocked(brandApi.deleteBrandSystem).mockResolvedValueOnce({ deleted: true });

    const { result } = renderHook(() => useBrandSystems());

    await waitFor(() => expect(result.current.brands).toHaveLength(1));

    const ok = await act(async () => result.current.deleteBrand('brand-1'));

    expect(ok).toBe(true);
    expect(result.current.brands).toHaveLength(0);
    expect(result.current.state).toBe('empty');
  });

  it('deleteBrand returns false on error', async () => {
    vi.mocked(brandApi.listBrandSystems).mockResolvedValueOnce([mockBrand]);
    vi.mocked(brandApi.deleteBrandSystem).mockRejectedValueOnce(
      new ApiClientError('NOT_FOUND', 'Brand not found'),
    );

    const { result } = renderHook(() => useBrandSystems());

    await waitFor(() => expect(result.current.brands).toHaveLength(1));

    const ok = await act(async () => result.current.deleteBrand('brand-1'));

    expect(ok).toBe(false);
    expect(result.current.brands).toHaveLength(1);
    expect(result.current.error).toBe('Brand not found');
  });
});
