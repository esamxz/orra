/* ORRA — Dashboard screen */

const TYPE_OPTS = [
  { id:'single', icon:'post', title:'Single Post', sub:'One standalone visual' },
  { id:'carousel', icon:'carousel', title:'Carousel', sub:'A multi-card story' },
  { id:'assets', icon:'assets', title:'Start from Assets', sub:'Upload images or files' },
];
const RATIOS = [
  { id:'1:1', w:20, h:20, label:'1:1' },
  { id:'4:5', w:17, h:21, label:'4:5' },
  { id:'9:16', w:13, h:22, label:'9:16' },
  { id:'16:9', w:24, h:14, label:'16:9' },
];
const TABS = ['Recent','Your projects','Trend templates','Brand systems'];

function MiniThumb({ variant, label }) {
  return (
    <div className="proj-thumb" style={{containerType:'inline-size'}}>
      <CardBg variant={variant} />
      {label && <div style={{position:'absolute',left:14,bottom:14,right:14,color:variant==='pale'?'#1d2a30':'#f1f4f4',fontFamily:'var(--font-display)',fontSize:'7.5cqw',fontWeight:500,lineHeight:1.05,opacity:0.96}}>{label}</div>}
    </div>
  );
}

function Dashboard({ onOpen }) {
  const [tab, setTab] = React.useState('Recent');
  const [type, setType] = React.useState('carousel');
  const [ratio, setRatio] = React.useState('4:5');
  const [brandIdx, setBrandIdx] = React.useState(0);
  const [brandOpen, setBrandOpen] = React.useState(false);
  const brand = BRANDS[brandIdx];

  const start = (extra={}) => onOpen({ mode: type, ratio, brand, ...extra });

  return (
    <div className="dash">
      {/* LEFT RAIL */}
      <aside className="dash-rail">
        <div className="dash-rail-head">
          <div className="wordmark">
            <div className="glyph">{Icon.sparkFill({s:17})}</div>
            <div className="name">Orra</div>
          </div>
          <span className="preview-tag">Studio Preview</span>
        </div>

        <div className="create-panel">
          <div className="eyebrow">Create new project</div>
          <h1 className="create-title">What are we making?</h1>
          <p className="create-sub">Direct the work in chat — Orra builds the layers for you.</p>

          <div className="type-grid">
            {TYPE_OPTS.map(o => (
              <button key={o.id} className={'type-opt' + (type===o.id?' active':'')} onClick={()=>setType(o.id)}>
                <span className="ic">{Icon[o.icon]({s:19})}</span>
                <span className="tx"><b>{o.title}</b><span>{o.sub}</span></span>
                <span className="rad" />
              </button>
            ))}
          </div>

          <div className="field-label">Brand system</div>
          <div style={{position:'relative'}}>
            <button className="selector" onClick={()=>setBrandOpen(v=>!v)}>
              <span className="sw" style={{background:`conic-gradient(${brand.colors.join(',')})`}} />
              <span className="tx"><b>{brand.name}</b><span>{brand.tone.join(' · ')}</span></span>
              <span className="caret">{Icon.caret({s:16})}</span>
            </button>
            {brandOpen && <>
              <div className="backdrop" style={{zIndex:5}} onClick={()=>setBrandOpen(false)} />
              <div className="menu-pop" style={{top:54,right:'auto',left:0,width:'100%',zIndex:6}}>
                <div className="mh">Switch brand system</div>
                {BRANDS.map((b,i)=>(
                  <button key={b.id} className="menu-item" onClick={()=>{setBrandIdx(i);setBrandOpen(false);}}>
                    <span className="ic" style={{background:b.logoBg,color:b.logoFg,fontFamily:'var(--font-display)'}}>{b.initial}</span>
                    <span className="tx"><b>{b.name}</b><span>{b.fonts.join(' · ')}</span></span>
                    {i===brandIdx && <span style={{marginLeft:'auto',color:'var(--primary)'}}>{Icon.check({s:16})}</span>}
                  </button>
                ))}
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

          <button className="btn btn-primary" style={{width:'100%',height:46,fontSize:15.5}} onClick={()=>start()}>
            {Icon.spark({s:18})} Start creating
          </button>
        </div>

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
            {Icon.search({s:17})}
            <input placeholder="Search projects, templates, brands…" />
          </div>
        </div>

        <div className="dash-scroll">
          {(tab==='Recent' || tab==='Your projects') && (
            <div className="proj-grid">
              <button className="proj-card new-proj-card" onClick={()=>onOpen({mode:'carousel',ratio:'4:5',brand:BRANDS[0]})}>
                <span className="plus">{Icon.plus({s:22})}</span>
                <b>New project</b>
              </button>
              {PROJECTS.filter(p => tab==='Recent' ? true : true).map(p => (
                <button key={p.id} className="proj-card" onClick={()=>onOpen({mode:p.mode==='Carousel'?'carousel':'single',ratio:'4:5',brand:BRANDS[0],projectName:p.name})}>
                  <MiniThumb variant={p.variant} label={p.name} />
                  <div className="proj-meta">
                    <b>{p.name}</b>
                    <div className="row">
                      <span className="pill">{p.mode}</span>
                      <span>{p.mode==='Carousel' ? p.cards+' cards' : 'Edited '+p.when}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab==='Trend templates' && <>
            <div className="section-head">
              <h2>Trend templates</h2>
              <p>Starting prompts with reference visuals — not fixed modes. Tweak anything once you\u2019re in.</p>
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
                      <button className="btn btn-primary btn-sm" onClick={()=>onOpen({ mode: t.tag==='Single post'?'single':'carousel', ratio:'4:5', brand:BRANDS[0], prefill:t.prompt })}>
                        {Icon.spark({s:15})} Use this prompt
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
                    {Icon.type({s:15})}<b>{b.fonts[0]}</b><span className="dot" /><b>{b.fonts[1]}</b>
                  </div>
                  <div className="brand-tone">
                    {b.tone.map(t=><span key={t}>{t}</span>)}
                  </div>
                </article>
              ))}
              <button className="brand-card brand-new">
                <span className="plus">{Icon.plus({s:22})}</span>
                <div>
                  <b style={{display:'block',color:'inherit'}}>Create brand system</b>
                  <span style={{fontSize:12.5,color:'var(--muted)'}}>Teach Orra your colors, fonts & voice</span>
                </div>
              </button>
            </div>
          </>}
        </div>
      </main>
    </div>
  );
}
window.Dashboard = Dashboard;
