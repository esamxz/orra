// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useArtifactLoader } from '../useArtifactLoader';
import * as artifactsApi from '../../api/artifacts.js';
import { ApiClientError } from '../../api/errors.js';

// Mock the navigate hook from react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock the artifacts API
vi.mock('../../api/artifacts.js');

describe('useArtifactLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validDocument = {
    schemaVersion: 1,
    artifactId: '00000000-0000-0000-0000-000000000001',
    type: 'post' as const,
    ratio: { name: '4:5' as const, w: 1080, h: 1350 },
    cards: [
      {
        id: '00000000-0000-0000-0000-000000000002',
        index: 0,
        baseColor: '#1d2a30',
        layers: [
          {
            id: '00000000-0000-0000-0000-000000000003',
            type: 'background' as const,
            z: 0,
            x: 0,
            y: 0,
            w: 1080,
            h: 1350,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            assetId: '00000000-0000-0000-0000-000000000004',
            fit: 'cover' as const,
          },
        ],
      },
    ],
    version: 1,
  };

  it('initial state is idle with no document', () => {
    const { result } = renderHook(() => useArtifactLoader());
    expect(result.current.state).toBe('idle');
    expect(result.current.artifactId).toBeNull();
    expect(result.current.document).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('loads and hydrates a valid artifact document', async () => {
    vi.mocked(artifactsApi.getArtifact).mockResolvedValueOnce({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-1',
      version: 1,
      document: validDocument,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const onLoaded = vi.fn();
    const { result } = renderHook(() => useArtifactLoader(onLoaded));

    result.current.load('art-1');

    await waitFor(() => expect(result.current.document).toEqual(validDocument));
    expect(result.current.state).toBe('idle');
    expect(result.current.artifactId).toBe('art-1');
    expect(onLoaded).toHaveBeenCalledWith(validDocument);
  });

  it('produces error state for invalid document', async () => {
    vi.mocked(artifactsApi.getArtifact).mockRejectedValueOnce(
      new ApiClientError('VALIDATION', 'Invalid document'),
    );

    const { result } = renderHook(() => useArtifactLoader());

    result.current.load('art-1');

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.document).toBeNull();
    expect(result.current.error).toContain('corrupted');
  });

  it('produces not_found state for missing artifact', async () => {
    vi.mocked(artifactsApi.getArtifact).mockRejectedValueOnce(
      new ApiClientError('NOT_FOUND', 'Artifact not found'),
    );

    const { result } = renderHook(() => useArtifactLoader());

    result.current.load('art-1');

    await waitFor(() => expect(result.current.state).toBe('not_found'));
    expect(result.current.document).toBeNull();
    expect(result.current.error).toContain('no longer exists');
  });

  it('clear resets state to idle', async () => {
    vi.mocked(artifactsApi.getArtifact).mockResolvedValueOnce({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-1',
      version: 1,
      document: validDocument,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const { result } = renderHook(() => useArtifactLoader());

    result.current.load('art-1');
    await waitFor(() => expect(result.current.document).not.toBeNull());

    result.current.clear();
    await waitFor(() => expect(result.current.document).toBeNull());

    expect(result.current.state).toBe('idle');
    expect(result.current.artifactId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('ignores stale load results if a newer load was started', async () => {
    const doc1 = { ...validDocument, artifactId: 'art-1' };
    const doc2 = { ...validDocument, artifactId: 'art-2' };

    vi.mocked(artifactsApi.getArtifact)
      .mockResolvedValueOnce({
        artifactId: 'art-1',
        projectId: 'proj-1',
        currentVersionId: 'ver-1',
        version: 1,
        document: doc1,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      })
      .mockResolvedValueOnce({
        artifactId: 'art-2',
        projectId: 'proj-1',
        currentVersionId: 'ver-2',
        version: 1,
        document: doc2,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      });

    const { result } = renderHook(() => useArtifactLoader());

    result.current.load('art-1');
    result.current.load('art-2');

    await waitFor(() => expect(result.current.document?.artifactId).toBe('art-2'));
  });
});
