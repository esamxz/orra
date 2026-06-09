import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/dashboard.css';
import { Icon } from '../data/icons';
import { BRANDS, TEMPLATES, PROJECTS, RECENT_PROJECTS } from '../data/cards';
import { CardBg } from '../data/cards';
import CreateBrandSystemModal from '../components/brand/CreateBrandSystemModal';
import { useDashboardStore } from '../stores/dashboardStore';
import { useTheme } from '../hooks/useTheme';
import { useCreditStatus } from '../hooks/useCreditStatus';
import UsageStatus from '../components/workspace/UsageStatus';
import { useProjects } from '../hooks/useProjects';
import { createProject } from '../api/projects';
import { ApiClientError } from '../api/errors';

const TYPE_OPTS = [
  { id:'single', icon:'post' as const, title:'Single Post', sub:'One standalone visual' },
  { id:'carousel', icon:'carousel' as const, title:'Carousel', sub:'A multi-card story' },
  { id:'assets', icon:'assets' as const, title:'Start from Assets', sub:'Upload images or files' },
];

const RATIOS = [
  { id:'1:1', w:20, h:20, label:'1:1' },
  { id:'4:5', w:17, h:21, label:'4:5' },
  { id:'9:16', w:13, h:22, label:'9:16' },
  { id:'16:9', w:24, h:14, label:'16:9' },
];

const TABS = ['Recent','Your projects','Trend templates','Brand systems'];

function MiniThumb({ variant, label }: { variant: string; label?: string }) {
  return (
    <div className="proj-thumb" style={{containerType:'inline-size'}}>
      <CardBg variant={variant} />
      {label && <div style={{position:'absolute',left:14,bottom:14,right:14,color:variant==='pale'?'#1d2a30':'#f1f4f4',fontFamily:'var(--font-display)',fontSize:'7.5cqw',fontWeight:500,lineHeight:1.05,opacity:0.96}}>{label}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const addBrandSystem = useDashboardStore((s) => s.addBrandSystem);
  const { theme, toggle: toggleTheme } = useTheme();

  const [tab, setTab] = useState('Recent');
  const [type, setType] = useState('carousel');
  const [ratio, setRatio] = useState('4:5');
  const [brandIdx, setBrandIdx] = useState(0);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const brand = BRANDS[brandIdx];

  // ---------------------------------------------------------------------------
  // Credit status from API (Phase 10D)
  // ---------------------------------------------------------------------------
  const {
    data: creditData,
    loading: creditLoading,
    error: creditError,
  } = useCreditStatus();

  // ---------------------------------------------------------------------------
  // Project list from API
  // ---------------------------------------------------------------------------
  const {
    projects: apiProjects,
    state: projectsState,
    error: projectsError,
  } = useProjects(tab === 'Recent' ? 'recent' : 'all');

  // ---------------------------------------------------------------------------
  // Create project via API, then navigate to workspace
  // ---------------------------------------------------------------------------
  const start = async (extra: Record<string, unknown> = {}) => {
    setCreateLoading(true);
    setCreateError(null);

    try {
      const selectedRatio = RATIOS.find((r) => r.id === ratio) ?? RATIOS[1];
      const projectType = type === 'single' ? 'post' : type === 'carousel' ? 'carousel' : 'from_assets';

      const project = await createProject({
        name: (extra.projectName as string) || (type === 'carousel' ? 'Untitled carousel' : 'Untitled post'),
        type: projectType,
        ratio: { name: selectedRatio.id, w: selectedRatio.w, h: selectedRatio.h },
        brandSystemId: brand.id,
      });

      if (project.currentArtifactId) {
        navigate(`/workspace/${project.id}`, {
          state: {
            mode: type,
            ratio,
            brand,
            currentArtifactId: project.currentArtifactId,
            ...extra,
          },
        });
      } else {
        // Fallback: no artifact yet — open workspace anyway
        navigate(`/workspace/${project.id}`, {
          state: { mode: type, ratio, brand, ...extra },
        });
      }
    } catch (err) {
      const msg = err instanceof ApiClientError
        ? err.message
        : 'Could not create the project. Please try again.';
      setCreateError(msg);
      setCreateLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Open an existing project
  // ---------------------------------------------------------------------------
  const openProject = (project: typeof apiProjects[number]) => {
    const isCarouselProject = project.type === 'carousel';
    navigate(`/workspace/${project.id}`, {
      state: {
        mode: isCarouselProject ? 'carousel' : 'single',
        ratio: project.ratio.name,
        brand: BRANDS[0],
        projectName: project.name,
        currentArtifactId: project.currentArtifactId,
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Derive displayed projects
  // ---------------------------------------------------------------------------
  // When the API is available, use real projects. If the API fails or returns
  // empty, the empty/error states are shown explicitly. Mock projects are
  // still rendered as demo content behind a clear "Demo" label when the API
  // is unreachable so the prototype design stays intact.
  const useMockFallback = projectsState === 'error';

  return (
    <div className="dash">
      {/* LEFT RAIL */}
      <aside className="dash-rail">
        <div className="dash-rail-head">
          <div className="wordmark">
            <div className="glyph"><img src="/orra_logo.svg" alt="Orra" /></div>
            <div className="name">Orra</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Icon.sun s={18} /> : <Icon.moon s={18} />}
            </button>
            <span className="preview-tag">Studio Preview</span>
          </div>
        </div>

        <div className="create-panel">
          <div className="eyebrow">Create new project</div>
          <h1 className="create-title">What are we making?</h1>
          <p className="create-sub">Direct the work in chat — Orra builds the layers for you.</p>

          <div className="type-grid">
            {TYPE_OPTS.map(o => {
              const TypeIcon = Icon[o.icon as keyof typeof Icon];
              return (
                <button key={o.id} className={'type-opt' + (type===o.id?' active':'')} onClick={()=>setType(o.id)}>
                  <span className="ic">{<TypeIcon s={19} />}</span>
                  <span className="tx"><b>{o.title}</b><span>{o.sub}</span></span>
                  <span className="rad" />
                </button>
              );
            })}
          </div>

          <div className="field-label">Brand system</div>
          <div style={{position:'relative'}}>
            <button className="selector" onClick={()=>setBrandOpen(v=>!v)}>
              <span className="sw" style={{background:`conic-gradient(${brand.colors.join(',')})`}} />
              <span className="tx"><b>{brand.name}</b><span>{brand.tone.join(' · ')}</span></span>
              <span className="caret">{<Icon.caret s={16} />}</span>
            </button>
            {brandOpen && <>
              <div className="backdrop" style={{zIndex:5}} onClick={()=>setBrandOpen(false)} />
              <div className="menu-pop" style={{top:54,right:'auto',left:0,width:'100%',zIndex:6}}>
                <div className="mh">Switch brand system</div>
                {BRANDS.map((b,i)=>[
                  <button key={b.id} className="menu-item" onClick={()=>{setBrandIdx(i);setBrandOpen(false);}}>
                    <span className="ic" style={{background:b.logoBg,color:b.logoFg,fontFamily:'var(--font-display)'}}>{b.initial}</span>
                    <span className="tx"><b>{b.name}</b><span>{b.fonts.join(' · ')}</span></span>
                    {i===brandIdx && <span style={{marginLeft:'auto',color:'var(--primary)'}}>{<Icon.check s={16} />}</span>}
                  </button>
                ])}
              </div>
            </>}
          </div>

          <div className="field-label">Aspect ratio</div>
          <div className="ratio-row">
            {RATIOS.map(r => (
              <button key={r.id} className={'ratio-opt'+(ratio===r.id?' active':'')} onClick={()=>setRatio(r.id)}>
                <span className="glyph" style={{width:r.w,height:r.h}} />
                <b>{r.label}</b>
              </button>
            ))}
          </div>

          <button
            className="btn btn-primary"
            style={{width:'100%',height:46,fontSize:15.5}}
            onClick={()=>start()}
            disabled={createLoading}
          >
            {createLoading ? 'Creating…' : <>{<Icon.spark s={18} />} Start creating</>}
          </button>
          {createError && (
            <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--danger, #c44)' }}>{createError}</p>
          )}
        </div>

        <UsageStatus
          status={creditData}
          loading={creditLoading}
          error={creditError}
        />

        <div className="rail-foot">
          <p className="note">Only you can see your projects by default.</p>
        </div>
      </aside>

      {/* RIGHT CONTENT */}
      <main className="dash-main">
        <div className="dash-topbar">
          <div className="dash-tabs">
            {TABS.map(t => (
              <button key={t} className={'dash-tab'+(tab===t?' active':'')} onClick={()=>setTab(t)}>{t}</button>
            ))}
          </div>
          <div className="dash-search">
            {<Icon.search s={17} />}
            <input placeholder="Search projects, templates, brands…" />
          </div>
        </div>

        <div className="dash-scroll">
          {(tab==='Recent' || tab==='Your projects') && (
            <div className="proj-grid">
              <button className="proj-card new-proj-card" onClick={()=>start({mode:'carousel',ratio:'4:5',brand:BRANDS[0]})} disabled={createLoading}>
                <span className="plus">{<Icon.plus s={22} />}</span>
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
                <div className="proj-card" style={{ justifyContent: 'center', alignItems: 'center', minHeight: 180 }}>
                  <span style={{ color: 'var(--danger, #c44)', fontSize: 13 }}>{projectsError}</span>
                </div>
              )}

              {/* Empty state */}
              {projectsState === 'empty' && !useMockFallback && (
                <div className="proj-card" style={{ justifyContent: 'center', alignItems: 'center', minHeight: 180 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>No projects yet</span>
                </div>
              )}

              {/* Real API projects */}
              {!useMockFallback && apiProjects.map((p) => {
                const projectMode = p.type === 'carousel' ? 'Carousel' : 'Single post';
                const projectCards = p.type === 'carousel' ? 'Carousel' : '1 card';
                return (
                  <button
                    key={p.id}
                    className="proj-card"
                    onClick={() => openProject(p)}
                  >
                    <MiniThumb variant={'cover'} label={p.name} />
                    <div className="proj-meta">
                      <b>{p.name}</b>
                      <div className="row">
                        <span className="pill">{projectMode}</span>
                        <span>{projectMode === 'Carousel' ? projectCards : 'Edited just now'}</span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Mock fallback projects (demo mode) */}
              {useMockFallback && (tab === 'Recent' ? RECENT_PROJECTS : PROJECTS).map((p) => (
                <button
                  key={p.id}
                  className="proj-card"
                  onClick={() => start({ mode: p.mode === 'Carousel' ? 'carousel' : 'single', ratio: '4:5', brand: BRANDS[0], projectName: p.name })}
                >
                  <MiniThumb variant={p.variant} label={p.name} />
                  <div className="proj-meta">
                    <b>{p.name}</b>
                    <div className="row">
                      <span className="pill">{p.mode}</span>
                      <span>{p.mode === 'Carousel' ? p.cards + ' cards' : 'Edited ' + p.when}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab==='Trend templates' && <>
            <div className="section-head">
              <h2>Trend templates</h2>
              <p>Starting prompts with reference visuals — not fixed modes. Tweak anything once you're in.</p>
            </div>
            <div className="trend-grid">
              {TEMPLATES.map(t => (
                <article key={t.id} className="trend-card">
                  <div className="trend-preview" style={{containerType:'inline-size'}}>
                    <CardBg variant={t.variant} />
                    <span className="tag">{t.cat}</span>
                    <div style={{position:'absolute',left:18,bottom:16,right:18,color:t.variant==='pale'?'#1d2a30':'#f1f4f4',fontFamily:'var(--font-display)',fontSize:'6cqw',fontWeight:500,lineHeight:1.04}}>{t.title}</div>
                  </div>
                  <div className="trend-body">
                    <h3>{t.title}</h3>
                    <p className="desc">{t.desc}</p>
                    <div className="prompt-preview">{t.prompt}</div>
                    <div className="trend-foot">
                      <span className="eyebrow">{t.tag}</span>
                      <button className="btn btn-primary btn-sm" onClick={()=>start({ mode: t.tag==='Single post'?'single':'carousel', ratio:'4:5', brand:BRANDS[0], prefill:t.prompt })}>
                        {<Icon.spark s={15} />} Use this prompt
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>}

          {tab==='Brand systems' && <>
            <div className="section-head">
              <h2>Brand systems</h2>
              <p>Reusable identity — colors, fonts, and tone Orra applies to every layer it makes.</p>
            </div>
            <div className="brand-grid">
              {BRANDS.map(b => (
                <article key={b.id} className="brand-card">
                  <div className="brand-top">
                    <div className="brand-logo" style={{background:b.logoBg,color:b.logoFg}}>{b.initial}</div>
                    <div className="tx"><b>{b.name}</b><span>Brand system</span></div>
                  </div>
                  <div className="brand-swatches">
                    {b.colors.map((c,i)=><div key={i} className="sw" style={{background:c}} />)}
                  </div>
                  <div className="brand-fonts">
                    {<Icon.type s={15} />}<b>{b.fonts[0]}</b><span className="dot" /><b>{b.fonts[1]}</b>
                  </div>
                  <div className="brand-tone">
                    {b.tone.map(t=><span key={t}>{t}</span>)}
                  </div>
                </article>
              ))}
              <button className="brand-card brand-new" onClick={()=> setBrandModalOpen(true)}>
                <span className="plus">{<Icon.plus s={22} />}</span>
                <div>
                  <b style={{display:'block',color:'inherit'}}>Create brand system</b>
                  <span style={{fontSize:12.5,color:'var(--muted)'}}>Teach Orra your colors, fonts & voice</span>
                </div>
              </button>
            </div>
          </>}
        </div>
      </main>

      <CreateBrandSystemModal
        open={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        onCreate={addBrandSystem}
      />
    </div>
  );
}
