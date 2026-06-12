// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WorkspacePage from '../WorkspacePage';
import * as chatApi from '../../api/chat';
import * as useProjectMessagesModule from '../../hooks/useProjectMessages';
import * as useProjectAssetsModule from '../../hooks/useProjectAssets';
import type { ArtifactDocument } from '@orra/shared';

// ---------------------------------------------------------------------------
// Router params mock
// ---------------------------------------------------------------------------

const mockParams: { projectId?: string } = {};
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockParams,
  };
});

// ---------------------------------------------------------------------------
// Core hook mocks shared with existing WorkspacePage tests
// ---------------------------------------------------------------------------

const mockReset = vi.fn();
const mockDispatch = vi.fn(() => true);
const mockUndo = vi.fn();
const mockRedo = vi.fn();

vi.mock('../../hooks/usePersistedActionDispatch', () => ({
  usePersistedActionDispatch: () => ({
    artifact: {
      schemaVersion: 1,
      artifactId: 'art-1',
      type: 'post' as const,
      ratio: { name: '4:5' as const, w: 1080, h: 1350 },
      cards: [
        {
          id: 'card-1',
          index: 0,
          baseColor: '#1d2a30',
          layers: [],
        },
      ],
      version: 1,
    },
    dispatch: mockDispatch,
    undo: mockUndo,
    redo: mockRedo,
    reset: mockReset,
    canUndo: false,
    canRedo: false,
    saveStatus: 'saved' as const,
  }),
}));

vi.mock('../../hooks/useArtifactLoader', () => ({
  useArtifactLoader: () => ({
    artifactId: null,
    document: null,
    state: 'idle' as const,
    error: null,
    load: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggle: vi.fn() }),
}));

vi.mock('../../hooks/useWorkspaceStore', () => ({
  useWorkspaceStore: (selector: (s: unknown) => unknown) => {
    const state = {
      activeCardIndex: 0,
      selectedLayerId: null,
      selectedLayerType: null,
      setActiveCard: vi.fn(),
      selectLayer: vi.fn(),
      clearSelection: vi.fn(),
      syncSelectionWithCard: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../../hooks/useGenerationJobPolling', () => ({
  useGenerationJobPolling: () => ({
    job: null,
    artifact: null,
    artifactError: null,
    state: 'idle',
  }),
}));

vi.mock('../../hooks/useCreditStatus', () => ({
  useCreditStatus: () => ({
    data: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('../../hooks/useBrandSystems', () => ({
  useBrandSystems: () => ({
    brands: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('../../hooks/useAssetUpload', () => ({
  useAssetUpload: () => ({
    upload: vi.fn(),
    uploading: false,
    error: null,
  }),
}));

vi.mock('../../hooks/useAssetPreviewUrls', () => ({
  useAssetPreviewUrls: () => ({
    urls: {},
    getUrl: vi.fn(),
  }),
}));

vi.mock('../../hooks/useProjectMemory', () => ({
  useProjectMemory: () => ({
    memory: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Component mocks
// ---------------------------------------------------------------------------

vi.mock('../../components/workspace/KonvaStage', () => ({ default: () => null }));
vi.mock('../../components/workspace/MiniArtifactPreview', () => ({ default: () => null }));
vi.mock('../../components/workspace/Inspector', () => ({ default: () => null }));
vi.mock('../../components/workspace/ExportMenu', () => ({ default: () => null }));
vi.mock('../../components/workspace/VersionHistoryPopover', () => ({ default: () => null }));
vi.mock('../../components/workspace/UsageStatus', () => ({ default: () => null }));
vi.mock('../../components/workspace/TextEditOverlay', () => ({ default: () => null }));
vi.mock('../../components/workspace/ProjectMemoryPanel', () => ({ default: () => null }));
vi.mock('../../components/workspace/CarouselRail', () => ({ default: () => null }));

vi.mock('../../components/workspace/ApprovalCard', () => ({
  default: ({ onApprove }: { onApprove: () => void }) => (
    <div data-testid="approval-card">
      <button onClick={onApprove}>Approve</button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// API mocks
// ---------------------------------------------------------------------------

vi.mock('../../api/chat');
vi.mock('../../api/generation', () => ({
  createGenerationJob: vi.fn(),
}));
vi.mock('../../api/projects', () => ({
  updateProject: vi.fn(),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(projectId = 'proj-w7') {
  mockParams.projectId = projectId;
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/workspace/${projectId}` }]}
    >
      <Routes>
        <Route path="/workspace/:projectId?" element={<WorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function getTextarea(): HTMLTextAreaElement {
  const all = screen.getAllByPlaceholderText(/Direct Orra/);
  return all[0] as HTMLTextAreaElement;
}

const EDIT_DOCUMENT: ArtifactDocument = {
  schemaVersion: 1,
  artifactId: 'art-edit-1',
  type: 'post',
  ratio: { name: '4:5', w: 1080, h: 1350 },
  version: 2,
  cards: [
    {
      id: 'card-edit-1',
      index: 0,
      baseColor: '#354e53',
      layers: [
        {
          id: 'layer-edit-1',
          type: 'text',
          z: 0,
          x: 80,
          y: 200,
          w: 920,
          h: 200,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          content: 'Build better habits',
          fontFamily: 'Inter',
          fontSize: 48,
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: -0.5,
          color: '#f1f4f4',
          align: 'center',
          role: 'title',
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// W7: Chat-directed editing frontend tests
// ---------------------------------------------------------------------------

describe('WorkspacePage — W7 chat-directed editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue(true);
    mockParams.projectId = undefined;

    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    vi.mocked(useProjectAssetsModule.useProjectAssets).mockReturnValue({
      assets: [],
      state: 'idle',
      error: null,
      previewUrls: {},
      reload: vi.fn(),
      getPreviewUrl: vi.fn(),
    } as never);
  });

  it('calls reset() with editResult.document when API returns editResult', async () => {
    vi.mocked(chatApi.appendProjectMessage).mockResolvedValueOnce({
      message: {
        id: 'msg-user',
        projectId: 'proj-w7',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'change title to Build better habits',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      intent: { mode: 'edit', confidence: 'high', reason: 'edit pattern matched' },
      approvalMessage: {
        id: 'msg-confirm',
        projectId: 'proj-w7',
        threadId: 'thread-1',
        role: 'assistant',
        kind: 'text',
        content: 'Done — I updated the title.',
        metadata: {},
        seq: 2,
        createdAt: '2026-01-01T00:00:00Z',
      },
      editResult: {
        document: EDIT_DOCUMENT,
        version: 2,
        artifactId: 'art-edit-1',
      },
    });

    renderPage('proj-w7');

    const textarea = getTextarea();
    fireEvent.input(textarea, { target: { value: 'change title to Build better habits' } });
    await waitFor(() => expect(textarea.value).toBe('change title to Build better habits'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith(EDIT_DOCUMENT);
    });
  });

  it('does NOT call reset() when API returns no editResult', async () => {
    vi.mocked(chatApi.appendProjectMessage).mockResolvedValueOnce({
      message: {
        id: 'msg-user',
        projectId: 'proj-w7',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'what layout looks good?',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      intent: { mode: 'conversation', confidence: 'high', reason: 'conversational' },
    });

    renderPage('proj-w7');

    const textarea = getTextarea();
    fireEvent.input(textarea, { target: { value: 'what layout looks good?' } });
    await waitFor(() => expect(textarea.value).toBe('what layout looks good?'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      expect(chatApi.appendProjectMessage).toHaveBeenCalledTimes(1);
    });

    expect(mockReset).not.toHaveBeenCalled();
  });

  it('shows assistant confirmation message in chat after successful edit', async () => {
    vi.mocked(chatApi.appendProjectMessage).mockResolvedValueOnce({
      message: {
        id: 'msg-user',
        projectId: 'proj-w7',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'duplicate this card',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      intent: { mode: 'edit', confidence: 'high', reason: 'edit pattern matched' },
      approvalMessage: {
        id: 'msg-confirm',
        projectId: 'proj-w7',
        threadId: 'thread-1',
        role: 'assistant',
        kind: 'text',
        content: 'Done — I duplicated the card.',
        metadata: {},
        seq: 2,
        createdAt: '2026-01-01T00:00:00Z',
      },
      editResult: {
        document: EDIT_DOCUMENT,
        version: 2,
        artifactId: 'art-edit-1',
      },
    });

    renderPage('proj-w7');

    const textarea = getTextarea();
    fireEvent.input(textarea, { target: { value: 'duplicate this card' } });
    await waitFor(() => expect(textarea.value).toBe('duplicate this card'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      expect(screen.getByText('Done — I duplicated the card.')).not.toBeNull();
    });
  });

  it('passes activeCardIndex as selectedCardIndex in appendProjectMessage call', async () => {
    vi.mocked(chatApi.appendProjectMessage).mockResolvedValueOnce({
      message: {
        id: 'msg-user',
        projectId: 'proj-w7',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'make text bigger',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      intent: { mode: 'edit', confidence: 'high', reason: 'edit pattern matched' },
      editResult: {
        document: EDIT_DOCUMENT,
        version: 2,
        artifactId: 'art-edit-1',
      },
    });

    renderPage('proj-w7');

    const textarea = getTextarea();
    fireEvent.input(textarea, { target: { value: 'make text bigger' } });
    await waitFor(() => expect(textarea.value).toBe('make text bigger'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      // activeCardIndex is 0 from the mocked workspaceStore
      expect(chatApi.appendProjectMessage).toHaveBeenCalledWith(
        'proj-w7',
        expect.objectContaining({ selectedCardIndex: 0 }),
      );
    });
  });

  it('does not call createGenerationJob for an edit response', async () => {
    const { createGenerationJob } = await import('../../api/generation');

    vi.mocked(chatApi.appendProjectMessage).mockResolvedValueOnce({
      message: {
        id: 'msg-user',
        projectId: 'proj-w7',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'make background darker',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      intent: { mode: 'edit', confidence: 'high', reason: 'edit pattern matched' },
      editResult: {
        document: EDIT_DOCUMENT,
        version: 2,
        artifactId: 'art-edit-1',
      },
    });

    renderPage('proj-w7');

    const textarea = getTextarea();
    fireEvent.input(textarea, { target: { value: 'make background darker' } });
    await waitFor(() => expect(textarea.value).toBe('make background darker'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      expect(chatApi.appendProjectMessage).toHaveBeenCalledTimes(1);
    });

    expect(createGenerationJob).not.toHaveBeenCalled();
  });

  it('shows both user message and confirmation in chat after edit', async () => {
    vi.mocked(chatApi.appendProjectMessage).mockResolvedValueOnce({
      message: {
        id: 'msg-user',
        projectId: 'proj-w7',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'add a card',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      intent: { mode: 'edit', confidence: 'high', reason: 'edit pattern matched' },
      approvalMessage: {
        id: 'msg-confirm',
        projectId: 'proj-w7',
        threadId: 'thread-1',
        role: 'assistant',
        kind: 'text',
        content: 'Done — I added a new card.',
        metadata: {},
        seq: 2,
        createdAt: '2026-01-01T00:00:00Z',
      },
      editResult: {
        document: EDIT_DOCUMENT,
        version: 2,
        artifactId: 'art-edit-1',
      },
    });

    renderPage('proj-w7');

    const textarea = getTextarea();
    fireEvent.input(textarea, { target: { value: 'add a card' } });
    await waitFor(() => expect(textarea.value).toBe('add a card'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      expect(screen.getByText('add a card')).not.toBeNull();
      expect(screen.getByText('Done — I added a new card.')).not.toBeNull();
    });
  });
});
