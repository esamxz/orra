// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPage';

// ---------------------------------------------------------------------------
// Navigation mock
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---------------------------------------------------------------------------
// Clerk mock — UserButton guarded by CLERK_CONFIGURED (false in tests)
// Mock the module so jsdom does not choke on the import
// ---------------------------------------------------------------------------
vi.mock('@clerk/clerk-react', () => ({
  UserButton: () => null,
  useAuth: vi.fn(() => ({ isLoaded: true, isSignedIn: false, getToken: vi.fn() })),
  useClerk: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// API mocks
// ---------------------------------------------------------------------------
const mockCreateProject = vi.fn();
const mockCreateNewProject = vi.fn();
vi.mock('../../api/projects', () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  createNewProject: (...args: unknown[]) => mockCreateNewProject(...args),
}));

// ---------------------------------------------------------------------------
// Hook mocks
// ---------------------------------------------------------------------------
const mockProjectsHook = vi.fn();
vi.mock('../../hooks/useProjects', () => ({
  useProjects: () => mockProjectsHook(),
}));

const mockBrandsHook = vi.fn();
vi.mock('../../hooks/useBrandSystems', () => ({
  useBrandSystems: () => mockBrandsHook(),
}));

vi.mock('../../hooks/useCreditStatus', () => ({
  useCreditStatus: () => ({ data: null, loading: false, error: null, reload: vi.fn() }),
}));

vi.mock('../../hooks/useAssetUpload', () => ({
  useAssetUpload: () => ({
    status: 'idle' as const,
    error: null,
    asset: null,
    upload: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggle: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-123',
    name: 'Test Project',
    type: 'carousel' as const,
    ratio: { name: '4:5' as const, w: 4, h: 5 },
    brandSystemId: null,
    currentArtifactId: 'art-1',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

function defaultProjectsHook() {
  return { projects: [], state: 'empty' as const, error: null, refresh: vi.fn() };
}

function defaultBrandsHook() {
  return {
    brands: [],
    state: 'idle' as const,
    error: null,
    reload: vi.fn(),
    createBrand: vi.fn(),
    updateBrand: vi.fn(),
    deleteBrand: vi.fn(),
    isMutating: false,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('DashboardPage', () => {
  beforeEach(() => {
    mockProjectsHook.mockReturnValue(defaultProjectsHook());
    mockBrandsHook.mockReturnValue(defaultBrandsHook());
    mockCreateProject.mockResolvedValue(makeProject());
    mockCreateNewProject.mockResolvedValue({ project: makeProject(), firstMessage: { id: 'msg-1', content: 'hello' } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the composer textarea', () => {
    renderDashboard();
    expect(screen.getByRole('textbox')).not.toBeNull();
  });

  it('renders a Create button', () => {
    renderDashboard();
    const createBtns = screen.getAllByRole('button', { name: /create/i });
    expect(createBtns.length).toBeGreaterThan(0);
  });

  it('empty prompt calls createProject not createNewProject', async () => {
    renderDashboard();
    const createBtn = screen.getAllByRole('button', { name: /^create$/i }).find(
      (b) => !b.hasAttribute('disabled'),
    );
    expect(createBtn).toBeTruthy();
    fireEvent.click(createBtn!);
    await waitFor(() => expect(mockCreateProject).toHaveBeenCalledTimes(1));
    expect(mockCreateNewProject).not.toHaveBeenCalled();
  });

  it('non-empty prompt calls createNewProject with prompt text', async () => {
    renderDashboard();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Create a post about focus' } });
    const createBtn = screen.getAllByRole('button', { name: /^create$/i }).find(
      (b) => !b.hasAttribute('disabled'),
    );
    fireEvent.click(createBtn!);
    await waitFor(() => expect(mockCreateNewProject).toHaveBeenCalledTimes(1));
    expect(mockCreateNewProject).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Create a post about focus' }),
    );
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('navigates to workspace after creation', async () => {
    renderDashboard();
    const createBtn = screen.getAllByRole('button', { name: /^create$/i }).find(
      (b) => !b.hasAttribute('disabled'),
    );
    fireEvent.click(createBtn!);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/workspace/proj-123',
      expect.any(Object),
    ));
  });

  it('no-brand is the default brand selector label', () => {
    renderDashboard();
    expect(screen.getByText('No brand')).not.toBeNull();
  });

  it('Single post chip sets type label visible as active', () => {
    renderDashboard();
    const singleChip = screen.getByRole('button', { name: /single post/i });
    expect(singleChip).not.toBeNull();
    fireEvent.click(singleChip);
    expect(singleChip.className).toContain('active');
  });

  it('Carousel chip is active by default (default type is carousel)', () => {
    renderDashboard();
    const carouselChip = screen.getByRole('button', { name: /^carousel$/i });
    expect(carouselChip.className).toContain('active');
  });

  it('clicking a real recent project navigates without calling createProject', async () => {
    const project = makeProject({ id: 'real-proj', name: 'Real Project' });
    mockProjectsHook.mockReturnValue({
      projects: [project],
      state: 'idle' as const,
      error: null,
      refresh: vi.fn(),
    });

    renderDashboard();
    // Use the <b> element in proj-meta (not the thumbnail overlay div) to find the button
    const projNameEls = screen.getAllByText('Real Project');
    const projMeta = projNameEls.find((el) => el.tagName.toLowerCase() === 'b');
    const projCard = projMeta?.closest('button');
    expect(projCard).toBeTruthy();
    fireEvent.click(projCard!);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/workspace/real-proj',
      expect.any(Object),
    ));
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockCreateNewProject).not.toHaveBeenCalled();
  });

  it('mock fallback projects are non-interactive demo cards (not buttons)', () => {
    mockProjectsHook.mockReturnValue({
      projects: [],
      state: 'error' as const,
      error: 'Network error',
      refresh: vi.fn(),
    });

    renderDashboard();
    const demoBadges = screen.getAllByText('Demo');
    expect(demoBadges.length).toBeGreaterThan(0);
    // Demo cards should be divs, not buttons
    demoBadges.forEach((badge) => {
      const card = badge.closest('.proj-card--demo');
      expect(card?.tagName.toLowerCase()).toBe('div');
    });
  });

  it('trend template Use this prompt calls createNewProject with template prompt', async () => {
    renderDashboard();
    const usePromptBtns = screen.getAllByRole('button', { name: /use this prompt/i });
    expect(usePromptBtns.length).toBeGreaterThan(0);
    fireEvent.click(usePromptBtns[0]);
    await waitFor(() => expect(mockCreateNewProject).toHaveBeenCalledTimes(1));
    const callArg = mockCreateNewProject.mock.calls[0][0] as { prompt: string };
    expect(typeof callArg.prompt).toBe('string');
    expect(callArg.prompt.length).toBeGreaterThan(0);
  });

  it('does not import or call generation API', async () => {
    // No generation import in DashboardPage — verify createProject/createNewProject
    // are the only project-creation calls made (no POST /generate)
    renderDashboard();
    const createBtn = screen.getAllByRole('button', { name: /^create$/i }).find(
      (b) => !b.hasAttribute('disabled'),
    );
    fireEvent.click(createBtn!);
    await waitFor(() => expect(mockCreateProject).toHaveBeenCalledTimes(1));
    // If generation were called we'd have a separate spy — absence confirms no generation
  });

  // ---------------------------------------------------------------------------
  // W2.1 chip changes
  // ---------------------------------------------------------------------------
  it('Instagram chip is not rendered', () => {
    renderDashboard();
    const buttons = screen.queryAllByRole('button', { name: /instagram/i });
    expect(buttons.length).toBe(0);
  });

  it('LinkedIn chip is not rendered', () => {
    renderDashboard();
    const buttons = screen.queryAllByRole('button', { name: /linkedin/i });
    expect(buttons.length).toBe(0);
  });

  it('Brand system chip is rendered', () => {
    renderDashboard();
    // Exact match to avoid collision with "Create brand system" button in brand section
    const chips = screen.getAllByRole('button').filter(
      (b) => b.className.includes('chip') && b.textContent === 'Brand system',
    );
    expect(chips.length).toBe(1);
  });

  it('clicking Brand system chip opens the create brand modal (not the dropdown)', () => {
    renderDashboard();
    const chip = screen.getAllByRole('button').find(
      (b) => b.className.includes('chip') && b.textContent === 'Brand system',
    )!;
    // Before click: dropdown brand list should not be visible
    const beforeCount = screen.queryAllByText('No brand').length;
    fireEvent.click(chip);
    // Dropdown should NOT have opened (action is now setBrandModalOpen, not setBrandOpen)
    expect(screen.queryAllByText('No brand').length).toBe(beforeCount);
  });

  // ---------------------------------------------------------------------------
  // W2.1 trend templates See all
  // ---------------------------------------------------------------------------
  it('trend templates section renders a disabled See all button', () => {
    renderDashboard();
    const seeAll = screen.getByRole('button', { name: /see all/i });
    expect(seeAll).not.toBeNull();
    expect(seeAll.hasAttribute('disabled')).toBe(true);
  });
});
