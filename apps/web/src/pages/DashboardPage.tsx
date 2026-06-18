import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserButton, useAuth } from '@clerk/clerk-react';
import '../styles/dashboard.css';
import { Icon } from '../data/icons';

const CLERK_CONFIGURED = !!(
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
);
import { CardBg } from '../data/cards';
import { TrendTemplateCard } from '../components/trends/TrendTemplateCard';
import { useTrendTemplates } from '../hooks/useTrendTemplates';
import CreateBrandSystemModal from '../components/brand/CreateBrandSystemModal';
import { useTheme } from '../hooks/useTheme';
import { useCreditStatus } from '../hooks/useCreditStatus';
import { useAssetUpload } from '../hooks/useAssetUpload';
import UsageStatus from '../components/workspace/UsageStatus';
import { useProjects } from '../hooks/useProjects';
import { useBrandSystems } from '../hooks/useBrandSystems';
import { brandSystemDtoToDisplayBrand, paletteToColors } from '../components/brand/brandDisplayUtils';
import { createProject, createNewProject } from '../api/projects';
import { enhancePrompt } from '../api/prompts';
import { ApiClientError } from '../api/errors';

const RATIOS = [
  { id: '1:1',  w: 20, h: 20, label: '1:1' },
  { id: '4:5',  w: 17, h: 21, label: '4:5' },
  { id: '9:16', w: 13, h: 22, label: '9:16' },
  { id: '16:9', w: 24, h: 14, label: '16:9' },
];

function MiniThumb({ variant, label }: { variant: string; label?: string }) {
  return (
    <div className="proj-thumb" style={{ containerType: 'inline-size' }}>
      <CardBg variant={variant} />
      {label && (
        <div style={{ position: 'absolute', left: 14, bottom: 14, right: 14, color: variant === 'pale' ? '#1d2a30' : '#f1f4f4', fontFamily: 'var(--font-display)', fontSize: '7.5cqw', fontWeight: 500, lineHeight: 1.05, opacity: 0.96 }}>
          {label}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState<'single' | 'carousel'>('carousel');
  const [ratio, setRatio] = useState('4:5');
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [brandUploadStatus, setBrandUploadStatus] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFileUrls, setPendingFileUrls] = useState<string[]>([]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const brandUpload = useAssetUpload();
  const projectAssetUpload = useAssetUpload();

  // ---------------------------------------------------------------------------
  // Brand systems from API
  // ---------------------------------------------------------------------------
  const { brands: apiBrands, createBrand } = useBrandSystems();

  const displayBrands = useMemo(() => {
    const noBrand = {
      id: '__no-brand__',
      name: 'No brand',
      initial: '—',
      logoBg: 'var(--inset)',
      logoFg: 'var(--muted)',
      colors: ['#c8d1d8', '#eef1f1'],
      fonts: ['—'],
      tone: [],
    };
    const real = apiBrands.map(brandSystemDtoToDisplayBrand);
    return [noBrand, ...real];
  }, [apiBrands]);

  const selectedBrand = useMemo(
    () => displayBrands.find((b) => b.id === selectedBrandId) ?? displayBrands[0],
    [displayBrands, selectedBrandId],
  );

  // ---------------------------------------------------------------------------
  // Auth — the dashboard route is protected, but we still gate the template fetch
  // until Clerk has loaded and confirmed the user is signed in. This prevents
  // firing an unauthenticated API call on first mount.
  // ---------------------------------------------------------------------------
  const { isLoaded, isSignedIn } = useAuth();
  const templatesEnabled = isLoaded && isSignedIn;

  // ---------------------------------------------------------------------------
  // Credits and projects
  // ---------------------------------------------------------------------------
  const { data: creditData, loading: creditLoading, error: creditError } = useCreditStatus();
  const { projects: apiProjects, state: projectsState } = useProjects('recent');
  const {
    data: allTemplates,
    featured: featuredTemplates,
    loading: templatesLoading,
  } = useTrendTemplates(templatesEnabled);

  // ---------------------------------------------------------------------------
  // Dashboard templates: prefer featured, fall back to first 4 active
  // ---------------------------------------------------------------------------
  const dashboardTemplates = useMemo(() => {
    const source = featuredTemplates.length > 0 ? featuredTemplates : allTemplates;
    return source.slice(0, 4);
  }, [featuredTemplates, allTemplates]);

  // ---------------------------------------------------------------------------
  // Auto-grow textarea
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(72, el.scrollHeight) + 'px';
  }, [prompt]);

  useEffect(() => {
    const urls = pendingFiles.map((file) => URL.createObjectURL(file));
    setPendingFileUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pendingFiles]);

  // ---------------------------------------------------------------------------
  // Create project and navigate to workspace
  // ---------------------------------------------------------------------------
  const handleCreate = async (
    overrides: { prefill?: string; sourceTemplateId?: string; projectType?: 'post' | 'carousel' } = {}
  ) => {
    setCreateLoading(true);
    setCreateError(null);
    setAssetError(null);

    try {
      const activePrompt = (overrides.prefill ?? prompt).trim();
      const selectedRatio = RATIOS.find((r) => r.id === ratio) ?? RATIOS[1];
      const projectType: 'post' | 'carousel' = overrides.projectType ?? (type === 'single' ? 'post' : 'carousel');
      const projectName = projectType === 'carousel' ? 'Untitled carousel' : 'Untitled post';
      const brandArgs = selectedBrandId && selectedBrandId !== '__no-brand__' ? { brandSystemId: selectedBrandId } : {};
      const templateArgs = overrides.sourceTemplateId ? { sourceTemplateId: overrides.sourceTemplateId } : {};
      const baseArgs = {
        name: projectName,
        type: projectType,
        ratio: { name: selectedRatio.id, w: selectedRatio.w, h: selectedRatio.h },
        ...brandArgs,
        ...templateArgs,
      };

      let project;
      if (activePrompt) {
        const result = await createNewProject({ ...baseArgs, prompt: activePrompt });
        project = result.project;
      } else {
        project = await createProject(baseArgs);
      }

      if (pendingFiles.length > 0) {
        await uploadPendingFiles(project.id);
      }

      navigate(`/workspace/${project.id}`, {
        state: {
          mode: projectType === 'carousel' ? 'carousel' : 'single',
          ratio,
          brand: selectedBrand,
          currentArtifactId: project.currentArtifactId,
          projectBrandSystemId: project.brandSystemId,
          ...(activePrompt ? { prefill: activePrompt } : {}),
        },
      });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Could not create the project. Please try again.';
      setCreateError(msg);
      setCreateLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Prompt enhancement — free, no project created, no credits reserved
  // ---------------------------------------------------------------------------
  const handleEnhance = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setEnhanceError('Add a prompt first before enhancing.');
      return;
    }
    setIsEnhancing(true);
    setEnhanceError(null);
    try {
      const res = await enhancePrompt({
        prompt: trimmed,
        selectedType: type === 'single' ? 'single_post' : 'carousel',
        aspectRatio: ratio || undefined,
        brandSystemId: selectedBrandId && selectedBrandId !== '__no-brand__' ? selectedBrandId : undefined,
        hasAssets: pendingFiles.length > 0,
        assetCount: pendingFiles.length > 0 ? pendingFiles.length : undefined,
      });
      setOriginalPrompt(trimmed);
      setPrompt(res.enhancedPrompt);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Could not enhance the prompt. Please try again.';
      setEnhanceError(msg);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleRevert = () => {
    if (originalPrompt !== null) {
      setPrompt(originalPrompt);
      setOriginalPrompt(null);
      setEnhanceError(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Open an existing project (no creation)
  // ---------------------------------------------------------------------------
  const openProject = (project: typeof apiProjects[number]) => {
    const projectBrand = project.brandSystemId
      ? displayBrands.find((b) => b.id === project.brandSystemId)
      : displayBrands[0];
    navigate(`/workspace/${project.id}`, {
      state: {
        mode: project.type === 'carousel' ? 'carousel' : 'single',
        ratio: project.ratio.name,
        brand: projectBrand ?? displayBrands[0],
        projectName: project.name,
        currentArtifactId: project.currentArtifactId,
        projectBrandSystemId: project.brandSystemId,
      },
    });
  };

  // ---------------------------------------------------------------------------
  // W3: pending file staging helpers
  // ---------------------------------------------------------------------------
  const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  const validateAndStageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const valid: File[] = [];
    let errorMsg: string | null = null;
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        errorMsg = `"${file.name}" is not supported. Use PNG, JPEG, or WebP.`;
      } else {
        valid.push(file);
      }
    }
    if (errorMsg) setCreateError(errorMsg);
    if (valid.length > 0) {
      setPendingFiles((prev) => [...prev, ...valid]);
      setCreateError(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadPendingFiles = async (projectId: string): Promise<void> => {
    if (pendingFiles.length === 0) return;
    let anyFailed = false;
    for (const file of pendingFiles) {
      const result = await projectAssetUpload.upload(file, {
        type: 'project',
        projectId,
        kind: 'upload',
      });
      if (!result) anyFailed = true;
    }
    if (anyFailed) {
      setAssetError('Some images could not be uploaded. You can re-add them in the workspace.');
    }
  };

  // ---------------------------------------------------------------------------
  // Helper chips
  // ---------------------------------------------------------------------------
  const CHIPS: { label: string; icon?: keyof typeof Icon; action: () => void; disabled?: boolean; hint?: string; active?: boolean }[] = [
    { label: 'Single post',  icon: 'post',     action: () => setType('single'),  active: type === 'single' },
    { label: 'Carousel',     icon: 'carousel', action: () => setType('carousel'), active: type === 'carousel' },
    { label: 'Use image',    icon: 'assets',   action: () => fileInputRef.current?.click(), active: pendingFiles.length > 0 },
    { label: 'Brand system',                   action: () => setBrandModalOpen(true) },
  ];

  return (
    <div className="dash">
      {/* ---- TOP BAR ---- */}
      <header className="dash-topbar">
        <div className="dash-topbar-logo">
          <img src="/orra_logo.svg" alt="Orra" className="dash-logo-img" />
          <span className="dash-logo-name">Orra</span>
          <span className="preview-tag">Studio Preview</span>
        </div>
        <div className="dash-topbar-end">
          <UsageStatus compact status={creditData} loading={creditLoading} error={creditError} />
          <button className="btn btn-ghost btn-sm" disabled title="Upgrade plans available soon">
            Upgrade
          </button>
          <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <Icon.sun s={18} /> : <Icon.moon s={18} />}
          </button>
          {CLERK_CONFIGURED && <UserButton />}
        </div>
      </header>

      {/* ---- CENTERED BODY ---- */}
      <div className="dash-body">
        <h1 className="dash-headline">What are we making today?</h1>

        {/* COMPOSER CARD */}
        <div className="composer-card">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => validateAndStageFiles(e.target.files)}
          />
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Create a 3-card carousel about discipline…"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleCreate();
              }
            }}
          />
          {pendingFiles.length > 0 && (
            <div className="pending-assets-tray">
              {pendingFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="pending-asset-chip">
                    <img
                      src={pendingFileUrls[idx] ?? ''}
                      alt={file.name}
                      className="pending-asset-thumb"
                    />
                    <span className="pending-asset-name">{file.name}</span>
                    <button
                      className="pending-asset-remove"
                      onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={createLoading}
                      aria-label={`Remove ${file.name}`}
                    >
                      <Icon.x s={12} />
                    </button>
                  </div>
              ))}
            </div>
          )}

          <div className="composer-foot">
            {/* Attach images */}
            <button
              className="composer-tool-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={createLoading}
              title="Attach images"
            >
              <Icon.attach s={16} />
            </button>

            {/* Inline brand selector */}
            <div style={{ position: 'relative' }}>
              <button
                className="composer-tool-btn"
                onClick={() => setBrandOpen((v) => !v)}
                title="Select brand system"
              >
                <span
                  className="brand-swatch-mini"
                  style={{ background: `conic-gradient(${selectedBrand.colors.join(',')})` }}
                />
                {selectedBrand.id === '__no-brand__' ? 'No brand' : selectedBrand.name}
                <Icon.caret s={13} />
              </button>
              {brandOpen && (
                <>
                  <div className="backdrop" style={{ zIndex: 5 }} onClick={() => setBrandOpen(false)} />
                  <div className="menu-pop composer-brand-pop" style={{ zIndex: 6 }}>
                    <div className="mh">Brand system</div>
                    {displayBrands.map((b) => (
                      <button
                        key={b.id}
                        className="menu-item"
                        onClick={() => {
                          setSelectedBrandId(b.id === '__no-brand__' ? null : b.id);
                          setBrandOpen(false);
                        }}
                      >
                        <span className="ic" style={{ background: b.logoBg, color: b.logoFg, fontFamily: 'var(--font-display)' }}>
                          {b.initial}
                        </span>
                        <span className="tx">
                          <b>{b.name}</b>
                          <span>{b.fonts.join(' · ')}</span>
                        </span>
                        {b.id === (selectedBrandId ?? '__no-brand__') && (
                          <span style={{ marginLeft: 'auto', color: 'var(--primary)' }}>
                            <Icon.check s={15} />
                          </span>
                        )}
                      </button>
                    ))}
                    <div className="menu-divider" />
                    <button className="menu-item" onClick={() => { setBrandOpen(false); setBrandModalOpen(true); }}>
                      <span className="ic" style={{ background: 'var(--inset)', color: 'var(--primary)' }}>
                        <Icon.plus s={15} />
                      </span>
                      <span className="tx"><b>Create brand system</b></span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Compact ratio selector */}
            <div className="composer-ratio-row">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  className={'composer-ratio-opt' + (ratio === r.id ? ' active' : '')}
                  onClick={() => setRatio(r.id)}
                  title={r.label}
                >
                  <span className="glyph" style={{ width: r.w * 0.65, height: r.h * 0.65 }} />
                </button>
              ))}
            </div>

            <div style={{ flex: 1 }} />

            {/* Enhance prompt — free action, no project created */}
            <button
              className="composer-tool-btn"
              onClick={() => void handleEnhance()}
              disabled={!prompt.trim() || isEnhancing || createLoading}
              title="Enhance prompt"
              aria-label="Enhance prompt"
            >
              {isEnhancing ? <Icon.spark s={16} /> : <Icon.spark s={16} />}
              <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 4 }}>
                {isEnhancing ? 'Enhancing…' : 'Enhance'}
              </span>
            </button>

            {/* Arrow-up send — fills paper/white when prompt is non-empty or files are staged */}
            <button
              className={'composer-send-btn' + (prompt.trim() || pendingFiles.length > 0 ? ' active' : '')}
              onClick={() => void handleCreate()}
              disabled={createLoading || isEnhancing}
              aria-label="Create"
              title={createLoading ? 'Creating…' : 'Create (⌘↵)'}
            >
              {createLoading ? <Icon.spark s={16} /> : <Icon.arrowUp s={16} />}
            </button>
          </div>

          {originalPrompt !== null && (
            <div className="composer-enhance-bar">
              <span className="composer-enhance-label">Prompt enhanced</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleRevert}
                disabled={isEnhancing || createLoading}
              >
                Revert to original
              </button>
            </div>
          )}

          {enhanceError && (
            <div className="composer-error">{enhanceError}</div>
          )}
          {createError && (
            <div className="composer-error">{createError}</div>
          )}
          {assetError && (
            <div className="composer-asset-warning">{assetError}</div>
          )}
        </div>

        {/* HELPER CHIPS */}
        <div className="chip-row">
          {CHIPS.map((chip) => {
            const ChipIcon = chip.icon ? Icon[chip.icon as keyof typeof Icon] : null;
            return (
              <button
                key={chip.label}
                className={'chip' + (chip.active ? ' active' : '') + (chip.disabled ? ' disabled' : '')}
                onClick={chip.disabled ? undefined : chip.action}
                disabled={chip.disabled}
                title={chip.hint}
              >
                {ChipIcon && <ChipIcon s={13} />}
                {chip.label}
              </button>
            );
          })}
        </div>

        <p className="dash-tagline">
          Orra plans the work — you approve before anything generates.
        </p>

        {/* TREND TEMPLATES SECTION */}
        <section className="dash-section">
          <div className="dash-section-head">
            <div className="dash-section-title">
              <h2>Trend templates</h2>
              <p>Starting prompts with reference visuals. Tweak anything once you're in.</p>
            </div>
            <button
              className="btn btn-ghost btn-sm dash-see-all"
              onClick={() => navigate('/templates')}
            >
              See all
            </button>
          </div>
          <div className="trend-grid">
            {templatesLoading && dashboardTemplates.length === 0 && (
              <div className="trend-grid-skeleton" aria-label="Loading trend templates">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="trend-skeleton-card" />
                ))}
              </div>
            )}
            {!templatesLoading && allTemplates.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>No templates available yet.</p>
            )}
            {dashboardTemplates.map((t) => (
              <TrendTemplateCard
                key={t.id}
                title={t.title}
                label={t.category}
                previewUrl={t.previewUrl}
                size="sm"
                disabled={createLoading}
                onClick={() =>
                  void handleCreate({
                    prefill: t.prompt,
                    sourceTemplateId: t.id,
                    projectType: 'post',
                  })
                }
              />
            ))}
          </div>
        </section>

        {/* RECENT PROJECTS SECTION */}
        <section className="dash-section">
          <div className="dash-section-head">
            <h2>Recent projects</h2>
          </div>
          <div className="proj-grid">
            {/* New project card */}
            <button
              className="proj-card new-proj-card"
              onClick={() => void handleCreate()}
              disabled={createLoading}
            >
              <span className="plus">
                <Icon.plus s={22} />
              </span>
              <b>New project</b>
            </button>

            {/* Loading state */}
            {projectsState === 'loading' && (
              <div className="proj-card" style={{ justifyContent: 'center', alignItems: 'center', minHeight: 180 }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>Loading projects…</span>
              </div>
            )}

            {/* Error state */}
            {projectsState === 'error' && (
              <div className="proj-card" style={{ justifyContent: 'center', alignItems: 'center', minHeight: 60, gridColumn: '1 / -1', background: 'transparent', border: 'none', boxShadow: 'none' }}>
                <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>Could not load projects. Please refresh.</span>
              </div>
            )}

            {/* Empty state */}
            {projectsState === 'empty' && (
              <div className="proj-card" style={{ justifyContent: 'center', alignItems: 'center', minHeight: 180 }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>No projects yet — create your first one above</span>
              </div>
            )}

            {/* Real API projects */}
            {apiProjects.map((p) => (
                <button key={p.id} className="proj-card" onClick={() => openProject(p)}>
                  <MiniThumb variant="cover" label={p.name} />
                  <div className="proj-meta">
                    <b>{p.name}</b>
                    <div className="row">
                      <span className="pill">{p.type === 'carousel' ? 'Carousel' : 'Single post'}</span>
                      <span>{p.type === 'carousel' ? 'Carousel' : 'Edited just now'}</span>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </section>

      </div>

      {/* BRAND CREATE MODAL */}
      <CreateBrandSystemModal
        open={brandModalOpen}
        onClose={() => {
          setBrandModalOpen(false);
          setBrandUploadStatus(null);
          brandUpload.reset();
        }}
        onCreate={async (formData, logoFile) => {
          const input = {
            name: formData.name,
            description: formData.description || undefined,
            tone: formData.toneOfVoice || undefined,
            visualDirection: formData.visualDirection || undefined,
            colors: paletteToColors(formData.palette),
            typography: formData.typography as unknown as Record<string, unknown>,
          };
          const brand = await createBrand(input);
          if (brand) {
            setSelectedBrandId(brand.id);
            if (logoFile) {
              setBrandUploadStatus('Uploading logo…');
              const uploaded = await brandUpload.upload(logoFile, {
                type: 'brand',
                brandSystemId: brand.id,
                kind: 'logo',
              });
              if (uploaded) {
                setBrandUploadStatus('Logo uploaded as brand asset. Logo display comes later.');
              } else {
                setBrandUploadStatus(brandUpload.error ?? 'Logo upload failed');
              }
            }
          }
        }}
      />

      {brandUploadStatus && (
        <div
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 50,
            padding: '10px 14px', borderRadius: 10,
            background: 'var(--panel)', border: '1px solid var(--line-soft)',
            fontSize: 13,
            color: brandUpload.status === 'failed' ? 'var(--danger, #c44)' : brandUpload.status === 'succeeded' ? 'var(--success, #5b9279)' : 'var(--muted)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}
        >
          {brandUploadStatus}
        </div>
      )}
    </div>
  );
}
