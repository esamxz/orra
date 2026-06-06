import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import '../styles/workspace.css';
import { Icon } from '../data/icons';
import { BRANDS, makeCarousel, makeSinglePost, type ProtoCard, type ProtoLayer } from '../data/cards';
import { SocialCard } from '../data/cards';
import ApprovalCard from '../components/workspace/ApprovalCard';
import Inspector from '../components/workspace/Inspector';
import ExportMenu from '../components/workspace/ExportMenu';
import VersionHistoryPopover from '../components/workspace/VersionHistoryPopover';
import UsageStatus from '../components/workspace/UsageStatus';

const RATIO_DIM: Record<string, [number, number]> = { '1:1':[1,1], '4:5':[4,5], '9:16':[9,16], '16:9':[16,9] };

function frameSize(ratio: string, maxH=540, maxW=620) {
  const [a,b] = RATIO_DIM[ratio] || [4,5];
  let h = maxH, w = h*a/b;
  if (w > maxW) { w = maxW; h = w*b/a; }
  return { w: Math.round(w), h: Math.round(h) };
}

const CREATE_RE = /\b(create|make|design|build|generate|carousel|posts?|cards?|draft|launch|write)\b/i;

function topicFromPrompt(p: string) {
  if (!p) return 'self-improvement';
  let t = p.toLowerCase()
    .replace(/.*\b(about|on|for|around)\b/, '')
    .replace(/[.!?].*$/, '')
    .replace(/\b(a|an|the|please|carousel|post|cards?|some)\b/g, '')
    .trim();
  return t.length > 2 && t.length < 60 ? t : 'self-improvement';
}

/* lightweight undo/redo history */
function useHistory(initial: ProtoCard[]) {
  const [s, setS] = useState({ past: [] as ProtoCard[][], present: initial, future: [] as ProtoCard[][] });
  const setCards = (next: ProtoCard[] | ((prev: ProtoCard[]) => ProtoCard[]), record=true) => setS(st => {
    const val = typeof next === 'function' ? next(st.present) : next;
    if (!record) return { ...st, present: val };
    return { past:[...st.past, st.present], present: val, future:[] };
  });
  const resetCards = (val: ProtoCard[]) => setS({ past:[], present:val, future:[] });
  const undo = () => setS(st => st.past.length ? { past:st.past.slice(0,-1), present:st.past[st.past.length-1], future:[st.present, ...st.future] } : st);
  const redo = () => setS(st => st.future.length ? { past:[...st.past, st.present], present:st.future[0], future:st.future.slice(1) } : st);
  const canUndo = s.past.length > 0;
  const canRedo = s.future.length > 0;
  return { cards:s.present, setCards, resetCards, undo, redo, canUndo, canRedo };
}

let _mid = 0;
const mid = () => 'm' + (++_mid);

interface LocationState {
  mode?: string;
  ratio?: string;
  brand?: typeof BRANDS[0];
  projectName?: string;
  prefill?: string;
}

export default function WorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const config = (location.state as LocationState | null) || {};

  const isCarousel = config.mode === 'carousel' || config.mode === 'assets';
  const brand = config.brand || BRANDS[0];
  const handle = '@' + brand.name.toLowerCase().replace(/[^a-z]+/g,'.').replace(/^\.|\.$/g,'');

  const [ratio, setRatio] = useState(config.ratio || '4:5');
  const [phase, setPhase] = useState('empty');
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'ai'; type: string; text?: string; topic?: string }[]>([]);
  const [input, setInput] = useState(config.prefill || '');
  const [pending, setPending] = useState<{ topic: string } | null>(null);
  const [ctaSet, setCtaSet] = useState(false);

  const { theme, toggle: toggleTheme } = useTheme();
  const { cards, setCards, resetCards, undo, redo, canUndo, canRedo } = useHistory([]);
  const [sel, setSel] = useState(0);
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [versOpen, setVersOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [curBrand, setCurBrand] = useState(brand);
  const [toast, setToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (txt: string) => {
    setToast(txt);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(()=>setToast(null), 2200);
  };

  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

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
          return [...copy, { id:mid(), role:'ai', type:'approval', topic, text: '' }];
        });
        setPending({ topic });
      }, 1500);
    } else {
      setMessages(m => [...m, { id:mid(), role:'ai', type:'thinking', text:'' }]);
      setTimeout(()=>{
        setMessages(m => {
          const copy = m.filter(x => x.type!=='thinking');
          return [...copy, { id:mid(), role:'ai', type:'text', text:'Got it — tell me what you’d like to create and I’ll draft a plan. You can say something like "make a 5-card carousel about morning routines."' }];
        });
      }, 900);
    }
  };

  /* ----- approve & generate ----- */
  const approve = (_topic: string) => {
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
  const patchLayer = (patch: Partial<ProtoLayer>, record=true) => {
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
      if (!src) return c;
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
      const variants = ['cover','steel','pale','mist','cta'];
      const nv = variants[cs.length % variants.length];
      const nc: ProtoCard = { id:'c'+Date.now(), bg:nv, layers:[
        { id:'nl1', text:'New card', x:10, y:38, w:80, size:8.5, weight:500, color: nv==='pale'?'#1d2a30':'#f1f4f4', align:'left', font:'Display', opacity:1, lh:1.06 },
        { id:'nl2', text:'Add your copy here', x:10, y:62, w:74, size:3.6, weight:500, color: nv==='pale'?'#5e7680':'#c8d1d8', align:'left', font:'Sans', opacity:0.95 },
      ]};
      return [...cs, nc];
    });
    setSel(cards.length); setLayerSel(null);
    flash('Card added');
  };
  const dupCard = (i: number, e?: React.MouseEvent) => { e?.stopPropagation();
    setCards(cs => { const c = { ...cs[i], id:'c'+Date.now(), layers: cs[i].layers.map(l=>({...l})) }; const n=[...cs]; n.splice(i+1,0,c); return n; });
    flash('Card duplicated');
  };
  const delCard = (i: number, e?: React.MouseEvent) => { e?.stopPropagation();
    if (cards.length<=1) { flash('A carousel needs at least one card'); return; }
    setCards(cs => cs.filter((_,j)=>j!==i));
    setSel(s => Math.max(0, s>=i ? s-1 : s)); setLayerSel(null);
  };

  const curLayer = card ? card.layers.find(l=>l.id===layerSel) : null;

  return (
    <div className="work">
      {/* TOP BAR */}
      <div className="work-top">
        <button className="home" onClick={()=>navigate('/')} title="Back to dashboard">
          <div className="wordmark"><div className="glyph" style={{width:26,height:26,borderRadius:8}}><img src="/orra_logo.svg" alt="Orra" style={{width:22,height:22}} /></div></div>
          {<Icon.arrowLeft s={16} style={{color:'var(--muted)'}} />}
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
            {curBrand.name}<span className="caret">{<Icon.caret s={14} />}</span>
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
          <button className="btn-icon" disabled={!canUndo} style={{opacity:canUndo?1:0.4}} onClick={undo} title="Undo">{<Icon.undo s={18} />}</button>
          <button className="btn-icon" disabled={!canRedo} style={{opacity:canRedo?1:0.4}} onClick={redo} title="Redo">{<Icon.redo s={18} />}</button>
          <div style={{position:'relative'}}>
            <button className="btn-icon" onClick={()=>{setVersOpen(v=>!v);setExportOpen(false);}} title="Version history">{<Icon.history s={18} />}</button>
            {versOpen && <>
              <div className="backdrop" onClick={()=>setVersOpen(false)} />
              <VersionHistoryPopover onClose={()=>setVersOpen(false)} onRestore={(d)=>flash('Restored '+d.toLowerCase())} />
            </>}
          </div>
          <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">{theme==='dark'? <Icon.sun s={18} /> : <Icon.moon s={18} />}</button>
          <div className="autosave"><span className="live" />Autosaved</div>
          <UsageStatus compact />
          <div style={{position:'relative'}}>
            <button className="btn btn-primary btn-sm" style={{height:36}} onClick={()=>{setExportOpen(v=>!v);setVersOpen(false);}}>{<Icon.download s={16} />} Export</button>
            {exportOpen && <>
              <div className="backdrop" onClick={()=>setExportOpen(false)} />
              <ExportMenu isCarousel={isCarousel} cards={cards} ratio={ratio} onClose={()=>setExportOpen(false)} onFlash={flash} />
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
              <div className="sub">Chat to create & refine</div>
            </div>
            <span className="ai-badge">{<Icon.sparkFill s={13} />} Orra AI</span>
          </div>

          <div className="chat-scroll" ref={scrollRef}>
            {messages.length===0 && (
              <div style={{textAlign:'center',color:'var(--muted)',padding:'28px 10px'}}>
                <div style={{width:46,height:46,borderRadius:14,background:'var(--primary-06)',color:'var(--primary)',display:'grid',placeItems:'center',margin:'0 auto 14px'}}>{<Icon.message s={22} />}</div>
                <p style={{fontSize:14,lineHeight:1.55,margin:0}}>Describe the post or carousel you want.<br/>Orra plans first, then builds the layers.</p>
              </div>
            )}
            {messages.map(m => {
              if (m.type==='thinking') return (
                <div key={m.id} className="msg ai">
                  <div className="av">{<Icon.sparkFill s={12} />}</div>
                  <div className="bubble"><span className="thinking"><span className="dots"><i/><i/><i/></span>{m.text}</span></div>
                </div>
              );
              if (m.type==='approval') return (
                <div key={m.id} className="msg ai" style={{display:'block'}}>
                  <ApprovalCard specs={specs} ctaSet={ctaSet}
                    onApprove={()=>approve(m.topic || '')}
                    onAddCta={()=>{setCtaSet(true);flash('CTA added to plan');}}
                    onEdit={()=>{ taRef.current&&taRef.current.focus(); flash('Edit your direction below'); }} />
                </div>
              );
              if (m.type==='approvalDone') return (
                <div key={m.id} className="msg ai"><div className="av">{<Icon.sparkFill s={12} />}</div>
                  <div className="bubble" style={{color:'var(--muted)',fontSize:13.5}}>Plan approved ✓</div></div>
              );
              if (m.type==='done') return (
                <div key={m.id} className="msg ai" style={{display:'block'}}>
                  <div className="done-card"><span className="ic">{<Icon.check s={14} />}</span>{m.text}</div>
                </div>
              );
              return (
                <div key={m.id} className={'msg '+m.role}>
                  <div className="av">{m.role==='ai'? <Icon.sparkFill s={12} /> : 'Y'}</div>
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
                <button className="attach" onClick={()=>flash('Asset upload — drop images or files')}>{<Icon.attach s={15} />} Add assets</button>
                <span className="grow" />
                <span style={{fontSize:11.5,color:'var(--muted)',marginRight:4}}>{curBrand.name}</span>
                <button className="send-btn" disabled={!input.trim()} onClick={send}>{<Icon.send s={17} />}</button>
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
                <div className="orb">{<Icon.spark s={34} />}</div>
                <h2>A quiet canvas, ready</h2>
                <p>Start with a prompt, upload assets, or choose a trend template. Orra will plan the direction, then lay out editable text over your visuals.</p>
                <div className="opts">
                  <button className="btn btn-ghost" onClick={()=>{ taRef.current&&taRef.current.focus(); }}>{<Icon.message s={16} />} Write a prompt</button>
                  <button className="btn btn-soft" onClick={()=>flash('Asset upload — drop images or files')}>{<Icon.assets s={16} />} Upload assets</button>
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
                {<Icon.carousel s={16} style={{color:'var(--muted)'}} />}
                <b>Carousel</b>
                <span className="count">{cards.length} cards</span>
                <div className="actions">
                  <button className="btn-icon" style={{width:30,height:30}} title="Duplicate current" onClick={()=>dupCard(sel)}>{<Icon.copy s={16} />}</button>
                  <button className="btn-icon" style={{width:30,height:30}} title="Delete current" onClick={()=>delCard(sel)}>{<Icon.trash s={16} />}</button>
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
                        <button className="del" title="Delete card" onClick={(e)=>delCard(i,e)}>{<Icon.x s={12} />}</button>
                      </div>
                    </div>
                  );
                })}
                <button className="rail-add" onClick={addCard} title="Add card">{<Icon.plus s={20} />}</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast && <div className="toast">{<Icon.check s={16} />}{toast}</div>}
    </div>
  );
}
