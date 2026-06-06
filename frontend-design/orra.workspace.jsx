/* ORRA — Workspace main component */
const { frameSize, RATIO_DIM, CREATE_RE, topicFromPrompt, useHistory, Inspector, ApprovalCard } = window.OrraWorkspaceParts;

let _mid = 0;
const mid = () => 'm' + (++_mid);

function Workspace({ config, onHome }) {
  const isCarousel = config.mode === 'carousel' || config.mode === 'assets';
  const brand = config.brand || BRANDS[0];
  const handle = '@' + brand.name.toLowerCase().replace(/[^a-z]+/g,'.').replace(/^\.|\.$/g,'') ;

  const [ratio, setRatio] = React.useState(config.ratio || '4:5');
  const [phase, setPhase] = React.useState('empty');           // empty | generated
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState(config.prefill || '');
  const [pending, setPending] = React.useState(null);          // {topic} awaiting approval
  const [ctaSet, setCtaSet] = React.useState(false);

  const { cards, setCards, resetCards, undo, redo, canUndo, canRedo } = useHistory([]);
  const [sel, setSel] = React.useState(0);                     // selected card index
  const [layerSel, setLayerSel] = React.useState(null);        // selected layer id
  const [exportOpen, setExportOpen] = React.useState(false);
  const [versOpen, setVersOpen] = React.useState(false);
  const [brandOpen, setBrandOpen] = React.useState(false);
  const [curBrand, setCurBrand] = React.useState(brand);
  const [toast, setToast] = React.useState(null);

  const scrollRef = React.useRef(null);
  const taRef = React.useRef(null);
  const toastT = React.useRef(null);

  const flash = (txt) => {
    setToast(txt); clearTimeout(toastT.current);
    toastT.current = setTimeout(()=>setToast(null), 2200);
  };

  React.useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const card = cards[sel];
  const fr = frameSize(ratio, isCarousel?500:548);

  /* ----- chat send ----- */
  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setMessages(m => [...m, { id:mid(), role:'user', type:'text', text }]);

    const wantsCreate = CREATE_RE.test(text) || !!config.prefill;
    if (wantsCreate) {
      const topic = topicFromPrompt(text);
      setMessages(m => [...m, { id:mid(), role:'ai', type:'thinking', text:'Planning the direction…' }]);
      setTimeout(()=>{
        setMessages(m => {
          const copy = m.filter(x => x.type!=='thinking');
          return [...copy, { id:mid(), role:'ai', type:'approval', topic }];
        });
        setPending({ topic });
      }, 1500);
    } else {
      setMessages(m => [...m, { id:mid(), role:'ai', type:'thinking', text:'' }]);
      setTimeout(()=>{
        setMessages(m => {
          const copy = m.filter(x => x.type!=='thinking');
          return [...copy, { id:mid(), role:'ai', type:'text', text:'Got it — tell me what you\u2019d like to create and I\u2019ll draft a plan. You can say something like "make a 5-card carousel about morning routines."' }];
        });
      }, 900);
    }
  };

  /* ----- approve & generate ----- */
  const approve = (topic) => {
    setMessages(m => m.map(x => x.type==='approval' ? { ...x, type:'approvalDone' } : x));
    setPending(null);
    setMessages(m => [...m, { id:mid(), role:'ai', type:'thinking', text:'Designing the layers…' }]);
    setTimeout(()=>{
      const made = isCarousel ? makeCarousel(handle) : makeSinglePost(handle);
      resetCards(made);
      setSel(0); setLayerSel(null); setPhase('generated');
      setMessages(m => {
        const copy = m.filter(x => x.type!=='thinking');
        return [...copy, { id:mid(), role:'ai', type:'done', text:`Created a ${isCarousel?made.length+'-card carousel':'single post'}. Click any text to edit, or tell me what to change.` }];
      });
      flash(isCarousel ? 'Carousel generated' : 'Post generated');
    }, 1700);
  };

  const specs = pending ? {
    lead: isCarousel
      ? `Ready to create a 5-card carousel about ${pending.topic}.`
      : `Ready to create a single post about ${pending.topic}.`,
    style: 'Calm · premium · focused',
    format: `Instagram ${ratio}`,
    brand: curBrand.name,
    cta: 'Visit the link in bio',
  } : null;

  /* ----- layer editing ----- */
  const patchLayer = (patch, record=true) => {
    if (layerSel == null) return;
    setCards(cs => cs.map((c,i)=> i!==sel ? c : {
      ...c, layers: c.layers.map(l => l.id===layerSel ? { ...l, ...patch } : l)
    }), record);
  };
  const dupLayer = () => {
    if (layerSel == null) return;
    setCards(cs => cs.map((c,i)=>{
      if (i!==sel) return c;
      const src = c.layers.find(l=>l.id===layerSel);
      const nl = { ...src, id:'l'+Date.now(), y: Math.min(src.y+8, 88) };
      return { ...c, layers:[...c.layers, nl] };
    }));
    flash('Layer duplicated');
  };
  const delLayer = () => {
    if (layerSel == null) return;
    setCards(cs => cs.map((c,i)=> i!==sel ? c : { ...c, layers:c.layers.filter(l=>l.id!==layerSel) }));
    setLayerSel(null);
  };

  /* ----- rail card ops ----- */
  const addCard = () => {
    setCards(cs => {
      const base = cs[cs.length-1] || makeCarousel(handle)[0];
      const variants = ['cover','steel','pale','mist','cta'];
      const nv = variants[cs.length % variants.length];
      const nc = { id:'c'+Date.now(), bg:nv, layers:[
        { id:'nl1', text:'New card', x:10, y:38, w:80, size:8.5, weight:500, color: nv==='pale'?'#1d2a30':'#f1f4f4', align:'left', font:'Display', opacity:1, lh:1.06 },
        { id:'nl2', text:'Add your copy here', x:10, y:62, w:74, size:3.6, weight:500, color: nv==='pale'?'#5e7680':'#c8d1d8', align:'left', font:'Sans', opacity:0.95 },
      ]};
      return [...cs, nc];
    });
    setSel(cards.length); setLayerSel(null);
    flash('Card added');
  };
  const dupCard = (i, e) => { e && e.stopPropagation();
    setCards(cs => { const c = { ...cs[i], id:'c'+Date.now(), layers: cs[i].layers.map(l=>({...l})) }; const n=[...cs]; n.splice(i+1,0,c); return n; });
    flash('Card duplicated');
  };
  const delCard = (i, e) => { e && e.stopPropagation();
    if (cards.length<=1) { flash('A carousel needs at least one card'); return; }
    setCards(cs => cs.filter((_,j)=>j!==i));
    setSel(s => Math.max(0, s>=i ? s-1 : s)); setLayerSel(null);
  };

  const curLayer = card ? card.layers.find(l=>l.id===layerSel) : null;

  return (
    <div className="work">
      {/* TOP BAR */}
      <div className="work-top">
        <button className="home" onClick={onHome} title="Back to dashboard">
          <div className="wordmark"><div className="glyph" style={{width:26,height:26,borderRadius:8}}>{Icon.sparkFill({s:14})}</div></div>
          {Icon.arrowLeft({s:16, style:{color:'var(--muted)'}})}
        </button>
        <div className="proj-name">
          {config.projectName || (isCarousel ? 'Untitled carousel' : 'Untitled post')}
          <span className="dot" />
          <span className="mode-pill">{isCarousel?'Carousel':'Single post'}</span>
        </div>

        <div className="top-divider" />
        <div style={{position:'relative'}}>
          <button className="top-sel" onClick={()=>setBrandOpen(v=>!v)}>
            <span className="sw" style={{background:`conic-gradient(${curBrand.colors.join(',')})`}} />
            {curBrand.name}<span className="caret">{Icon.caret({s:14})}</span>
          </button>
          {brandOpen && <>
            <div className="backdrop" onClick={()=>setBrandOpen(false)} />
            <div className="menu-pop" style={{top:46,right:'auto',left:0,width:230,zIndex:26}}>
              <div className="mh">Brand system</div>
              {BRANDS.map(b=>(
                <button key={b.id} className="menu-item" onClick={()=>{setCurBrand(b);setBrandOpen(false);flash('Brand applied');}}>
                  <span className="ic" style={{background:b.logoBg,color:b.logoFg,fontFamily:'var(--font-display)'}}>{b.initial}</span>
                  <span className="tx"><b>{b.name}</b><span>{b.tone.join(' · ')}</span></span>
                </button>
              ))}
            </div>
          </>}
        </div>

        <div className="top-sel" style={{cursor:'default'}}>
          <select value={ratio} onChange={e=>setRatio(e.target.value)} style={{border:'none',background:'none',outline:'none',fontWeight:600,fontSize:13,cursor:'pointer'}}>
            {Object.keys(RATIO_DIM).map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="top-right">
          <button className="btn-icon" disabled={!canUndo} style={{opacity:canUndo?1:0.4}} onClick={undo} title="Undo">{Icon.undo({s:18})}</button>
          <button className="btn-icon" disabled={!canRedo} style={{opacity:canRedo?1:0.4}} onClick={redo} title="Redo">{Icon.redo({s:18})}</button>
          <div style={{position:'relative'}}>
            <button className="btn-icon" onClick={()=>{setVersOpen(v=>!v);setExportOpen(false);}} title="Version history">{Icon.history({s:18})}</button>
            {versOpen && <>
              <div className="backdrop" onClick={()=>setVersOpen(false)} />
              <div className="ver-pop">
                <div className="mh" style={{padding:'9px 10px 7px'}}>Version history</div>
                {[['Now','Current draft',true],['2m ago','Generated carousel',false],['5m ago','Approved plan',false],['6m ago','Project created',false]].map(([t,d,now],i,a)=>(
                  <div className="ver-item" key={i} onClick={()=>{setVersOpen(false);flash('Restored '+d.toLowerCase());}}>
                    <div className="tl"><span className={'pt'+(now?' now':'')} />{i<a.length-1&&<span className="ln" />}</div>
                    <div className="tx"><b>{d}</b><span>{t}</span></div>
                  </div>
                ))}
              </div>
            </>}
          </div>
          <div className="autosave"><span className="live" />Autosaved</div>
          <div style={{position:'relative'}}>
            <button className="btn btn-primary btn-sm" style={{height:36}} onClick={()=>{setExportOpen(v=>!v);setVersOpen(false);}}>{Icon.download({s:16})} Export</button>
            {exportOpen && <>
              <div className="backdrop" onClick={()=>setExportOpen(false)} />
              <div className="menu-pop">
                <div className="mh">Export</div>
                <button className={'menu-item'+(isCarousel?' disabled':'')} onClick={()=>{ if(isCarousel)return; setExportOpen(false); flash('Exporting PNG…'); }}>
                  <span className="ic">{Icon.image({s:17})}</span>
                  <span className="tx"><b>PNG image</b><span>{isCarousel?'Single posts only':'This post · '+ratio}</span></span>
                </button>
                <button className={'menu-item'+(!isCarousel?' disabled':'')} onClick={()=>{ if(!isCarousel)return; setExportOpen(false); flash('Bundling '+cards.length+' cards as ZIP…'); }}>
                  <span className="ic">{Icon.zip({s:17})}</span>
                  <span className="tx"><b>ZIP archive</b><span>{isCarousel?cards.length+' cards · PNG each':'Carousel only'}</span></span>
                </button>
                <button className="menu-item" onClick={()=>{setExportOpen(false);flash('Copied share link');}}>
                  <span className="ic">{Icon.brand({s:17})}</span>
                  <span className="tx"><b>Copy share link</b><span>View-only preview</span></span>
                </button>
              </div>
            </>}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="work-body">
        {/* CHAT */}
        <section className="chat">
          <div className="chat-head">
            <div>
              <div className="ttl">Director</div>
              <div className="sub">Chat to create &amp; refine</div>
            </div>
            <span className="ai-badge">{Icon.sparkFill({s:13})} Orra AI</span>
          </div>

          <div className="chat-scroll" ref={scrollRef}>
            {messages.length===0 && (
              <div style={{textAlign:'center',color:'var(--muted)',padding:'28px 10px'}}>
                <div style={{width:46,height:46,borderRadius:14,background:'var(--primary-06)',color:'var(--primary)',display:'grid',placeItems:'center',margin:'0 auto 14px'}}>{Icon.message({s:22})}</div>
                <p style={{fontSize:14,lineHeight:1.55,margin:0}}>Describe the post or carousel you want.<br/>Orra plans first, then builds the layers.</p>
              </div>
            )}
            {messages.map(m => {
              if (m.type==='thinking') return (
                <div key={m.id} className="msg ai">
                  <div className="av">{Icon.sparkFill({s:12})}</div>
                  <div className="bubble"><span className="thinking"><span className="dots"><i/><i/><i/></span>{m.text}</span></div>
                </div>
              );
              if (m.type==='approval') return (
                <div key={m.id} className="msg ai" style={{display:'block'}}>
                  <ApprovalCard specs={specs||{}} ctaSet={ctaSet}
                    onApprove={()=>approve(m.topic)}
                    onAddCta={()=>{setCtaSet(true);flash('CTA added to plan');}}
                    onEdit={()=>{ taRef.current&&taRef.current.focus(); flash('Edit your direction below'); }} />
                </div>
              );
              if (m.type==='approvalDone') return (
                <div key={m.id} className="msg ai"><div className="av">{Icon.sparkFill({s:12})}</div>
                  <div className="bubble" style={{color:'var(--muted)',fontSize:13.5}}>Plan approved ✓</div></div>
              );
              if (m.type==='done') return (
                <div key={m.id} className="msg ai" style={{display:'block'}}>
                  <div className="done-card"><span className="ic">{Icon.check({s:14})}</span>{m.text}</div>
                </div>
              );
              return (
                <div key={m.id} className={'msg '+m.role}>
                  <div className="av">{m.role==='ai'?Icon.sparkFill({s:12}):'You'.slice(0,1)}</div>
                  <div className="bubble">{m.text}</div>
                </div>
              );
            })}
          </div>

          <div className="composer">
            {messages.length===0 && (
              <div className="suggest-row">
                {['5-card carousel on slow mornings','A quote post about focus','Carousel: 3 quiet productivity tips'].map(s=>(
                  <button key={s} className="suggest" onClick={()=>setInput(s)}>{s}</button>
                ))}
              </div>
            )}
            <div className="composer-box">
              <textarea ref={taRef} rows={1} placeholder="Direct Orra — describe or refine…"
                value={input}
                onChange={e=>{ setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'; }}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } }} />
              <div className="composer-bar">
                <button className="attach" onClick={()=>flash('Asset upload — drop images or files')}>{Icon.attach({s:15})} Add assets</button>
                <span className="grow" />
                <span style={{fontSize:11.5,color:'var(--muted)',marginRight:4}}>{curBrand.name}</span>
                <button className="send-btn" disabled={!input.trim()} onClick={send}>{Icon.send({s:17})}</button>
              </div>
            </div>
          </div>
        </section>

        {/* STAGE */}
        <section className="stage">
          <div className="stage-grid" />
          <div className="stage-main">
            {phase!=='generated' ? (
              <div className="empty">
                <div className="orb">{Icon.spark({s:34})}</div>
                <h2>A quiet canvas, ready</h2>
                <p>Start with a prompt, upload assets, or choose a trend template. Orra will plan the direction, then lay out editable text over your visuals.</p>
                <div className="opts">
                  <button className="btn btn-ghost" onClick={()=>{ taRef.current&&taRef.current.focus(); }}>{Icon.message({s:16})} Write a prompt</button>
                  <button className="btn btn-soft" onClick={()=>flash('Asset upload — drop images or files')}>{Icon.assets({s:16})} Upload assets</button>
                </div>
              </div>
            ) : (
              <div className="canvas-wrap">
                <div className="canvas-frame" style={{width:fr.w, height:fr.h}}>
                  {card && <SocialCard card={card} selectedLayer={layerSel}
                    onSelectLayer={setLayerSel} onBgClick={()=>setLayerSel(null)} />}
                </div>
                <div className="canvas-caption">
                  {isCarousel ? <>Card {sel+1} of {cards.length} · {ratio} · {curBrand.name}</> : <>Single post · {ratio} · {curBrand.name}</>}
                </div>
              </div>
            )}

            {curLayer && (
              <Inspector layer={curLayer}
                onChange={patchLayer} onClose={()=>setLayerSel(null)}
                onDup={dupLayer} onDel={delLayer} />
            )}
          </div>

          {/* CAROUSEL RAIL */}
          {phase==='generated' && isCarousel && (
            <div className="rail">
              <div className="rail-head">
                {Icon.carousel({s:16, style:{color:'var(--muted)'}})}
                <b>Carousel</b>
                <span className="count">{cards.length} cards</span>
                <div className="actions">
                  <button className="btn-icon" style={{width:30,height:30}} title="Duplicate current" onClick={()=>dupCard(sel)}>{Icon.copy({s:16})}</button>
                  <button className="btn-icon" style={{width:30,height:30}} title="Delete current" onClick={()=>delCard(sel)}>{Icon.trash({s:16})}</button>
                </div>
              </div>
              <div className="rail-track">
                {cards.map((c,i)=>{
                  const t = frameSize(ratio, 78, 120);
                  return (
                    <div key={c.id} className={'rail-item'+(i===sel?' active':'')} onClick={()=>{setSel(i);setLayerSel(null);}}>
                      <div className="rail-thumb" style={{width:t.w, height:t.h}}>
                        <div style={{position:'absolute',inset:0,containerType:'inline-size'}}>
                          <SocialCard card={c} selectedLayer={null} onSelectLayer={()=>setSel(i)} onBgClick={()=>setSel(i)} />
                          <div style={{position:'absolute',inset:0}} />
                        </div>
                        <span className="rail-num">{i+1}</span>
                        <button className="del" title="Delete card" onClick={(e)=>delCard(i,e)}>{Icon.x({s:12})}</button>
                      </div>
                    </div>
                  );
                })}
                <button className="rail-add" onClick={addCard} title="Add card">{Icon.plus({s:20})}</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast && <div className="toast">{Icon.check({s:16})}{toast}</div>}
    </div>
  );
}
window.Workspace = Workspace;
