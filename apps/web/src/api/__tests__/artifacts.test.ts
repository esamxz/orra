import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getArtifact, applyArtifactAction } from '../artifacts.js';
import * as clientModule from '../client.js';
import { ApiClientError } from '../errors.js';

describe('artifacts API', () => {
  beforeEach(() => {
    vi.spyOn(clientModule.apiClient, 'request').mockImplementation(async () => ({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getArtifact calls correct endpoint', async () => {
    const doc = makeValidDocument();
    vi.spyOn(clientModule.apiClient, 'request').mockResolvedValueOnce({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-1',
      version: 1,
      document: doc,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const result = await getArtifact('art-1');
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/artifacts/art-1');
    expect(result.artifactId).toBe('art-1');
    expect(result.document.schemaVersion).toBe(doc.schemaVersion);
  });

  it('getArtifact validates ArtifactDocument and rejects invalid document', async () => {
    vi.spyOn(clientModule.apiClient, 'request').mockResolvedValueOnce({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-1',
      version: 1,
      document: { invalid: true },
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    await expect(getArtifact('art-1')).rejects.toBeInstanceOf(ApiClientError);
    try {
      await getArtifact('art-1');
    } catch (err) {
      expect((err as ApiClientError).code).toBe('VALIDATION');
    }
  });

  it('applyArtifactAction sends correct body', async () => {
    const input = { baseVersion: 3, action: { type: 'setTextContent', cardId: 'c1', layerId: 'l1', content: 'Hello' } };
    await applyArtifactAction('art-1', input);
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/artifacts/art-1/actions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('VERSION_CONFLICT maps to ApiClientError code VERSION_CONFLICT', async () => {
    vi.spyOn(clientModule.apiClient, 'request').mockRejectedValueOnce(
      new ApiClientError('VERSION_CONFLICT', 'Document was modified elsewhere.'),
    );

    await expect(
      applyArtifactAction('art-1', { baseVersion: 2, action: { type: 'setTextContent', cardId: 'c1', layerId: 'l1', content: 'Hello' } }),
    ).rejects.toBeInstanceOf(ApiClientError);

    try {
      await applyArtifactAction('art-1', { baseVersion: 2, action: { type: 'setTextContent', cardId: 'c1', layerId: 'l1', content: 'Hello' } });
    } catch (err) {
      expect((err as ApiClientError).code).toBe('VERSION_CONFLICT');
    }
  });
});

function makeValidDocument() {
  return {
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
}
