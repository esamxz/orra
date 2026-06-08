// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WorkspacePage from '../WorkspacePage';
import * as chatApi from '../../api/chat';
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

const mockDispatch = vi.fn(() => true);
const mockUndo = vi.fn();
const mockRedo = vi.fn();
const mockReset = vi.fn();

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
          layers: [
            {
              id: 'layer-1',
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
              assetId: 'asset-1',
              fit: 'cover' as const,
            },
          ],
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

vi.mock('../../components/workspace/KonvaStage', () => ({
  default: () => null,
}));

vi.mock('../../components/workspace/MiniArtifactPreview', () => ({
  default: () => null,
}));

vi.mock('../../components/workspace/ApprovalCard', () => ({
  default: ({ onApprove }: { onApprove: () => void }) => (
    <div data-testid="approval-card">
      <button onClick={onApprove}>Approve</button>
    </div>
  ),
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

vi.mock('../../api/chat');

vi.mock('../../hooks/useProjectMessages', () => ({
  useProjectMessages: vi.fn(),
}));

describe('WorkspacePage chat persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue(true);
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

  function getComposerTextarea(): HTMLTextAreaElement {
    const all = screen.getAllByPlaceholderText(/Direct Orra/);
    return all[0] as HTMLTextAreaElement;
  }

  it('does not call chat API in demo mode (no projectId)', async () => {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    const textarea = getComposerTextarea();
    fireEvent.input(textarea, { target: { value: 'Hello' } });
    await waitFor(() => expect(textarea.value).toBe('Hello'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      expect(chatApi.appendProjectMessage).not.toHaveBeenCalled();
    });
  });

  it('shows optimistic user message in real project mode', async () => {
    const reloadMock = vi.fn();
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [],
      state: 'idle',
      error: null,
      reload: reloadMock,
    });

    vi.mocked(chatApi.appendProjectMessage).mockResolvedValueOnce({
      message: {
        id: 'msg-real',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'Hello real project',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      intent: { mode: 'conversation', confidence: 'high', reason: 'Test' },
    });

    renderPage('proj-1');

    const textarea = getComposerTextarea();
    fireEvent.input(textarea, { target: { value: 'Hello real project' } });
    await waitFor(() => expect(textarea.value).toBe('Hello real project'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    // Optimistic message should appear immediately
    await waitFor(() => {
      expect(screen.getByText('Hello real project')).not.toBeNull();
    });

    // API should have been called
    await waitFor(() => {
      expect(chatApi.appendProjectMessage).toHaveBeenCalledWith('proj-1', { content: 'Hello real project' });
    });
  });

  it('does not send empty messages', async () => {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage('proj-1');

    const textarea = getComposerTextarea();
    fireEvent.input(textarea, { target: { value: '   ' } });
    await waitFor(() => expect(textarea.value).toBe('   '));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      expect(chatApi.appendProjectMessage).not.toHaveBeenCalled();
    });
  });

  it('shows send error and restores input on failure', async () => {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    vi.mocked(chatApi.appendProjectMessage).mockRejectedValueOnce(
      new Error('Network error'),
    );

    renderPage('proj-1');

    const textarea = getComposerTextarea();
    fireEvent.input(textarea, { target: { value: 'Test message' } });
    await waitFor(() => expect(textarea.value).toBe('Test message'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Failed to send message/i)).not.toBeNull();
    });

    // Input should be restored
    expect(textarea.value).toBe('Test message');
  });

  it('renders persisted messages from API', async () => {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [
        {
          id: 'msg-1',
          projectId: 'proj-1',
          threadId: 'thread-1',
          role: 'user',
          kind: 'text',
          content: 'Persisted message',
          metadata: {},
          seq: 1,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage('proj-1');

    await waitFor(() => {
      expect(screen.getByText('Persisted message')).not.toBeNull();
    });
  });

  it('does not show approval card for real project messages', async () => {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    vi.mocked(chatApi.appendProjectMessage).mockResolvedValueOnce({
      message: {
        id: 'msg-1',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'create a post',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      intent: { mode: 'generation', confidence: 'high', reason: 'Test' },
    });

    renderPage('proj-1');

    const textarea = getComposerTextarea();
    fireEvent.input(textarea, { target: { value: 'create a post' } });
    await waitFor(() => expect(textarea.value).toBe('create a post'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => {
      expect(chatApi.appendProjectMessage).toHaveBeenCalled();
    });

    // No approval card should appear in real mode
    expect(screen.queryByTestId('approval-card')).toBeNull();
  });

  it('disables textarea and shows sending state while message is being sent', async () => {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    // Delay the API resolution so we can observe the sending state
    vi.mocked(chatApi.appendProjectMessage).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        message: {
          id: 'msg-1',
          projectId: 'proj-1',
          threadId: 'thread-1',
          role: 'user',
          kind: 'text',
          content: 'Hello',
          metadata: {},
          seq: 1,
          createdAt: '2026-01-01T00:00:00Z',
        },
        intent: { mode: 'conversation', confidence: 'high', reason: 'Test' },
      }), 50)),
    );

    renderPage('proj-1');

    const textarea = getComposerTextarea();
    fireEvent.input(textarea, { target: { value: 'Hello' } });
    await waitFor(() => expect(textarea.value).toBe('Hello'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    // Textarea should be disabled during send
    await waitFor(() => {
      expect(textarea.disabled).toBe(true);
    });

    // Send button should be disabled
    const sendBtn = screen.getAllByRole('button', { name: /Send/i })[0] as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });
});
