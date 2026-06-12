// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WorkspacePage from '../WorkspacePage';
import * as generationApi from '../../api/generation';
import * as chatApi from '../../api/chat';
import * as useProjectMessagesModule from '../../hooks/useProjectMessages';
import * as useProjectAssetsModule from '../../hooks/useProjectAssets';

// ---------------------------------------------------------------------------
// Router params mock
// ---------------------------------------------------------------------------

const mockParams: { projectId?: string } = {};
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => mockParams };
});

// ---------------------------------------------------------------------------
// Credit status mock — controlled by tests
// ---------------------------------------------------------------------------

const mockReloadCreditStatus = vi.fn();
let mockCreditData: {
  balance: {
    workspaceId: string;
    monthlyRemaining: number;
    topupRemaining: number;
    totalRemaining: number;
    reserved: number;
    resetAt: null;
  };
  recentLedger: never[];
} | null = null;

vi.mock('../../hooks/useCreditStatus', () => ({
  useCreditStatus: () => ({
    data: mockCreditData,
    loading: false,
    error: null,
    reload: mockReloadCreditStatus,
  }),
}));

// ---------------------------------------------------------------------------
// Core hook mocks
// ---------------------------------------------------------------------------

const mockReset = vi.fn();
const mockDispatch = vi.fn(() => true);

// Artifact is set per test-suite
let mockArtifact: import('@orra/shared').ArtifactDocument | null = null;

vi.mock('../../hooks/usePersistedActionDispatch', () => ({
  usePersistedActionDispatch: () => ({
    artifact: mockArtifact,
    dispatch: mockDispatch,
    undo: vi.fn(),
    redo: vi.fn(),
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

const mockSetCardByCardMode = vi.fn();
let mockIsCardByCardMode = false;

vi.mock('../../stores/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: unknown) => unknown) => {
    const state = {
      activeCardIndex: 0,
      selectedLayerId: null,
      selectedLayerType: null,
      isCardByCardMode: mockIsCardByCardMode,
      setActiveCard: vi.fn(),
      selectLayer: vi.fn(),
      clearSelection: vi.fn(),
      syncSelectionWithCard: vi.fn(),
      setCardByCardMode: mockSetCardByCardMode,
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

vi.mock('../../hooks/useBrandSystems', () => ({
  useBrandSystems: () => ({ brands: [], loading: false, error: null, reload: vi.fn() }),
}));

vi.mock('../../hooks/useAssetUpload', () => ({
  useAssetUpload: () => ({ upload: vi.fn(), uploading: false, error: null }),
}));

vi.mock('../../hooks/useAssetPreviewUrls', () => ({
  useAssetPreviewUrls: () => ({ urls: {}, getUrl: vi.fn() }),
}));

vi.mock('../../hooks/useProjectMemory', () => ({
  useProjectMemory: () => ({ memory: null, loading: false, error: null, reload: vi.fn() }),
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

// CarouselRail mock that exposes onGenerateCard for testing
vi.mock('../../components/workspace/CarouselRail', () => ({
  default: ({ onGenerateCard }: { onGenerateCard?: (cardId: string) => void }) => {
    if (!onGenerateCard) return <div data-testid="carousel-rail-no-gen" />;
    return (
      <div data-testid="carousel-rail">
        <button
          data-testid="generate-card-btn"
          onClick={() => onGenerateCard('card-rail-1')}
        >
          Generate card
        </button>
      </div>
    );
  },
}));

// ApprovalCard mock that exposes received props
vi.mock('../../components/workspace/ApprovalCard', () => ({
  default: ({
    specs,
    canAfford,
    onApprove,
    onCreateCardByCard,
  }: {
    specs: { estimatedCredits?: number; lead?: string } | null;
    canAfford?: boolean;
    onApprove: () => void;
    onCreateCardByCard?: () => void;
  }) => (
    <div
      data-testid="approval-card"
      data-estimated-credits={specs?.estimatedCredits ?? 'none'}
      data-can-afford={String(canAfford)}
    >
      {specs?.estimatedCredits != null && (
        <span data-testid="approval-credits">{specs.estimatedCredits}</span>
      )}
      {canAfford === false && (
        <span data-testid="cannot-afford">Not enough credits</span>
      )}
      <button onClick={onApprove}>Approve</button>
      {onCreateCardByCard && (
        <button data-testid="create-card-by-card-btn" onClick={onCreateCardByCard}>
          Create card by card
        </button>
      )}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// API mocks
// ---------------------------------------------------------------------------

vi.mock('../../api/chat');
vi.mock('../../api/generation', () => ({
  createGenerationJob: vi.fn(),
  getGenerationEstimate: vi.fn(),
  getGenerationJob: vi.fn(),
}));
vi.mock('../../api/projects', () => ({ updateProject: vi.fn() }));

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
// Data fixtures
// ---------------------------------------------------------------------------

const CAROUSEL_ARTIFACT: import('@orra/shared').ArtifactDocument = {
  schemaVersion: 1,
  artifactId: 'art-carousel-1',
  type: 'carousel',
  ratio: { name: '4:5' as const, w: 1080, h: 1350 },
  version: 1,
  cards: [
    { id: 'card-1', index: 0, baseColor: '#1d2a30', layers: [] },
    { id: 'card-2', index: 1, baseColor: '#1d2a30', layers: [] },
    { id: 'card-3', index: 2, baseColor: '#1d2a30', layers: [] },
  ],
};

const APPROVAL_MESSAGE_WITH_CREDITS = {
  id: 'msg-approval',
  projectId: 'proj-w8',
  threadId: 'thread-1',
  role: 'assistant' as const,
  kind: 'approval_summary' as const,
  content: 'Ready to create a post.',
  metadata: {
    approvalCard: {
      summaryLine: 'Ready to create a post.',
      format: '4:5',
      style: 'calm, premium',
      brand: 'No brand',
      cta: 'Not set',
      estimatedCredits: 10,
    },
    approvalState: { status: 'pending', updatedAt: '' },
    sourceUserMessageId: 'msg-user',
    intent: { mode: 'generation' },
  },
  seq: 2,
  createdAt: '2026-01-01T00:00:00Z',
};

const CAROUSEL_APPROVAL_MESSAGE = {
  id: 'msg-carousel-approval',
  projectId: 'proj-w8',
  threadId: 'thread-1',
  role: 'assistant' as const,
  kind: 'approval_summary' as const,
  content: 'Ready to create a carousel.',
  metadata: {
    approvalCard: {
      summaryLine: 'Ready to create a 3-card carousel.',
      format: '4:5',
      style: 'calm, premium',
      brand: 'No brand',
      cta: 'Not set',
      cardCount: 3,
      estimatedCredits: 30,
    },
    approvalState: { status: 'pending', updatedAt: '' },
    sourceUserMessageId: 'msg-user',
    intent: { mode: 'generation', generationHint: { artifactType: 'carousel', requestedCardCount: 3 } },
  },
  seq: 2,
  createdAt: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(projectId = 'proj-w8', state?: Record<string, unknown>) {
  mockParams.projectId = projectId;
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/workspace/${projectId}`, state: state ?? null }]}
    >
      <Routes>
        <Route path="/workspace/:projectId?" element={<WorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// W8: Credit estimation — ApprovalCard receives estimatedCredits
// ---------------------------------------------------------------------------

describe('WorkspacePage — W8 credit estimation display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams.projectId = undefined;
    mockCreditData = null;
    mockArtifact = null;
    mockIsCardByCardMode = false;

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

  it('passes estimatedCredits from approval card DTO to ApprovalCard', async () => {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [APPROVAL_MESSAGE_WITH_CREDITS],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage('proj-w8');

    await waitFor(() => {
      const creditsEl = screen.queryByTestId('approval-credits');
      expect(creditsEl).not.toBeNull();
      expect(creditsEl?.textContent).toBe('10');
    });
  });

  it('passes estimatedCredits for carousel approval card', async () => {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [CAROUSEL_APPROVAL_MESSAGE],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage('proj-w8');

    await waitFor(() => {
      const creditsEl = screen.queryByTestId('approval-credits');
      expect(creditsEl).not.toBeNull();
      expect(creditsEl?.textContent).toBe('30');
    });
  });

  it('passes canAfford: true when credit balance exceeds estimate', async () => {
    mockCreditData = {
      balance: {
        workspaceId: 'ws-1',
        monthlyRemaining: 100,
        topupRemaining: 0,
        totalRemaining: 100,
        reserved: 0,
        resetAt: null,
      },
      recentLedger: [],
    };

    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [APPROVAL_MESSAGE_WITH_CREDITS],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage('proj-w8');

    await waitFor(() => {
      const card = screen.queryByTestId('approval-card');
      expect(card?.getAttribute('data-can-afford')).toBe('true');
    });
  });

  it('passes canAfford: false when credit balance is below estimate', async () => {
    mockCreditData = {
      balance: {
        workspaceId: 'ws-1',
        monthlyRemaining: 5,
        topupRemaining: 0,
        totalRemaining: 5,
        reserved: 0,
        resetAt: null,
      },
      recentLedger: [],
    };

    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [APPROVAL_MESSAGE_WITH_CREDITS],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage('proj-w8');

    await waitFor(() => {
      expect(screen.queryByTestId('cannot-afford')).not.toBeNull();
    });
  });

  it('does not show canAfford warning when credit data is not loaded', async () => {
    mockCreditData = null;

    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [APPROVAL_MESSAGE_WITH_CREDITS],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage('proj-w8');

    await waitFor(() => {
      expect(screen.queryByTestId('approval-card')).not.toBeNull();
    });

    expect(screen.queryByTestId('cannot-afford')).toBeNull();
  });

  it('does not call createGenerationJob when approval card is displayed', async () => {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [APPROVAL_MESSAGE_WITH_CREDITS],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage('proj-w8');

    await waitFor(() => {
      expect(screen.queryByTestId('approval-card')).not.toBeNull();
    });

    expect(generationApi.createGenerationJob).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// W8: Selected-card confirmation dialog
// ---------------------------------------------------------------------------

describe('WorkspacePage — W8 selected-card confirmation', () => {
  const CAROUSEL_APPROVAL_APPROVED = {
    ...CAROUSEL_APPROVAL_MESSAGE,
    metadata: {
      ...CAROUSEL_APPROVAL_MESSAGE.metadata,
      approvalState: { status: 'approved', updatedAt: '2026-01-01T00:00:00Z' },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockParams.projectId = undefined;
    mockCreditData = null;
    mockArtifact = CAROUSEL_ARTIFACT;
    mockIsCardByCardMode = true;

    vi.mocked(useProjectAssetsModule.useProjectAssets).mockReturnValue({
      assets: [],
      state: 'idle',
      error: null,
      previewUrls: {},
      reload: vi.fn(),
      getPreviewUrl: vi.fn(),
    } as never);

    // submitApprovalAction returns the updated message (approved)
    vi.mocked(chatApi.submitApprovalAction).mockResolvedValue({
      data: CAROUSEL_APPROVAL_APPROVED,
    } as never);
  });

  async function setupCardByCardAndClickGenerate() {
    vi.mocked(useProjectMessagesModule.useProjectMessages).mockReturnValue({
      messages: [CAROUSEL_APPROVAL_MESSAGE],
      state: 'idle',
      error: null,
      reload: vi.fn(),
    });

    renderPage('proj-w8', { mode: 'carousel' });

    // Activate card-by-card mode
    const cbcBtn = await waitFor(() => screen.getByTestId('create-card-by-card-btn'));
    fireEvent.click(cbcBtn);

    await waitFor(() => {
      expect(chatApi.submitApprovalAction).toHaveBeenCalledWith(
        'proj-w8',
        'msg-carousel-approval',
        expect.objectContaining({ action: 'create_card_by_card' }),
      );
    });

    // Now click the generate card button in CarouselRail
    const generateBtn = await waitFor(() => screen.queryByTestId('generate-card-btn'));
    expect(generateBtn).not.toBeNull();
    fireEvent.click(generateBtn!);
  }

  it('clicking carousel rail generate button shows confirmation dialog', async () => {
    await setupCardByCardAndClickGenerate();

    await waitFor(() => {
      expect(screen.queryByText(/Generate this card for 10 credits/i)).not.toBeNull();
    });

    expect(generationApi.createGenerationJob).not.toHaveBeenCalled();
  });

  it('clicking Cancel closes confirmation without calling generation API', async () => {
    await setupCardByCardAndClickGenerate();

    await waitFor(() => {
      expect(screen.queryByText(/Generate this card for 10 credits/i)).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Generate this card for 10 credits/i)).toBeNull();
    });

    expect(generationApi.createGenerationJob).not.toHaveBeenCalled();
  });

  it('clicking Generate card calls createGenerationJob with selected_card scope and targetCardId', async () => {
    vi.mocked(generationApi.createGenerationJob).mockResolvedValueOnce({
      id: 'job-1',
      projectId: 'proj-w8',
      status: 'queued',
      kind: 'full_generate',
      resultVersionId: null,
      reservedCredits: 10,
      capturedCredits: 0,
      error: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    await setupCardByCardAndClickGenerate();

    await waitFor(() => {
      expect(screen.queryByText(/Generate this card for 10 credits/i)).not.toBeNull();
    });

    const confirmBtn = await waitFor(() => screen.queryByTestId('confirm-generate-card-btn'));
    expect(confirmBtn).not.toBeNull();
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(generationApi.createGenerationJob).toHaveBeenCalledWith(
        expect.objectContaining({
          generationScope: 'selected_card',
          targetCardId: 'card-rail-1',
        }),
      );
    });
  });

  it('confirmation dialog closes after successful generation', async () => {
    vi.mocked(generationApi.createGenerationJob).mockResolvedValueOnce({
      id: 'job-1',
      projectId: 'proj-w8',
      status: 'queued',
      kind: 'full_generate',
      resultVersionId: null,
      reservedCredits: 10,
      capturedCredits: 0,
      error: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    await setupCardByCardAndClickGenerate();

    await waitFor(() => {
      expect(screen.queryByText(/Generate this card for 10 credits/i)).not.toBeNull();
    });

    const confirmBtn = screen.getByTestId('confirm-generate-card-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Generate this card for 10 credits/i)).toBeNull();
    });
  });

  it('confirm generate card button is disabled while request is in flight', async () => {
    let resolveJob!: (v: import('../../api/types').GenerationJobDto) => void;
    vi.mocked(generationApi.createGenerationJob).mockImplementationOnce(
      () => new Promise((res) => { resolveJob = res; })
    );

    await setupCardByCardAndClickGenerate();

    await waitFor(() => {
      expect(screen.queryByText(/Generate this card for 10 credits/i)).not.toBeNull();
    });

    const confirmBtn = screen.getByTestId('confirm-generate-card-btn');
    fireEvent.click(confirmBtn);

    // While awaiting, confirm button text changes to "Generating…"
    await waitFor(() => {
      const btn = screen.queryByTestId('confirm-generate-card-btn');
      expect(btn?.textContent).toContain('Generating');
    });

    // Resolve the job so the test doesn't hang
    resolveJob({
      id: 'job-1', projectId: 'proj-w8', status: 'queued', kind: 'full_generate',
      resultVersionId: null, reservedCredits: 10, capturedCredits: 0,
      error: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    });
  });
});
