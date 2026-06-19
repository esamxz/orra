import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/trendTemplates.css';
import '../styles/creditStatusActions.css';
import { Icon } from '../data/icons';
import { useCreditStatus } from '../hooks/useCreditStatus';
import { useTrendTemplates } from '../hooks/useTrendTemplates';
import CreditStatusActions from '../components/billing/CreditStatusActions';
import { createNewProject } from '../api/projects';
import { ApiClientError } from '../api/errors';
import type { TrendTemplateDto } from '../api/types';
import { TrendTemplateCard } from '../components/trends/TrendTemplateCard';

const DEFAULT_RATIO = { name: '4:5' as const, w: 1080, h: 1350 };

export default function TrendTemplatesPage() {
  const navigate = useNavigate();
  const { data: creditData, loading: creditLoading } = useCreditStatus();
  const { data: allTemplates, categories: apiCategories, loading, error, reload } = useTrendTemplates(true);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const categories = useMemo(() => ['All', ...apiCategories], [apiCategories]);

  const filtered = useMemo(() => {
    let result = allTemplates;
    if (activeCategory !== 'All') {
      result = result.filter((t) => t.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [allTemplates, activeCategory, search]);

  const handleUseTemplate = async (template: TrendTemplateDto) => {
    if (creating) return;
    setCreating(template.id);
    setCreateError(null);
    try {
      // All trend templates are single-post templates.
      const result = await createNewProject({
        name: template.title,
        type: 'post',
        ratio: DEFAULT_RATIO,
        prompt: template.prompt,
        sourceTemplateId: template.id,
      });
      navigate(`/workspace/${result.project.id}`, {
        state: {
          firstPrompt: template.prompt,
          mode: 'single',
          ratio: template.ratioHint ?? '4:5',
        },
      });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Could not start project. Please try again.';
      setCreateError(msg);
      setCreating(null);
    }
  };

  const handleBuyCredits = () => navigate('/billing/credits');
  const handleUpgrade = () => navigate('/billing/plan');

  return (
    <div className="tmpl-page">
      {/* Top bar */}
      <header className="tmpl-topbar">
        <div className="tmpl-topbar-left">
          <button
            className="tmpl-back-btn"
            onClick={() => navigate('/')}
            aria-label="Back to dashboard"
          >
            <Icon.arrowLeft s={15} />
            Dashboard
          </button>
        </div>
        <div className="tmpl-topbar-center">
          <span className="tmpl-topbar-title">Trend Templates</span>
        </div>
        <div className="tmpl-topbar-right">
          <CreditStatusActions
            compact
            remaining={creditData?.balance.totalRemaining ?? null}
            monthlyCredits={creditData?.balance.monthlyRemaining ?? null}
            loading={creditLoading}
            onBuyCredits={handleBuyCredits}
            onUpgrade={handleUpgrade}
          />
        </div>
      </header>

      {/* Page header */}
      <div className="tmpl-header">
        <h1>Trend Templates</h1>
        <p>
          Prompt starters with visual direction. Pick one, tweak the prompt if you like, and Orra
          will plan the rest — nothing generates until you approve.
        </p>
      </div>

      {/* Controls */}
      <div className="tmpl-controls">
        {/* Search */}
        <div className="tmpl-search-wrap">
          <span className="tmpl-search-icon">
            <Icon.search s={14} />
          </span>
          <input
            type="search"
            className="tmpl-search"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search templates"
          />
        </div>

        {/* Category chips */}
        <div className="tmpl-cats" role="group" aria-label="Filter by category">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`tmpl-cat${activeCategory === cat ? ' active' : ''}`}
              onClick={() => setActiveCategory(cat)}
              aria-pressed={activeCategory === cat}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Template grid */}
      <div className="tmpl-body">
        {createError && (
          <p style={{ color: 'var(--error, #c0392b)', fontSize: 13, marginBottom: 16 }}>
            {createError}
          </p>
        )}

        {loading && allTemplates.length === 0 && (
          <p className="tmpl-status">Loading templates…</p>
        )}

        {error && !loading && (
          <div className="tmpl-empty">
            <p>Could not load templates.</p>
            <button className="btn btn-ghost btn-sm" onClick={reload}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="tmpl-empty">
            <p>No templates match your search.</p>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setSearch(''); setActiveCategory('All'); }}
            >
              Clear filters
            </button>
          </div>
        )}

        {!error && filtered.length > 0 && (
          <div className="tmpl-grid">
            {filtered.map((t) => (
              <TrendTemplateCard
                key={t.id}
                title={t.title}
                label={t.category}
                previewUrl={t.previewUrl}
                size="md"
                disabled={!!creating}
                onClick={() => handleUseTemplate(t)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
