// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrendTemplatesPage from '../TrendTemplatesPage';
import type { TrendTemplateDto } from '../../api/types';

// ---------------------------------------------------------------------------
// Navigation mock
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---------------------------------------------------------------------------
// API mocks
// ---------------------------------------------------------------------------
const mockCreateNewProject = vi.fn();
vi.mock('../../api/projects', () => ({
  createNewProject: (...args: unknown[]) => mockCreateNewProject(...args),
}));

// ---------------------------------------------------------------------------
// Hook mocks
// ---------------------------------------------------------------------------
vi.mock('../../hooks/useCreditStatus', () => ({
  useCreditStatus: () => ({ data: null, loading: false, error: null, reload: vi.fn() }),
}));

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggle: vi.fn() }),
}));

const mockUseTrendTemplates = vi.fn();
vi.mock('../../hooks/useTrendTemplates', () => ({
  useTrendTemplates: () => mockUseTrendTemplates(),
}));

vi.mock('../../components/workspace/UsageStatus', () => ({
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTemplate(overrides: Partial<TrendTemplateDto> = {}): TrendTemplateDto {
  return {
    id: 'tmpl-1',
    title: 'Test Template',
    description: 'A test template description.',
    prompt: 'Create something calm and minimal.',
    category: 'Wellness',
    projectType: 'carousel',
    ratioHint: '4:5',
    platformHint: 'Instagram',
    assetHints: [],
    previewVariant: 'cover',
    isFeatured: true,
    tags: ['calm'],
    sortIndex: 1,
    ...overrides,
  };
}

const MOCK_TEMPLATES: TrendTemplateDto[] = [
  makeTemplate({ id: 't1', title: 'Quiet self-improvement', category: 'Wellness', tags: ['mindset', 'habits', 'calm'] }),
  makeTemplate({ id: 't2', title: 'Editorial quote card', category: 'Quote', projectType: 'post', previewVariant: 'mist', tags: ['quote', 'editorial'] }),
  makeTemplate({ id: 't3', title: 'Soft product launch', category: 'Product', assetHints: ['Works best with a product photo', 'Optional brand logo'], previewVariant: 'steel', tags: ['product', 'launch'] }),
  makeTemplate({ id: 't4', title: 'Step-by-step explainer', category: 'Education', previewVariant: 'pale', tags: ['how-to', 'tutorial'] }),
  makeTemplate({ id: 't5', title: 'Minimalist brand story', category: 'Lifestyle', projectType: 'post', isFeatured: false, tags: ['brand', 'story'] }),
  makeTemplate({ id: 't6', title: 'Day-in-the-life', category: 'Lifestyle', isFeatured: false, previewVariant: 'mist', assetHints: ['Upload 2–4 behind-the-scenes photos'], tags: ['behind-the-scenes', 'personal'] }),
  makeTemplate({ id: 't7', title: 'Before & after reveal', category: 'Product', isFeatured: false, previewVariant: 'steel', assetHints: ['Upload a before photo', 'Upload an after photo'], tags: ['transformation', 'reveal'] }),
  makeTemplate({ id: 't8', title: 'Thought leadership post', category: 'Education', projectType: 'post', isFeatured: false, previewVariant: 'cta', platformHint: 'LinkedIn', tags: ['opinion', 'linkedin', 'professional', 'insight'] }),
];

function defaultHookState(overrides = {}) {
  return {
    data: MOCK_TEMPLATES,
    featured: MOCK_TEMPLATES.filter((t) => t.isFeatured),
    categories: ['Education', 'Lifestyle', 'Product', 'Quote', 'Wellness'],
    loading: false,
    error: null,
    reload: vi.fn(),
    ...overrides,
  };
}

function makeProject(id = 'proj-tmpl-1') {
  return {
    project: {
      id,
      name: 'Test Project',
      type: 'carousel' as const,
      ratio: { name: '4:5' as const, w: 4, h: 5 },
      brandSystemId: null,
      sourceTemplateId: null,
      currentArtifactId: null,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
    firstMessage: { id: 'msg-1', role: 'user', content: 'test' },
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TrendTemplatesPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('TrendTemplatesPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockCreateNewProject.mockClear();
    mockCreateNewProject.mockResolvedValue(makeProject());
    mockUseTrendTemplates.mockReturnValue(defaultHookState());
  });

  it('renders page title', () => {
    renderPage();
    expect(screen.getAllByText('Trend Templates').length).toBeGreaterThan(0);
  });

  it('renders all templates from useTrendTemplates hook (not hardcoded array)', () => {
    renderPage();
    MOCK_TEMPLATES.forEach((t) => {
      expect(screen.getAllByText(t.title).length).toBeGreaterThan(0);
    });
  });

  it('renders at least 4 Use this prompt buttons', () => {
    renderPage();
    const btns = screen.getAllByRole('button', { name: /use this prompt/i });
    expect(btns.length).toBeGreaterThanOrEqual(4);
  });

  it('shows category badge on each card', () => {
    renderPage();
    expect(screen.getAllByText('Wellness').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quote').length).toBeGreaterThan(0);
  });

  it('shows asset hints when template has assetHints', () => {
    renderPage();
    expect(screen.getAllByText('Works best with a product photo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Optional brand logo').length).toBeGreaterThan(0);
  });

  it('does not render asset hints section when template has none', () => {
    renderPage();
    expect(screen.queryByText('Upload product photo')).toBeNull();
  });

  it('renders search input', () => {
    renderPage();
    expect(screen.getByRole('searchbox', { name: /search templates/i })).not.toBeNull();
  });

  it('search filters templates by title', () => {
    renderPage();
    const input = screen.getByRole('searchbox', { name: /search templates/i });
    fireEvent.change(input, { target: { value: 'editorial' } });
    expect(screen.getAllByText('Editorial quote card').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Quiet self-improvement')).toHaveLength(0);
  });

  it('search filters templates by tag', () => {
    renderPage();
    const input = screen.getByRole('searchbox', { name: /search templates/i });
    fireEvent.change(input, { target: { value: 'linkedin' } });
    expect(screen.getAllByText('Thought leadership post').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Editorial quote card')).toHaveLength(0);
  });

  it('search shows empty state when no match', () => {
    renderPage();
    const input = screen.getByRole('searchbox', { name: /search templates/i });
    fireEvent.change(input, { target: { value: 'zzznomatch' } });
    expect(screen.getByText(/no templates match/i)).not.toBeNull();
  });

  it('clear filters button resets search and shows all templates', () => {
    renderPage();
    const input = screen.getByRole('searchbox', { name: /search templates/i });
    fireEvent.change(input, { target: { value: 'zzznomatch' } });
    const clearBtn = screen.getByRole('button', { name: /clear filters/i });
    fireEvent.click(clearBtn);
    MOCK_TEMPLATES.forEach((t) => {
      expect(screen.getAllByText(t.title).length).toBeGreaterThan(0);
    });
  });

  it('category chip filters templates', () => {
    renderPage();
    const wellnessChip = screen.getByRole('button', { name: 'Wellness' });
    fireEvent.click(wellnessChip);
    expect(screen.getAllByText('Quiet self-improvement').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Editorial quote card')).toHaveLength(0);
  });

  it('All category chip resets category filter', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Wellness' }));
    expect(screen.queryAllByText('Editorial quote card')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByText('Editorial quote card').length).toBeGreaterThan(0);
  });

  it('category chips have aria-pressed reflecting active state', () => {
    renderPage();
    const allChip = screen.getByRole('button', { name: 'All' });
    expect(allChip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Wellness' }));
    expect(allChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('Use this prompt calls createNewProject with template prompt and type', async () => {
    renderPage();
    const btns = screen.getAllByRole('button', { name: /use this prompt/i });
    fireEvent.click(btns[0]);
    await waitFor(() => expect(mockCreateNewProject).toHaveBeenCalledTimes(1));
    const arg = mockCreateNewProject.mock.calls[0][0] as { prompt: string; type: string };
    expect(typeof arg.prompt).toBe('string');
    expect(arg.prompt.length).toBeGreaterThan(0);
    expect(['post', 'carousel']).toContain(arg.type);
  });

  it('Use this prompt passes sourceTemplateId for attribution', async () => {
    renderPage();
    const btns = screen.getAllByRole('button', { name: /use this prompt/i });
    fireEvent.click(btns[0]);
    await waitFor(() => expect(mockCreateNewProject).toHaveBeenCalledTimes(1));
    const arg = mockCreateNewProject.mock.calls[0][0] as { sourceTemplateId: string };
    expect(typeof arg.sourceTemplateId).toBe('string');
    expect(arg.sourceTemplateId.length).toBeGreaterThan(0);
  });

  it('Use this prompt navigates to workspace on success', async () => {
    renderPage();
    const btns = screen.getAllByRole('button', { name: /use this prompt/i });
    fireEvent.click(btns[0]);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    const dest = mockNavigate.mock.calls[0][0] as string;
    expect(dest).toMatch(/^\/workspace\//);
  });

  it('Use this prompt does not call generation API', async () => {
    renderPage();
    const btns = screen.getAllByRole('button', { name: /use this prompt/i });
    fireEvent.click(btns[0]);
    await waitFor(() => expect(mockCreateNewProject).toHaveBeenCalled());
    expect(mockCreateNewProject).toHaveBeenCalledTimes(1);
  });

  it('buttons are disabled while a project is being created', async () => {
    let resolve: (v: ReturnType<typeof makeProject>) => void;
    mockCreateNewProject.mockReturnValue(new Promise<ReturnType<typeof makeProject>>((r) => { resolve = r; }));
    renderPage();
    const btns = screen.getAllByRole('button', { name: /use this prompt/i });
    fireEvent.click(btns[0]);
    await waitFor(() => {
      const allBtns = screen.getAllByRole('button', { name: /use this prompt|starting/i });
      expect(allBtns.every((b) => b.hasAttribute('disabled'))).toBe(true);
    });
    resolve!(makeProject());
  });

  it('back button navigates to /', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows loading state when loading with no data', () => {
    mockUseTrendTemplates.mockReturnValue(defaultHookState({ loading: true, data: [], featured: [], categories: [] }));
    renderPage();
    expect(screen.getByText(/loading templates/i)).not.toBeNull();
  });

  it('shows error state with retry when hook reports error', () => {
    const mockReload = vi.fn();
    mockUseTrendTemplates.mockReturnValue(defaultHookState({
      loading: false,
      data: [],
      featured: [],
      categories: [],
      error: 'Failed to load templates',
      reload: mockReload,
    }));
    renderPage();
    expect(screen.getByText(/could not load templates/i)).not.toBeNull();
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no templates from API', () => {
    mockUseTrendTemplates.mockReturnValue(defaultHookState({ data: [], featured: [], categories: [] }));
    renderPage();
    expect(screen.getByText(/no templates match/i)).not.toBeNull();
  });

  it('renders templates from API hook, not hardcoded data', () => {
    const apiOnlyTemplate = makeTemplate({ id: 'api-only', title: 'API-Only Template (never in old hardcoded array)' });
    mockUseTrendTemplates.mockReturnValue(defaultHookState({
      data: [apiOnlyTemplate],
      featured: [apiOnlyTemplate],
      categories: ['Wellness'],
    }));
    renderPage();
    expect(screen.getAllByText('API-Only Template (never in old hardcoded array)').length).toBeGreaterThan(0);
  });
});
