import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/trendTemplates.css';
import { TREND_TEMPLATES, getAllCategories, type TrendTemplate } from '../data/trendTemplates';
import { CardBg } from '../data/cards';
import { Icon } from '../data/icons';
import { useCreditStatus } from '../hooks/useCreditStatus';
import UsageStatus from '../components/workspace/UsageStatus';
import { createNewProject, type CreateNewProjectInput } from '../api/projects';
import { ApiClientError } from '../api/errors';

const DEFAULT_RATIO = { name: '4:5' as const, w: 1080, h: 1350 };

export default function TrendTemplatesPage() {
  const navigate = useNavigate();
  const { data: creditData, loading: creditLoading } = useCreditStatus();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const categories = useMemo(() => ['All', ...getAllCategories()], []);

  const filtered = useMemo(() => {
    let result = TREND_TEMPLATES;
    if (activeCategory !== 'All') {
      result = result.filter((t) => t.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [activeCategory, search]);

  const handleUseTemplate = async (template: TrendTemplate) => {
    if (creating) return;
    setCreating(template.id);
    setCreateError(null);
    try {
      const input: CreateNewProjectInput = {
        name: template.title,
        type: template.projectType,
        ratio: DEFAULT_RATIO,
        prompt: template.prompt,
      };
      const result = await createNewProject(input);
      navigate(`/workspace/${result.project.id}`, {
        state: {
          firstPrompt: template.prompt,
          mode: template.projectType === 'carousel' ? 'carousel' : 'single',
          ratio: template.ratioHint ?? '4:5',
        },
      });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Could not start project. Please try again.';
      setCreateError(msg);
      setCreating(null);
    }
  };

  return (
    <div className="tmpl-page">
      {/* Top bar */}
      <header className="tmpl-topbar">
        <button
          className="tmpl-back-btn"
          onClick={() => navigate('/')}
          aria-label="Back to dashboard"
        >
          <Icon.arrowLeft s={15} />
          Dashboard
        </button>
        <span className="tmpl-topbar-spacer" />
        <span className="tmpl-topbar-title">Trend Templates</span>
        <span className="tmpl-topbar-spacer" />
        <UsageStatus
          status={creditData}
          loading={creditLoading}
          error={null}
        />
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

        {filtered.length === 0 ? (
          <div className="tmpl-empty">
            <p>No templates match your search.</p>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setSearch(''); setActiveCategory('All'); }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="tmpl-grid">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                isCreating={creating === t.id}
                disabled={!!creating}
                onUse={handleUseTemplate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: TrendTemplate;
  isCreating: boolean;
  disabled: boolean;
  onUse: (template: TrendTemplate) => void;
}

function TemplateCard({ template: t, isCreating, disabled, onUse }: TemplateCardProps) {
  const titleColor = t.previewVariant === 'pale' ? '#1d2a30' : '#f1f4f4';

  return (
    <article className="tmpl-card">
      {/* Preview */}
      <div className="tmpl-preview">
        <CardBg variant={t.previewVariant} />
        <span className="tmpl-cat-badge">{t.category}</span>
        <div className="tmpl-preview-title" style={{ color: titleColor }}>
          {t.title}
        </div>
      </div>

      {/* Body */}
      <div className="tmpl-card-body">
        <h3>{t.title}</h3>
        <p className="tmpl-card-desc">{t.description}</p>

        {t.assetHints.length > 0 && (
          <ul className="tmpl-hints" aria-label="Asset hints">
            {t.assetHints.map((hint) => (
              <li key={hint} className="tmpl-hint">
                {hint}
              </li>
            ))}
          </ul>
        )}

        <div className="tmpl-foot">
          <span className="tmpl-platform-badge">
            {t.platformHint ? `${t.platformHint} · ` : ''}{t.ratioHint ?? t.projectType}
          </span>
          <button
            className="btn btn-primary btn-sm"
            disabled={disabled}
            onClick={() => onUse(t)}
          >
            {isCreating ? (
              'Starting…'
            ) : (
              <><Icon.spark s={14} /> Use this prompt</>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
