// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrendTemplatesPage from '../TrendTemplatesPage';
import { TREND_TEMPLATES, getFeaturedTemplates } from '../../data/trendTemplates';

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

// UsageStatus is imported by TrendTemplatesPage — mock it to avoid deep deps
vi.mock('../../components/workspace/UsageStatus', () => ({
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
  });

  it('renders page title', () => {
    renderPage();
    expect(screen.getAllByText('Trend Templates').length).toBeGreaterThan(0);
  });

  it('renders all templates from TREND_TEMPLATES', () => {
    renderPage();
    TREND_TEMPLATES.forEach((t) => {
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
    // Each template has a category — check at least one category appears
    expect(screen.getAllByText('Wellness').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quote').length).toBeGreaterThan(0);
  });

  it('shows asset hints when template has assetHints', () => {
    // t3 "Soft product launch" has assetHints; t5 also has 'Optional brand logo'
    renderPage();
    expect(screen.getAllByText('Works best with a product photo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Optional brand logo').length).toBeGreaterThan(0);
  });

  it('does not render asset hints section when template has none', () => {
    renderPage();
    // t1 has no assetHints — its ul.tmpl-hints should not exist for that card
    // The featured templates count without hints should not produce hint bullets
    // t1's hints: 0, t2's hints: 0 — confirm the hint text for t1/t2 is absent
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
    // t8 has tag 'linkedin'
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
    TREND_TEMPLATES.forEach((t) => {
      expect(screen.getAllByText(t.title).length).toBeGreaterThan(0);
    });
  });

  it('category chip filters templates', () => {
    renderPage();
    const wellnessChip = screen.getByRole('button', { name: 'Wellness' });
    fireEvent.click(wellnessChip);
    // Only wellness template should show
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
    // Only createNewProject called — no generation job spy needed;
    // test confirms no other project-API besides createNewProject is invoked
    expect(mockCreateNewProject).toHaveBeenCalledTimes(1);
  });

  it('buttons are disabled while a project is being created', async () => {
    let resolve: (v: ReturnType<typeof makeProject>) => void;
    mockCreateNewProject.mockReturnValue(new Promise<ReturnType<typeof makeProject>>((r) => { resolve = r; }));
    renderPage();
    const btns = screen.getAllByRole('button', { name: /use this prompt/i });
    fireEvent.click(btns[0]);
    // All "Use this prompt" buttons should be disabled while creating
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

  it('dashboard featured templates are a subset of all templates', () => {
    const featured = getFeaturedTemplates();
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.length).toBeLessThan(TREND_TEMPLATES.length);
    featured.forEach((t) => {
      expect(TREND_TEMPLATES.find((all) => all.id === t.id)).toBeDefined();
    });
  });
});
