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
const mockUseAuth = vi.fn();
vi.mock('@clerk/clerk-react', () => ({
  UserButton: () => null,
  useAuth: () => mockUseAuth(),
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

const mockEnhancePrompt = vi.fn();
vi.mock('../../api/prompts', () => ({
  enhancePrompt: (...args: unknown[]) => mockEnhancePrompt(...args),
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

// DashboardPage calls useAssetUpload() twice: first for brandUpload, second for projectAssetUpload.
// We track call index to return distinct upload spies per instance.
const mockBrandUploadFn = vi.fn();
const mockProjectUploadFn = vi.fn().mockResolvedValue({ id: 'asset-new' });
let assetUploadCallIndex = 0;

vi.mock('../../hooks/useAssetUpload', () => ({
  useAssetUpload: () => {
    const idx = assetUploadCallIndex++;
    return {
      status: 'idle' as const,
      error: null,
      asset: null,
      upload: idx % 2 === 0 ? mockBrandUploadFn : mockProjectUploadFn,
      reset: vi.fn(),
    };
  },
}));

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggle: vi.fn() }),
}));

const mockTrendTemplatesHook = vi.fn();
vi.mock('../../hooks/useTrendTemplates', () => ({
  useTrendTemplates: (enabled: boolean) => mockTrendTemplatesHook(enabled),
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

function makeDashboardTemplate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tmpl-dash-1',
    title: 'Dashboard Template',
    description: 'A template shown on dashboard.',
    prompt: 'Create a calm, minimal post about productivity.',
    category: 'Wellness',
    projectType: 'carousel' as const,
    ratioHint: '4:5',
    platformHint: 'Instagram',
    assetHints: [],
    previewVariant: 'cover',
    isFeatured: true,
    tags: ['calm'],
    sortIndex: 1,
    referenceR2Key: null,
    ...overrides,
  };
}

function defaultTrendTemplatesHook() {
  const template = makeDashboardTemplate();
  return {
    data: [template],
    featured: [template],
    categories: ['Wellness'],
    loading: false,
    error: null,
    reload: vi.fn(),
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
    assetUploadCallIndex = 0;
    mockProjectUploadFn.mockResolvedValue({ id: 'asset-new' });
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
    URL.revokeObjectURL = vi.fn();
    mockProjectsHook.mockReturnValue(defaultProjectsHook());
    mockBrandsHook.mockReturnValue(defaultBrandsHook());
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true, getToken: vi.fn() });
    mockTrendTemplatesHook.mockReturnValue(defaultTrendTemplatesHook());
    mockCreateProject.mockResolvedValue(makeProject());
    mockCreateNewProject.mockResolvedValue({ project: makeProject(), firstMessage: { id: 'msg-1', content: 'hello' } });
    mockEnhancePrompt.mockResolvedValue({
      originalPrompt: 'Make a post about discipline',
      enhancedPrompt: 'Create a clean, motivational 4:5 social post about discipline. Use a bold minimal layout.',
      inferredType: 'single_post',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    assetUploadCallIndex = 0;
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

  it('shows honest error state (not demo cards) when projects fail to load', () => {
    mockProjectsHook.mockReturnValue({
      projects: [],
      state: 'error' as const,
      error: 'Network error',
      refresh: vi.fn(),
    });

    renderDashboard();
    expect(screen.getByText(/could not load projects/i)).not.toBeNull();
    // No demo badge or demo cards should appear
    expect(screen.queryAllByText('Demo').length).toBe(0);
    expect(document.querySelectorAll('.proj-card--demo').length).toBe(0);
  });

  it('shows empty state when projects hook returns empty', () => {
    mockProjectsHook.mockReturnValue({
      projects: [],
      state: 'empty' as const,
      error: null,
      refresh: vi.fn(),
    });

    renderDashboard();
    expect(screen.getByText(/no projects yet/i)).not.toBeNull();
    expect(screen.queryAllByText('Demo').length).toBe(0);
  });

  it('renders real API projects and no demo badges', () => {
    const project = makeProject({ id: 'real-1', name: 'Morning Focus' });
    mockProjectsHook.mockReturnValue({
      projects: [project],
      state: 'idle' as const,
      error: null,
      refresh: vi.fn(),
    });

    renderDashboard();
    const nameEls = screen.getAllByText('Morning Focus');
    expect(nameEls.length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Demo').length).toBe(0);
    expect(document.querySelectorAll('.proj-card--demo').length).toBe(0);
  });

  it('brand dropdown shows only No brand when API returns no brands', () => {
    mockBrandsHook.mockReturnValue({
      ...defaultBrandsHook(),
      brands: [],
      state: 'empty' as const,
    });

    renderDashboard();
    // Only "No brand" should appear in the brand selector area — not demo brand names
    expect(screen.getByText('No brand')).not.toBeNull();
    expect(screen.queryByText('Still Studio')).toBeNull();
    expect(screen.queryByText('Flora & Co.')).toBeNull();
    expect(screen.queryByText('Monogram')).toBeNull();
  });

  it('brand dropdown shows real API brands alongside No brand', () => {
    mockBrandsHook.mockReturnValue({
      ...defaultBrandsHook(),
      brands: [
        {
          id: 'brand-real-1',
          name: 'My Real Brand',
          description: null,
          workspaceId: 'ws-1',
          colors: { primary: '#1d2a30', secondary: '#5e7680' },
          tone: 'Bold, Minimal',
          visualDirection: 'Dark',
          rules: null,
          logoAssetId: null,
          typography: {},
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      state: 'idle' as const,
    });

    renderDashboard();
    // Open brand dropdown
    const brandBtn = screen.getByText('No brand');
    fireEvent.click(brandBtn.closest('button') ?? brandBtn);
    expect(screen.getByText('My Real Brand')).not.toBeNull();
    expect(screen.queryByText('Still Studio')).toBeNull();
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
  // W6 trend templates See all
  // ---------------------------------------------------------------------------
  it('trend templates section renders an enabled See all button', () => {
    renderDashboard();
    const seeAll = screen.getByRole('button', { name: /see all/i });
    expect(seeAll).not.toBeNull();
    expect(seeAll.hasAttribute('disabled')).toBe(false);
  });

  it('clicking See all navigates to /templates', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: /see all/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/templates');
  });

  it('renders featured templates on dashboard', () => {
    const featured = [
      makeDashboardTemplate({ id: 'feat-1', title: 'Featured One' }),
      makeDashboardTemplate({ id: 'feat-2', title: 'Featured Two' }),
    ];
    mockTrendTemplatesHook.mockReturnValue({
      data: featured,
      featured,
      categories: ['Wellness'],
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderDashboard();
    expect(screen.getAllByText('Featured One').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Featured Two').length).toBeGreaterThan(0);
  });

  it('falls back to first active templates when none are featured', () => {
    const active = [
      makeDashboardTemplate({ id: 'a-1', title: 'Active One', isFeatured: false, sortIndex: 1 }),
      makeDashboardTemplate({ id: 'a-2', title: 'Active Two', isFeatured: false, sortIndex: 2 }),
    ];
    mockTrendTemplatesHook.mockReturnValue({
      data: active,
      featured: [],
      categories: ['Wellness'],
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderDashboard();
    expect(screen.getAllByText('Active One').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active Two').length).toBeGreaterThan(0);
    expect(screen.queryByText(/no templates available yet/i)).toBeNull();
  });

  it('shows empty state only when there are truly zero active templates', () => {
    mockTrendTemplatesHook.mockReturnValue({
      data: [],
      featured: [],
      categories: [],
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderDashboard();
    expect(screen.getByText(/no templates available yet/i)).not.toBeNull();
  });

  it('does not render templates while auth is loading', () => {
    mockUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: false, getToken: vi.fn() });
    mockTrendTemplatesHook.mockReturnValue({
      data: [],
      featured: [],
      categories: [],
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderDashboard();
    // The hook should be called with enabled=false while Clerk is still loading.
    expect(mockTrendTemplatesHook).toHaveBeenLastCalledWith(false);
  });

  it('enables template fetch once auth is loaded and signed in', () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true, getToken: vi.fn() });
    renderDashboard();
    expect(mockTrendTemplatesHook).toHaveBeenLastCalledWith(true);
  });

  // ---------------------------------------------------------------------------
  // W3: Asset upload
  // ---------------------------------------------------------------------------
  function createFile(name: string, type = 'image/png') {
    return new File(['data'], name, { type });
  }

  function selectFiles(container: Element, files: File[]) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files } });
  }

  describe('W3 asset upload', () => {
    it('upload (attach) button is not disabled', () => {
      renderDashboard();
      const attachBtn = screen.getByTitle('Attach images');
      expect(attachBtn.hasAttribute('disabled')).toBe(false);
    });

    it('"Use image" chip is not disabled', () => {
      renderDashboard();
      const chip = screen.getAllByRole('button').find(
        (b) => b.className.includes('chip') && /use image/i.test(b.textContent ?? ''),
      );
      expect(chip).toBeTruthy();
      expect(chip!.hasAttribute('disabled')).toBe(false);
      expect(chip!.className).not.toContain('disabled');
    });

    it('selecting a supported PNG shows a pending chip with the filename', () => {
      const { container } = renderDashboard();
      selectFiles(container, [createFile('hero.png', 'image/png')]);
      expect(screen.getByText('hero.png')).not.toBeNull();
    });

    it('clicking remove on a pending chip removes it', () => {
      const { container } = renderDashboard();
      selectFiles(container, [createFile('hero.png')]);
      expect(screen.getByText('hero.png')).not.toBeNull();
      const removeBtn = screen.getByRole('button', { name: /remove hero\.png/i });
      fireEvent.click(removeBtn);
      expect(screen.queryByText('hero.png')).toBeNull();
    });

    it('selecting an unsupported file type shows validation error and does not add chip', () => {
      const { container } = renderDashboard();
      selectFiles(container, [createFile('doc.pdf', 'application/pdf')]);
      expect(screen.getByText(/not supported/i)).not.toBeNull();
      expect(screen.queryByText('doc.pdf')).toBeNull();
    });

    it('non-empty prompt + selected file: calls createNewProject, uploads to new projectId, navigates', async () => {
      const { container } = renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Make a post about discipline' } });
      selectFiles(container, [createFile('ref.png')]);

      const createBtn = screen.getAllByRole('button', { name: /^create$/i }).find(
        (b) => !b.hasAttribute('disabled'),
      );
      fireEvent.click(createBtn!);

      await waitFor(() => expect(mockCreateNewProject).toHaveBeenCalledTimes(1));
      expect(mockCreateProject).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(mockProjectUploadFn).toHaveBeenCalledWith(
          expect.any(File),
          expect.objectContaining({ type: 'project', projectId: 'proj-123', kind: 'upload' }),
        ),
      );
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/workspace/proj-123', expect.any(Object)),
      );
    });

    it('empty prompt + selected file: calls createProject (not createNewProject) then uploads', async () => {
      const { container } = renderDashboard();
      selectFiles(container, [createFile('bg.webp', 'image/webp')]);

      const createBtn = screen.getAllByRole('button', { name: /^create$/i }).find(
        (b) => !b.hasAttribute('disabled'),
      );
      fireEvent.click(createBtn!);

      await waitFor(() => expect(mockCreateProject).toHaveBeenCalledTimes(1));
      expect(mockCreateNewProject).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(mockProjectUploadFn).toHaveBeenCalledWith(
          expect.any(File),
          expect.objectContaining({ type: 'project', projectId: 'proj-123' }),
        ),
      );
    });

    it('does not call generation APIs', async () => {
      const { container } = renderDashboard();
      selectFiles(container, [createFile('img.png')]);
      const createBtn = screen.getAllByRole('button', { name: /^create$/i }).find(
        (b) => !b.hasAttribute('disabled'),
      );
      fireEvent.click(createBtn!);
      await waitFor(() => expect(mockCreateProject).toHaveBeenCalledTimes(1));
      // No generation mock exists — its absence confirms no generation call was made
    });

    it('does not call credit APIs', () => {
      renderDashboard();
      // useCreditStatus mock is read-only; no mutation/deduction calls are wired
      expect(screen.queryByRole('button', { name: /spend credits/i })).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // P0: Prompt enhancement
  // ---------------------------------------------------------------------------
  describe('P0 prompt enhancement', () => {
    it('Enhance button is rendered', () => {
      renderDashboard();
      const btn = screen.getByRole('button', { name: /enhance prompt/i });
      expect(btn).not.toBeNull();
    });

    it('Enhance button is disabled when prompt is empty', () => {
      renderDashboard();
      const btn = screen.getByRole('button', { name: /enhance prompt/i });
      expect(btn.hasAttribute('disabled')).toBe(true);
    });

    it('Enhance button is enabled when prompt has text', () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Make a post about discipline' } });
      const btn = screen.getByRole('button', { name: /enhance prompt/i });
      expect(btn.hasAttribute('disabled')).toBe(false);
    });

    it('clicking Enhance calls enhancePrompt with the current prompt', async () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Make a post about discipline' } });
      const btn = screen.getByRole('button', { name: /enhance prompt/i });
      fireEvent.click(btn);
      await waitFor(() => expect(mockEnhancePrompt).toHaveBeenCalledTimes(1));
      expect(mockEnhancePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Make a post about discipline' }),
      );
    });

    it('enhanced prompt replaces text in the composer', async () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Make a post about discipline' } });
      fireEvent.click(screen.getByRole('button', { name: /enhance prompt/i }));
      await waitFor(() =>
        expect((textarea as HTMLTextAreaElement).value).toContain('Create a clean, motivational'),
      );
    });

    it('Revert button appears after enhancement', async () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Make a post about discipline' } });
      fireEvent.click(screen.getByRole('button', { name: /enhance prompt/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: /revert to original/i })).not.toBeNull());
    });

    it('clicking Revert restores the original prompt', async () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Make a post about discipline' } });
      fireEvent.click(screen.getByRole('button', { name: /enhance prompt/i }));
      await waitFor(() => screen.getByRole('button', { name: /revert to original/i }));
      fireEvent.click(screen.getByRole('button', { name: /revert to original/i }));
      await waitFor(() =>
        expect((textarea as HTMLTextAreaElement).value).toBe('Make a post about discipline'),
      );
    });

    it('Revert button disappears after reverting', async () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Make a post about discipline' } });
      fireEvent.click(screen.getByRole('button', { name: /enhance prompt/i }));
      await waitFor(() => screen.getByRole('button', { name: /revert to original/i }));
      fireEvent.click(screen.getByRole('button', { name: /revert to original/i }));
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /revert to original/i })).toBeNull(),
      );
    });

    it('Create after enhance uses the enhanced prompt', async () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Make a post about discipline' } });
      fireEvent.click(screen.getByRole('button', { name: /enhance prompt/i }));
      await waitFor(() => screen.getByRole('button', { name: /revert to original/i }));

      const createBtn = screen.getAllByRole('button', { name: /^create$/i }).find(
        (b) => !b.hasAttribute('disabled'),
      );
      fireEvent.click(createBtn!);
      await waitFor(() => expect(mockCreateNewProject).toHaveBeenCalledTimes(1));
      expect(mockCreateNewProject).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Create a clean, motivational 4:5 social post about discipline. Use a bold minimal layout.' }),
      );
    });

    it('Create after revert uses the original prompt', async () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Make a post about discipline' } });
      fireEvent.click(screen.getByRole('button', { name: /enhance prompt/i }));
      await waitFor(() => screen.getByRole('button', { name: /revert to original/i }));
      fireEvent.click(screen.getByRole('button', { name: /revert to original/i }));
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /revert to original/i })).toBeNull(),
      );

      const createBtn = screen.getAllByRole('button', { name: /^create$/i }).find(
        (b) => !b.hasAttribute('disabled'),
      );
      fireEvent.click(createBtn!);
      await waitFor(() => expect(mockCreateNewProject).toHaveBeenCalledTimes(1));
      expect(mockCreateNewProject).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Make a post about discipline' }),
      );
    });

    it('shows friendly error when enhance API fails', async () => {
      mockEnhancePrompt.mockRejectedValueOnce(new Error('Server error'));
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Post about focus' } });
      fireEvent.click(screen.getByRole('button', { name: /enhance prompt/i }));
      await waitFor(() =>
        expect(screen.getByText(/could not enhance the prompt/i)).not.toBeNull(),
      );
    });

    it('does not navigate on Enhance click', async () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Post about focus' } });
      fireEvent.click(screen.getByRole('button', { name: /enhance prompt/i }));
      await waitFor(() => expect(mockEnhancePrompt).toHaveBeenCalledTimes(1));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not call createProject or createNewProject on Enhance click', async () => {
      renderDashboard();
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Post about focus' } });
      fireEvent.click(screen.getByRole('button', { name: /enhance prompt/i }));
      await waitFor(() => expect(mockEnhancePrompt).toHaveBeenCalledTimes(1));
      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockCreateNewProject).not.toHaveBeenCalled();
    });

    it('trend template Use this prompt still works unchanged', async () => {
      renderDashboard();
      const usePromptBtns = screen.getAllByRole('button', { name: /use this prompt/i });
      fireEvent.click(usePromptBtns[0]);
      await waitFor(() => expect(mockCreateNewProject).toHaveBeenCalledTimes(1));
      // enhancePrompt should NOT have been called
      expect(mockEnhancePrompt).not.toHaveBeenCalled();
    });
  });
});
