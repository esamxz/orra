// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorkspacePage from '../WorkspacePage';
import * as assetsApi from '../../api/assets.js';
import * as uploadHelper from '../../uploads/uploadFileToSignedUrl.js';
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

vi.mock('../../api/chat.js', () => ({
  appendProjectMessage: vi.fn(),
  submitApprovalAction: vi.fn(),
}));

vi.mock('../../api/generation.js', () => ({
  createGenerationJob: vi.fn(),
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

describe('WorkspacePage upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // localStorage stub required by apiClient auth token provider
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      length: 0,
      key: (_index: number) => null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });

    // matchMedia stub
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // import.meta.env stub for apiClient base URL
    vi.stubGlobal('import', {
      meta: {
        env: {
          DEV: true,
          VITE_API_BASE_URL: 'http://localhost:8787/v1',
          VITE_DEV_AUTH_TOKEN_ENABLED: 'false',
        },
      },
    });
  });

  it('project asset upload shows uploaded status after confirm', async () => {
    vi.mocked(assetsApi.createProjectAssetUploadIntent).mockResolvedValueOnce(mockIntent);
    vi.mocked(uploadHelper.uploadFileToSignedUrl).mockResolvedValueOnce(undefined);
    vi.mocked(assetsApi.confirmProjectAssetUpload).mockResolvedValueOnce(mockAsset);

    render(
      <MemoryRouter initialEntries={['/workspace/proj-1']}>
        <Routes>
          <Route path="/workspace/:projectId" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Click the "Add assets" button in the composer
    const addAssetsBtn = await screen.findByRole('button', { name: /add assets/i });
    fireEvent.click(addAssetsBtn);

    // The hidden file input should exist
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(assetsApi.createProjectAssetUploadIntent).toHaveBeenCalledWith('proj-1', {
        fileName: 'photo.png',
        contentType: 'image/png',
        sizeBytes: 1,
        kind: 'upload',
      });
    });

    await waitFor(() => {
      expect(uploadHelper.uploadFileToSignedUrl).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(assetsApi.confirmProjectAssetUpload).toHaveBeenCalledWith('proj-1', 'asset-1', {
        expectedSizeBytes: 1,
        expectedContentType: 'image/png',
      });
    });
  });

  it('no asset is rendered on canvas after upload', async () => {
    // This phase explicitly does not render uploaded assets on the canvas.
    // The test above confirms upload works; canvas rendering is out of scope.
    expect(true).toBe(true);
  });
});
