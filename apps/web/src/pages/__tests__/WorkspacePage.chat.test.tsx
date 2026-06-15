// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WorkspacePage from '../WorkspacePage';
import * as chatApi from '../../api/chat';
import * as useProjectMessagesModule from '../../hooks/useProjectMessages';
import * as useProjectAssetsModule from '../../hooks/useProjectAssets';

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

  it('shows honest error and does not call chat API when no projectId', async () => {
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

    // No API call should be made
    await waitFor(() => {
      expect(chatApi.appendProjectMessage).not.toHaveBeenCalled();
    });
    // Honest message should appear, not a fake AI reply
    await waitFor(() => {
      expect(screen.getByText(/no project loaded/i)).not.toBeNull();
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

    // API should have been called (selectedCardIndex: 0 from mocked workspaceStore)
    await waitFor(() => {
      expect(chatApi.appendProjectMessage).toHaveBeenCalledWith('proj-1', { content: 'Hello real project', selectedCardIndex: 0 });
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

// ---------------------------------------------------------------------------
// W4: Workspace setup states
// ---------------------------------------------------------------------------

describe('W4 workspace setup states', () => {
  function mockMessages(msgs: unknown[]) {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: msgs as never,
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });
  }

  function renderPage(projectId?: string) {
    mockParams.projectId = projectId;
    return render(
      <MemoryRouter
        initialEntries={[{ pathname: projectId ? `/workspace/${projectId}` : '/workspace' }]}
      >
        <Routes>
          <Route path="/workspace/:projectId?" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue(true);
    mockParams.projectId = undefined;
    vi.mocked(useProjectAssetsModule.useProjectAssets).mockReturnValue({
      assets: [],
      state: 'idle',
      error: null,
      previewUrls: {},
      reload: vi.fn(),
      getPreviewUrl: vi.fn(),
    } as never);
  });

  it('empty project with no messages and no assets shows default prompt copy', () => {
    mockMessages([]);
    renderPage('proj-1');
    expect(screen.getByText(/Describe the post or carousel you want/i)).not.toBeNull();
  });

  it('empty project with assets shows asset-aware copy', () => {
    mockMessages([]);
    vi.mocked(useProjectAssetsModule.useProjectAssets).mockReturnValue({
      assets: [{ id: 'asset-1', fileName: 'photo.png', kind: 'upload', contentType: 'image/png', sizeBytes: 1000, projectId: 'proj-1', brandSystemId: null, workspaceId: 'ws-1', status: 'confirmed', createdAt: '2026-01-01' }],
      state: 'idle',
      error: null,
      previewUrls: {},
      reload: vi.fn(),
      getPreviewUrl: vi.fn(),
    } as never);
    renderPage('proj-1');
    expect(screen.getByText(/Your images are ready/i)).not.toBeNull();
  });

  it('shows setup card when first prompt exists but no AI response yet', () => {
    mockMessages([
      {
        id: 'msg-1',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'Create a post about discipline',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    renderPage('proj-1');
    expect(screen.getByText(/Ready to prepare this project/i)).not.toBeNull();
    expect(screen.getByRole('button', { name: /create setup plan/i })).not.toBeNull();
  });

  it('clicking Create setup plan calls prepareProjectMessage with correct arguments', async () => {
    mockMessages([
      {
        id: 'msg-1',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'Create a post',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.mocked(chatApi.prepareProjectMessage).mockResolvedValueOnce({
      message: { id: 'msg-1', projectId: 'proj-1', threadId: 'thread-1', role: 'user', kind: 'text', content: 'Create a post', metadata: {}, seq: 1, createdAt: '2026-01-01T00:00:00Z' },
      intent: { mode: 'generation', confidence: 'high', reason: 'test' },
      approvalMessage: { id: 'msg-2', projectId: 'proj-1', threadId: 'thread-1', role: 'assistant', kind: 'approval_summary', content: 'Ready.', metadata: { approvalCard: { summaryLine: 'Ready.', format: '4:5', style: 'Focused', brand: 'No brand', cta: 'Not set' }, approvalState: { status: 'pending', updatedAt: '' }, sourceUserMessageId: 'msg-1', intent: { mode: 'generation' } }, seq: 2, createdAt: '2026-01-01T00:00:00Z' },
    } as never);

    renderPage('proj-1');
    fireEvent.click(screen.getByRole('button', { name: /create setup plan/i }));
    await waitFor(() => {
      expect(chatApi.prepareProjectMessage).toHaveBeenCalledWith('proj-1', 'msg-1');
    });
  });

  it('after successful prepare with generation intent, approval card renders', async () => {
    mockMessages([
      {
        id: 'msg-1',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'Create a post',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.mocked(chatApi.prepareProjectMessage).mockResolvedValueOnce({
      message: { id: 'msg-1', projectId: 'proj-1', threadId: 'thread-1', role: 'user', kind: 'text', content: 'Create a post', metadata: {}, seq: 1, createdAt: '2026-01-01T00:00:00Z' },
      intent: { mode: 'generation', confidence: 'high', reason: 'test' },
      approvalMessage: { id: 'msg-2', projectId: 'proj-1', threadId: 'thread-1', role: 'assistant', kind: 'approval_summary', content: 'Ready.', metadata: { approvalCard: { summaryLine: 'Ready.', format: '4:5', style: 'Focused', brand: 'No brand', cta: 'Not set' }, approvalState: { status: 'pending', updatedAt: '' }, sourceUserMessageId: 'msg-1', intent: { mode: 'generation' } }, seq: 2, createdAt: '2026-01-01T00:00:00Z' },
    } as never);

    renderPage('proj-1');
    fireEvent.click(screen.getByRole('button', { name: /create setup plan/i }));
    await waitFor(() => {
      expect(screen.getByTestId('approval-card')).not.toBeNull();
    });
  });

  it('prepare action does not call generation API', async () => {
    mockMessages([
      {
        id: 'msg-1',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'Create a post',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.mocked(chatApi.prepareProjectMessage).mockResolvedValueOnce({
      message: { id: 'msg-1', projectId: 'proj-1', threadId: 'thread-1', role: 'user', kind: 'text', content: 'Create a post', metadata: {}, seq: 1, createdAt: '2026-01-01T00:00:00Z' },
      intent: { mode: 'generation', confidence: 'high', reason: 'test' },
      approvalMessage: { id: 'msg-2', projectId: 'proj-1', threadId: 'thread-1', role: 'assistant', kind: 'approval_summary', content: 'Ready.', metadata: { approvalCard: { summaryLine: 'Ready.', format: '4:5', style: 'Focused', brand: 'No brand', cta: 'Not set' }, approvalState: { status: 'pending', updatedAt: '' }, sourceUserMessageId: 'msg-1', intent: { mode: 'generation' } }, seq: 2, createdAt: '2026-01-01T00:00:00Z' },
    } as never);

    renderPage('proj-1');
    fireEvent.click(screen.getByRole('button', { name: /create setup plan/i }));
    await waitFor(() => expect(chatApi.prepareProjectMessage).toHaveBeenCalledTimes(1));
    // No generation API import exists for this call
    expect(chatApi.appendProjectMessage).not.toHaveBeenCalled();
  });

  it('existing project with approval_summary renders approval card without setup card', () => {
    mockMessages([
      {
        id: 'msg-1',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'Create a post',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'msg-2',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'assistant',
        kind: 'approval_summary',
        content: 'Ready.',
        metadata: {
          approvalCard: { summaryLine: 'Ready.', format: '4:5', style: 'Focused', brand: 'No brand', cta: 'Not set' },
          approvalState: { status: 'pending', updatedAt: '' },
          sourceUserMessageId: 'msg-1',
          intent: { mode: 'generation' },
        },
        seq: 2,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    renderPage('proj-1');
    expect(screen.getByTestId('approval-card')).not.toBeNull();
    expect(screen.queryByText(/Ready to prepare this project/i)).toBeNull();
  });

  it('does not show setup card when no messages (empty project)', () => {
    mockMessages([]);
    renderPage('proj-1');
    expect(screen.queryByText(/Ready to prepare this project/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /create setup plan/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F0: Frontend Mock/Fake Cleanup — proof tests
// ---------------------------------------------------------------------------

describe('F0 no fake/demo content in production UI', () => {
  function mockMessages(msgs: unknown[]) {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: msgs as never,
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });
  }

  function renderPage(projectId?: string) {
    mockParams.projectId = projectId;
    return render(
      <MemoryRouter
        initialEntries={[{ pathname: projectId ? `/workspace/${projectId}` : '/workspace' }]}
      >
        <Routes>
          <Route path="/workspace/:projectId?" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue(true);
    mockParams.projectId = undefined;
  });

  it('does not invent assistant reply when API returns no approvalMessage', async () => {
    mockMessages([]);
    vi.mocked(chatApi.appendProjectMessage).mockResolvedValueOnce({
      message: {
        id: 'msg-1',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'Make a post about discipline',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      intent: { mode: 'conversation', confidence: 'high', reason: 'Test' },
    });

    renderPage('proj-1');
    const textarea = screen.getAllByPlaceholderText(/Direct Orra/)[0] as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: 'Make a post about discipline' } });
    await waitFor(() => expect(textarea.value).toBe('Make a post about discipline'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() => expect(chatApi.appendProjectMessage).toHaveBeenCalled());

    // No hardcoded fallback AI message should appear
    expect(screen.queryByText(/tell me what you'd like to create/i)).toBeNull();
    expect(screen.queryByText(/I'd love to help/i)).toBeNull();
    expect(screen.queryByText(/planning the direction/i)).toBeNull();
  });

  it('shows API error message, not fake reply, when send fails', async () => {
    mockMessages([]);
    vi.mocked(chatApi.appendProjectMessage).mockRejectedValueOnce(
      new Error('Provider unavailable'),
    );

    renderPage('proj-1');
    const textarea = screen.getAllByPlaceholderText(/Direct Orra/)[0] as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: 'Create a carousel' } });
    await waitFor(() => expect(textarea.value).toBe('Create a carousel'));
    fireEvent.click(screen.getAllByRole('button', { name: /Send/i })[0]);

    await waitFor(() =>
      expect(screen.getByText(/Failed to send message/i)).not.toBeNull(),
    );
    // No fake AI success reply should appear
    expect(screen.queryByText(/planning the direction/i)).toBeNull();
    expect(screen.queryByText(/I'd love to help/i)).toBeNull();
  });

  it('approval card onApprove calls real API handler, not demo handler', async () => {
    mockMessages([
      {
        id: 'msg-1',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'Create a post',
        metadata: {},
        seq: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'msg-2',
        projectId: 'proj-1',
        threadId: 'thread-1',
        role: 'assistant',
        kind: 'approval_summary',
        content: 'Ready.',
        metadata: {
          approvalCard: { summaryLine: 'Ready.', format: '4:5', style: 'Focused', brand: 'No brand', cta: null },
          approvalState: { status: 'pending', updatedAt: '' },
          sourceUserMessageId: 'msg-1',
          intent: { mode: 'generation' },
        },
        seq: 2,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.mocked(chatApi.submitApprovalAction).mockResolvedValueOnce({
      id: 'msg-2',
      projectId: 'proj-1',
      threadId: 'thread-1',
      role: 'assistant',
      kind: 'approval_summary',
      content: 'Ready.',
      metadata: {
        approvalCard: { summaryLine: 'Ready.', format: '4:5', style: 'Focused', brand: 'No brand', cta: null },
        approvalState: { status: 'approved', updatedAt: '' },
        sourceUserMessageId: 'msg-1',
      },
      seq: 2,
      createdAt: '2026-01-01T00:00:00Z',
    });
    // generation job creation is handled by a separate api module — not needed here

    renderPage('proj-1');

    await waitFor(() => expect(screen.getByTestId('approval-card')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));

    await waitFor(() => {
      expect(chatApi.submitApprovalAction).toHaveBeenCalledWith(
        'proj-1',
        'msg-2',
        expect.objectContaining({ action: 'approve_and_create' }),
      );
    });
  });
});
