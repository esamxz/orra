// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTrendTemplates } from '../useTrendTemplates';
import * as trendTemplatesApi from '../../api/trendTemplates.js';
import { ApiClientError } from '../../api/errors.js';
import type { TrendTemplateDto } from '../../api/types.js';

vi.mock('../../api/trendTemplates.js', () => ({
  listTrendTemplates: vi.fn(),
}));

function makeTemplate(overrides: Partial<TrendTemplateDto> = {}): TrendTemplateDto {
  return {
    id: 'tmpl-1',
    title: 'Test Template',
    description: 'A test template',
    prompt: 'Create something calm.',
    category: 'Wellness',
    projectType: 'post',
    ratioHint: '4:5',
    platformHint: 'Instagram',
    assetHints: [],
    previewVariant: 'cover',
    isFeatured: true,
    tags: ['calm'],
    sortIndex: 1,
    referenceR2Key: null,
    previewUrl: null,
    ...overrides,
  };
}

describe('useTrendTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty data and not loading when disabled', () => {
    const { result } = renderHook(() => useTrendTemplates(false));
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not fetch when enabled=false', async () => {
    renderHook(() => useTrendTemplates(false));
    await new Promise((r) => setTimeout(r, 10));
    expect(vi.mocked(trendTemplatesApi.listTrendTemplates)).not.toHaveBeenCalled();
  });

  it('loads templates successfully', async () => {
    const templates = [makeTemplate()];
    vi.mocked(trendTemplatesApi.listTrendTemplates).mockResolvedValueOnce(templates);

    const { result } = renderHook(() => useTrendTemplates(true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(templates);
    expect(result.current.error).toBeNull();
  });

  it('derives featured from isFeatured=true templates', async () => {
    const templates = [
      makeTemplate({ id: 'a', isFeatured: true }),
      makeTemplate({ id: 'b', isFeatured: false }),
    ];
    vi.mocked(trendTemplatesApi.listTrendTemplates).mockResolvedValueOnce(templates);

    const { result } = renderHook(() => useTrendTemplates(true));
    await waitFor(() => expect(result.current.data.length).toBe(2));

    expect(result.current.featured).toHaveLength(1);
    expect(result.current.featured[0].id).toBe('a');
  });

  it('derives sorted unique categories from templates', async () => {
    const templates = [
      makeTemplate({ category: 'Wellness' }),
      makeTemplate({ id: 'b', category: 'Quote' }),
      makeTemplate({ id: 'c', category: 'Wellness' }),
    ];
    vi.mocked(trendTemplatesApi.listTrendTemplates).mockResolvedValueOnce(templates);

    const { result } = renderHook(() => useTrendTemplates(true));
    await waitFor(() => expect(result.current.data.length).toBe(3));

    expect(result.current.categories).toEqual(['Quote', 'Wellness']);
  });

  it('handles network error', async () => {
    vi.mocked(trendTemplatesApi.listTrendTemplates).mockRejectedValueOnce(
      new Error('net::ERR_FAILED')
    );

    const { result } = renderHook(() => useTrendTemplates(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe('Failed to load templates');
  });

  it('handles UNAUTHENTICATED error silently', async () => {
    vi.mocked(trendTemplatesApi.listTrendTemplates).mockRejectedValueOnce(
      new ApiClientError('UNAUTHENTICATED', 'Not authenticated')
    );

    const { result } = renderHook(() => useTrendTemplates(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('reload re-fetches templates', async () => {
    const first = [makeTemplate({ title: 'First' })];
    const second = [makeTemplate({ title: 'Second' })];
    vi.mocked(trendTemplatesApi.listTrendTemplates)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const { result } = renderHook(() => useTrendTemplates(true));
    await waitFor(() => expect(result.current.data[0]?.title).toBe('First'));

    act(() => { result.current.reload(); });
    await waitFor(() => expect(result.current.data[0]?.title).toBe('Second'));
  });

  it('fetches when enabled changes from false to true', async () => {
    vi.mocked(trendTemplatesApi.listTrendTemplates).mockResolvedValueOnce([makeTemplate()]);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useTrendTemplates(enabled),
      { initialProps: { enabled: false } }
    );

    expect(result.current.data).toEqual([]);
    expect(vi.mocked(trendTemplatesApi.listTrendTemplates)).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data.length).toBe(1));
    expect(vi.mocked(trendTemplatesApi.listTrendTemplates)).toHaveBeenCalledTimes(1);
  });
});
