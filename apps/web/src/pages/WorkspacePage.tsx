import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useDocumentHistory } from '../hooks/useDocumentHistory';
import { useArtifactLoader } from '../hooks/useArtifactLoader';
import '../styles/workspace.css';
import { Icon } from '../data/icons';
import { BRANDS } from '../data/cards';
import {
  makeArtifactSinglePost,
  makeArtifactCarousel,
  makeTextLayer,
  makeBackgroundLayer,
  normalizeZ,
  makeCard,
} from '../data/mockArtifacts';
import type { Action, TextLayer } from '@orra/shared';
import KonvaStage from '../components/workspace/KonvaStage';
import MiniArtifactPreview from '../components/workspace/MiniArtifactPreview';
import ApprovalCard from '../components/workspace/ApprovalCard';
import Inspector from '../components/workspace/Inspector';
import ExportMenu from '../components/workspace/ExportMenu';
import VersionHistoryPopover from '../components/workspace/VersionHistoryPopover';
import UsageStatus from '../components/workspace/UsageStatus';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { buildUpdateLayerPropsAction, buildSetTextContentAction } from '../components/workspace/inspectorActions';
import { shouldEnterEditMode } from '../components/workspace/textEditHelpers';
import TextEditOverlay from '../components/workspace/TextEditOverlay';
import { exportCardAsPng, exportCarouselAsZip, waitForFonts } from '../export/exportCard';

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


// Mock ID generator for chat messages — not persisted, replaced by server IDs later.
let _mid = 0;
const mid = () => 'm' + (++_mid);

interface LocationState {
  mode?: string;
  ratio?: string;
  brand?: typeof BRANDS[0];
  projectName?: string;
  prefill?: string;
  currentArtifactId?: string;
}

export default function WorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const config = (location.state as LocationState | null) || {};

  const isCarousel = config.mode === 'carousel' || config.mode === 'assets';
  const brand = config.brand || BRANDS[0];
  const brandHandle = '@' + brand.name.toLowerCase().replace(/[^a-z]+/g,'.').replace(/^\.|\.$/g,'');

  const [ratio, setRatio] = useState(config.ratio || '4:5');
  const [phase, setPhase] = useState('empty');
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'ai'; type: string; text?: string; topic?: string }[]>([]);
  const [input, setInput] = useState(config.prefill || '');
  const [pending, setPending] = useState<{ topic: string } | null>(null);
  const [ctaSet, setCtaSet] = useState(false);

  const { theme, toggle: toggleTheme } = useTheme();
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((txt: string) => {
    setToast(txt);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(()=>setToast(null), 2200);
  }, []);

  const { artifact, dispatch, undo, redo, reset: resetArtifact, canUndo, canRedo } = useDocumentHistory(null, flash);

  // ---------------------------------------------------------------------------
  // Artifact loading from API (Phase 8D.1)
  // ---------------------------------------------------------------------------
  const artifactLoader = useArtifactLoader();

  // Selection state from workspace store
  const activeCardIndex = useWorkspaceStore((s) => s.activeCardIndex);
  const selectedLayerId = useWorkspaceStore((s) => s.selectedLayerId);
  const setActiveCard = useWorkspaceStore((s) => s.setActiveCard);
  const selectLayer = useWorkspaceStore((s) => s.selectLayer);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);
  const syncSelectionWithCard = useWorkspaceStore((s) => s.syncSelectionWithCard);

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const editContextRef = useRef<{ cardId: string; layerId: string; originalContent: string } | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [versOpen, setVersOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [curBrand, setCurBrand] = useState(brand);
  const [chatWidth, setChatWidth] = useState(372);
  const resizing = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(372);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /* ----- kernel action dispatch ----- */
  const handleInspectorAction = useCallback((action: Action) => {
    dispatch(action);
  }, [dispatch]);

  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const card = artifact ? artifact.cards[activeCardIndex] : null;
  const fr = frameSize(ratio, isCarousel?500:548);

  // Sync selection when active card changes
  useEffect(() => {
    if (card) {
      syncSelectionWithCard(card);
    }
  }, [card, syncSelectionWithCard]);

  // Keyboard undo/redo — blocked inside text inputs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const editable = (e.target as HTMLElement).isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
      else if (ctrl && e.shiftKey && e.key === 'z') { e.preventDefault(); redo(); }
      else if (ctrl && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  // Guard activeCardIndex when undo removes a card
  useEffect(() => {
    if (artifact && activeCardIndex >= artifact.cards.length) {
      setActiveCard(Math.max(0, artifact.cards.length - 1));
    }
  }, [artifact, activeCardIndex, setActiveCard]);

  // ---------------------------------------------------------------------------
  // Load artifact from API when workspace opens with a projectId
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!projectId) {
      artifactLoader.clear();
      return;
    }
    const artifactId = config.currentArtifactId as string | undefined;
    if (artifactId) {
      artifactLoader.load(artifactId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Hydrate editor when API artifact finishes loading
  useEffect(() => {
    if (artifactLoader.state === 'idle' && artifactLoader.document) {
      resetArtifact(artifactLoader.document);
      setActiveCard(0);
      clearSelection();
      setPhase('generated');
    }
  }, [artifactLoader.state, artifactLoader.document, resetArtifact, setActiveCard, clearSelection]);

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
      const made = isCarousel ? makeArtifactCarousel(brandHandle) : makeArtifactSinglePost(brandHandle);
      resetArtifact(made);
      setActiveCard(0); clearSelection(); setPhase('generated');
      setMessages(m => {
        const copy = m.filter(x => x.type!=='thinking');
        return [...copy, { id:mid(), role:'ai', type:'done', text:`Created a ${isCarousel?made.cards.length+'-card carousel':'single post'}. Click any text to edit, or tell me what to change.` }];
      });
      flash(isCarousel ? 'Carousel generated' : 'Post generated');
    }, 1700);
  };

  const specs = pending ? {
    lead: isCarousel
      ? `Ready to create a ${artifact?.cards.length ?? 5}-card carousel about ${pending.topic}.`
      : `Ready to create a single post about ${pending.topic}.`,
    style: 'Calm · premium · focused',
    format: `Instagram ${ratio}`,
    brand: curBrand.name,
    cta: 'Visit the link in bio',
  } : null;

  /* ----- rail card ops ----- */
  const addCard = () => {
    if (!artifact) return;
    const variants = ['#1d2a30','#5e7680','#eef1f1','#c8d1d8','#1d2a30'];
    const labels = ['cover','steel','pale','mist','cta'];
    const idx = artifact.cards.length % variants.length;
    const baseColor = variants[idx];
    const label = labels[idx];
    const textColor = label === 'pale' ? '#1d2a30' : '#f1f4f4';
    const subColor = label === 'pale' ? '#5e7680' : '#c8d1d8';
    const rw = artifact.ratio.w;
    const rh = artifact.ratio.h;

    const newCard = makeCard({
      index: artifact.cards.length,
      baseColor,
      layers: normalizeZ([
        makeBackgroundLayer({ z: 0, w: rw, h: rh }),
        makeTextLayer({
          z: 1,
          content: 'New card',
          x: Math.round(0.10 * rw),
          y: Math.round(0.38 * rh),
          w: Math.round(0.80 * rw),
          fontFamily: 'Newsreader',
          fontSize: Math.round(8.5 * (rw / 100)),
          fontWeight: 500,
          color: textColor,
          align: 'left',
          lineHeight: 1.06,
        }),
        makeTextLayer({
          z: 2,
          content: 'Add your copy here',
          x: Math.round(0.10 * rw),
          y: Math.round(0.62 * rh),
          w: Math.round(0.74 * rw),
          fontFamily: 'Hanken Grotesk',
          fontSize: Math.round(3.6 * (rw / 100)),
          fontWeight: 500,
          color: subColor,
          align: 'left',
          lineHeight: 1.2,
          opacity: 0.95,
        }),
      ]),
    });

    if (dispatch({ type: 'addCard', card: newCard })) {
      setActiveCard(artifact.cards.length);
      clearSelection();
      flash('Card added');
    }
  };

  const dupCard = (i: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!artifact) return;
    if (dispatch({ type: 'duplicateCard', cardId: artifact.cards[i].id })) {
      flash('Card duplicated');
    }
  };

  const delCard = (i: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!artifact || artifact.cards.length <= 1) {
      flash('A carousel needs at least one card');
      return;
    }
    if (dispatch({ type: 'removeCard', cardId: artifact.cards[i].id })) {
      const nextIndex = Math.max(0, activeCardIndex >= i ? activeCardIndex - 1 : activeCardIndex);
      setActiveCard(nextIndex);
      clearSelection();
    }
  };

  const handleDragEnd = useCallback((layerId: string, x: number, y: number) => {
    if (!card) return;
    dispatch(buildUpdateLayerPropsAction(card.id, layerId, { x, y }));
  }, [card, dispatch]);

  const handleResizeEnd = useCallback((layerId: string, x: number, y: number, w: number, h: number) => {
    if (!card) return;
    dispatch(buildUpdateLayerPropsAction(card.id, layerId, { x, y, w, h }));
  }, [card, dispatch]);

  const handleDblClick = useCallback((layerId: string) => {
    if (!card) return;
    const layer = card.layers.find((l) => l.id === layerId);
    if (!layer || !shouldEnterEditMode(layer)) return;
    editContextRef.current = {
      cardId: card.id,
      layerId,
      originalContent: (layer as TextLayer).content,
    };
    setEditingLayerId(layerId);
  }, [card]);

  const handleEditCommit = useCallback((text: string) => {
    const ctx = editContextRef.current;
    editContextRef.current = null;
    setEditingLayerId(null);
    if (!ctx) return;
    if (text !== ctx.originalContent) {
      dispatch(buildSetTextContentAction(ctx.cardId, ctx.layerId, text));
    }
  }, [dispatch]);

  const handleEditCancel = useCallback(() => {
    editContextRef.current = null;
    setEditingLayerId(null);
  }, []);

  // Cancel edit on card switch; TextEditOverlay cleanup commits pending text first
  useEffect(() => {
    setEditingLayerId(null);
  }, [activeCardIndex]);

  // Inspector receives the real selected Layer
  const selectedLayer = card ? card.layers.find(l => l.id === selectedLayerId) ?? null : null;

  /* ----- resizable divider ----- */
  const onResizeStart = (e: React.MouseEvent) => {
    resizing.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = chatWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const delta = e.clientX - startXRef.current;
      const next = Math.min(Math.max(startWidthRef.current + delta, 260), 520);
      setChatWidth(next);
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

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
          <select
            value={artifact?.ratio.name ?? ratio}
            onChange={e=> {
              const name = e.target.value;
              const dim = RATIO_DIM[name];
              if (!dim || !artifact) return;
              const [a, b] = dim;
              const base = 270;
              const newRatio = { name: name as '1:1' | '4:5' | '9:16' | '16:9', w: a * base, h: b * base };
              if (dispatch({ type: 'setRatio', ratio: newRatio })) {
                setRatio(name);
              }
            }}
            style={{border:'none',background:'none',outline:'none',fontWeight:600,fontSize:13,cursor:'pointer'}}
          >
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
              <VersionHistoryPopover onRestore={(d)=>flash('Restored '+d.toLowerCase())} />
            </>}
          </div>
          <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">{theme==='dark'? <Icon.sun s={18} /> : <Icon.moon s={18} />}</button>
          <div className="autosave"><span className="live" />Autosaved</div>
          <UsageStatus compact />
          <div style={{position:'relative'}}>
            <button className="btn btn-primary btn-sm" style={{height:36}} onClick={()=>{setExportOpen(v=>!v);setVersOpen(false);}}>{<Icon.download s={16} />} Export</button>
            {exportOpen && <>
              <div className="backdrop" onClick={()=>setExportOpen(false)} />
              <ExportMenu
                isCarousel={isCarousel}
                cardCount={artifact?.cards.length ?? 0}
                ratio={ratio}
                onClose={()=>setExportOpen(false)}
                onFlash={flash}
                onExportPng={artifact ? async () => {
                  await waitForFonts();
                  await exportCardAsPng(artifact, activeCardIndex, { projectName: config.projectName });
                } : undefined}
                onExportZip={artifact && artifact.cards.length > 1 ? async () => {
                  await waitForFonts();
                  await exportCarouselAsZip(artifact, {
                    projectName: config.projectName,
                    onProgress: (current, total) => flash(`Exporting ${current} of ${total}…`),
                  });
                } : undefined}
              />
            </>}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="work-body">
        {/* CHAT */}
        <section className="chat" style={{ width: chatWidth, flex: 'none' }}>
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

        <div className="resizer" onMouseDown={onResizeStart} title="Resize panel"><div className="resizer-grip" /></div>

        {/* STAGE */}
        <section className="stage">
          <div className="stage-grid" />
          <div className="stage-main">
            {/* Artifact loading state */}
            {artifactLoader.state === 'loading' && (
              <div className="empty">
                <div className="orb"><img src="/orra_logo.svg" alt="Orra" style={{width:44,height:44}} /></div>
                <h2>Loading project…</h2>
                <p style={{color:'var(--muted)'}}>Fetching the latest artifact from the server.</p>
              </div>
            )}

            {/* Artifact error state */}
            {(artifactLoader.state === 'error' || artifactLoader.state === 'not_found') && (
              <div className="empty">
                <div className="orb" style={{opacity:0.5}}><img src="/orra_logo.svg" alt="Orra" style={{width:44,height:44}} /></div>
                <h2>Unable to load project</h2>
                <p style={{color:'var(--danger, #c44)', fontSize:13.5}}>{artifactLoader.error || 'The artifact could not be loaded.'}</p>
                <div className="opts">
                  <button className="btn btn-ghost" onClick={()=> navigate('/')}>
                    {<Icon.arrowLeft s={16} />} Back to dashboard
                  </button>
                </div>
              </div>
            )}

            {phase!=='generated' && artifactLoader.state !== 'loading' && artifactLoader.state !== 'error' && artifactLoader.state !== 'not_found' ? (
              <div className="empty">
                <div className="orb"><img src="/orra_logo.svg" alt="Orra" style={{width:44,height:44}} /></div>
                <h2>A quiet canvas, ready</h2>
                <p>Start with a prompt, upload assets, or choose a trend template. Orra will plan the direction, then lay out editable text over your visuals.</p>
                <div className="opts">
                  <button className="btn btn-ghost" onClick={()=>{ taRef.current&&taRef.current.focus(); }}>{<Icon.message s={16} />} Write a prompt</button>
                  <button className="btn btn-soft" onClick={()=>flash('Asset upload — drop images or files')}>{<Icon.assets s={16} />} Upload assets</button>
                </div>
              </div>
            ) : (
              <div className="canvas-wrap">
                <div className="canvas-frame" style={{width:fr.w, height:fr.h, position:'relative'}}>
                  {artifact && (
                    <KonvaStage
                      document={artifact}
                      activeCardIndex={activeCardIndex}
                      selectedLayerId={selectedLayerId}
                      onSelectLayer={(id, type) => selectLayer(id, type)}
                      onBgClick={() => { handleEditCancel(); clearSelection(); }}
                      onDragEnd={handleDragEnd}
                      onDblClick={handleDblClick}
                      editingLayerId={editingLayerId}
                      onResizeEnd={handleResizeEnd}
                    />
                  )}
                  {editingLayerId && artifact && card && (() => {
                    const editLayer = card.layers.find((l) => l.id === editingLayerId);
                    if (!editLayer || editLayer.type !== 'text') return null;
                    return (
                      <TextEditOverlay
                        key={editingLayerId}
                        layer={editLayer as TextLayer}
                        frameW={fr.w}
                        frameH={fr.h}
                        docW={artifact.ratio.w}
                        docH={artifact.ratio.h}
                        onCommit={handleEditCommit}
                        onCancel={handleEditCancel}
                      />
                    );
                  })()}
                </div>
                <div className="canvas-caption">
                  {isCarousel ? <>Card {activeCardIndex+1} of {artifact?.cards.length ?? 0} · {ratio} · {curBrand.name}</> : <>Single post · {ratio} · {curBrand.name}</>}
                </div>
              </div>
            )}

            {selectedLayer && card && artifact && (
              <Inspector
                layer={selectedLayer}
                cardId={card.id}
                cardW={artifact.ratio.w}
                cardH={artifact.ratio.h}
                cardLayers={card.layers}
                onAction={handleInspectorAction}
                onClose={()=>clearSelection()}
                brandColors={curBrand.colors}
                brandFonts={curBrand.fonts}
              />
            )}
          </div>

          {/* CAROUSEL RAIL */}
          {phase==='generated' && isCarousel && artifact && (
            <div className="rail">
              <div className="rail-head">
                {<Icon.carousel s={16} style={{color:'var(--muted)'}} />}
                <b>Carousel</b>
                <span className="count">{artifact.cards.length} cards</span>
                <div className="actions">
                  <button className="btn-icon" style={{width:30,height:30}} title="Duplicate current" onClick={()=>dupCard(activeCardIndex)}>{<Icon.copy s={16} />}</button>
                  <button className="btn-icon" style={{width:30,height:30}} title="Delete current" onClick={()=>delCard(activeCardIndex)}>{<Icon.trash s={16} />}</button>
                </div>
              </div>
              <div className="rail-track">
                {artifact.cards.map((c,i)=>{
                  const t = frameSize(ratio, 78, 120);
                  return (
                    <div key={c.id} className={'rail-item'+(i===activeCardIndex?' active':'')} onClick={()=>{setActiveCard(i, artifact.cards);}}>
                      <div className="rail-thumb" style={{width:t.w, height:t.h, position:'relative'}}>
                        <MiniArtifactPreview card={c} />
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
