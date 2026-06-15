// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WorkspacePage from '../WorkspacePage';
import * as projectsApi from '../../api/projects';
import * as artifactsApi from '../../api/artifacts';
import * as useProjectMessagesModule from '../../hooks/useProjectMessages';

const mockParams: { projectId?: string } = {};
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockParams,
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggle: vi.fn() }),
}));

vi.mock('../../hooks/useWorkspaceStore', () => ({
  useWorkspaceStore: (selector: (s: unknown) => unknown) => {
    const state = {
      activeCardIndex: 0,
      selectedLayerId: null,
      selectedLayerType: null,
      isCardByCardMode: false,
      setActiveCard: vi.fn(),
      selectLayer: vi.fn(),
      clearSelection: vi.fn(),
      syncSelectionWithCard: vi.fn(),
      setCardByCardMode: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../../components/workspace/KonvaStage', () => ({
  default: () => <div data-testid="konva-stage">KonvaStage</div>,
}));

vi.mock('../../components/workspace/MiniArtifactPreview', () => ({
  default: () => null,
}));

vi.mock('../../components/workspace/ApprovalCard', () => ({
  default: () => null,
}));

vi.mock('../../components/workspace/Inspector', () => ({
  default: () => null,
}));

vi.mock('../../components/workspace/ExportMenu', () => ({
  default: () => null,
}));

vi.mock('../../components/workspace/VersionHistoryPopover', () => ({
  default: () => null,
}));

vi.mock('../../components/workspace/UsageStatus', () => ({
  default: () => null,
}));

vi.mock('../../components/workspace/TextEditOverlay', () => ({
  default: () => null,
}));

vi.mock('../../hooks/useProjectMessages', () => ({
  useProjectMessages: vi.fn(),
}));

vi.mock('../../hooks/useProjectAssets', () => ({
  useProjectAssets: vi.fn(() => ({
    assets: [],
    state: 'idle',
    error: null,
    previewUrls: {},
    reload: vi.fn(),
    getPreviewUrl: vi.fn(),
  })),
}));

vi.mock('../../api/projects', async () => {
  const actual = await vi.importActual('../../api/projects');
  return {
    ...actual,
    getProject: vi.fn(),
    updateProject: vi.fn(),
  };
});

vi.mock('../../api/artifacts', async () => {
  const actual = await vi.importActual('../../api/artifacts');
  return {
    ...actual,
    getArtifact: vi.fn(),
  };
});

function makeArtifactDocument(type: 'post' | 'carousel' = 'post'): import('@orra/shared').ArtifactDocument {
  return {
    schemaVersion: 1,
    artifactId: '11111111-1111-1111-1111-111111111111',
    type,
    ratio: { name: '4:5' as const, w: 1080, h: 1350 },
    cards: type === 'carousel'
      ? [
          { id: 'card-1', index: 0, baseColor: '#1d2a30', layers: [] },
          { id: 'card-2', index: 1, baseColor: '#354e53', layers: [] },
        ]
      : [
          {
            id: 'card-1',
            index: 0,
            baseColor: '#1d2a30',
            layers: [
              {
                id: 'layer-bg-1',
                type: 'background',
                z: -1,
                x: 0,
                y: 0,
                w: 1080,
                h: 1350,
                rotation: 0,
                opacity: 1,
                locked: false,
                hidden: false,
                assetId: 'asset-bg-1',
                fit: 'cover',
              },
            ],
          },
        ],
    version: 2,
  };
}

describe('WorkspacePage reopen hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams.projectId = undefined;
  });

  function renderPage(projectId?: string, state?: Record<string, unknown>) {
    mockParams.projectId = projectId;
    return render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: projectId ? `/workspace/${projectId}` : '/workspace',
            ...(state ? { state } : {}),
          },
        ]}
      >
        <Routes>
          <Route path="/workspace/:projectId?" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function mockMessages(msgs: unknown[]) {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: msgs as never,
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });
  }

  it('fetches project and artifact when opened without router state', async () => {
    mockMessages([]);

    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: 'proj-1',
      name: 'Reopen test',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      brandSystemId: null,
      sourceTemplateId: null,
      currentArtifactId: 'art-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    vi.mocked(artifactsApi.getArtifact).mockResolvedValue({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-2',
      version: 2,
      document: makeArtifactDocument('post'),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    renderPage('proj-1');

    await waitFor(() => {
      expect(projectsApi.getProject).toHaveBeenCalledWith('proj-1');
    });

    await waitFor(() => {
      expect(artifactsApi.getArtifact).toHaveBeenCalledWith('art-1');
    });
  });

  it('does not show empty canvas state when artifact has cards', async () => {
    mockMessages([]);

    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: 'proj-1',
      name: 'Reopen test',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      brandSystemId: null,
      sourceTemplateId: null,
      currentArtifactId: 'art-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    vi.mocked(artifactsApi.getArtifact).mockResolvedValue({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-2',
      version: 2,
      document: makeArtifactDocument('post'),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    renderPage('proj-1');

    await waitFor(() => {
      expect(screen.queryByText(/A quiet canvas, ready/i)).toBeNull();
    });
  });

  it('shows carousel rail for carousel projects on reopen', async () => {
    mockMessages([]);

    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: 'proj-1',
      name: 'Reopen carousel',
      type: 'carousel',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      brandSystemId: null,
      sourceTemplateId: null,
      currentArtifactId: 'art-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    vi.mocked(artifactsApi.getArtifact).mockResolvedValue({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-2',
      version: 2,
      document: makeArtifactDocument('carousel'),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    renderPage('proj-1');

    await waitFor(() => {
      expect(screen.getByText(/2 cards/i)).not.toBeNull();
    });
  });

  it('sets activeCardIndex to first card after artifact hydrates', async () => {
    mockMessages([]);

    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: 'proj-1',
      name: 'Reopen carousel',
      type: 'carousel',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      brandSystemId: null,
      sourceTemplateId: null,
      currentArtifactId: 'art-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    vi.mocked(artifactsApi.getArtifact).mockResolvedValue({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-2',
      version: 2,
      document: makeArtifactDocument('carousel'),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    renderPage('proj-1');

    // Canvas caption proves activeCardIndex defaults to the first card.
    await waitFor(() => {
      expect(screen.getByText(/Card 1 of 2/i)).not.toBeNull();
    });
  });
});
