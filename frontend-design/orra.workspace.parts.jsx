/* ORRA — Workspace screen */

const RATIO_DIM = { '1:1':[1,1], '4:5':[4,5], '9:16':[9,16], '16:9':[16,9] };
function frameSize(ratio, maxH=540, maxW=620) {
  const [a,b] = RATIO_DIM[ratio] || [4,5];
  let h = maxH, w = h*a/b;
  if (w > maxW) { w = maxW; h = w*b/a; }
  return { w: Math.round(w), h: Math.round(h) };
}
const CREATE_RE = /\b(create|make|design|build|generate|carousel|posts?|cards?|draft|launch|write)\b/i;
function topicFromPrompt(p) {
  if (!p) return 'self-improvement';
  let t = p.toLowerCase()
    .replace(/.*\b(about|on|for|around)\b/, '')
    .replace(/[.!?].*$/, '')
    .replace(/\b(a|an|the|please|carousel|post|cards?|some)\b/g, '')
    .trim();
  return t.length > 2 && t.length < 60 ? t : 'self-improvement';
}

/* lightweight undo/redo history */
function useHistory(initial) {
  const [s, setS] = React.useState({ past:[], present:initial, future:[] });
  const setCards = (next, record=true) => setS(st => {
    const val = typeof next === 'function' ? next(st.present) : next;
    if (!record) return { ...st, present: val };
    return { past:[...st.past, st.present], present: val, future:[] };
  });
  const resetCards = (val) => setS({ past:[], present:val, future:[] });
  const undo = () => setS(st => st.past.length ? { past:st.past.slice(0,-1), present:st.past[st.past.length-1], future:[st.present, ...st.future] } : st);
  const redo = () => setS(st => st.future.length ? { past:[...st.past, st.present], present:st.future[0], future:st.future.slice(1) } : st);
  return { cards:s.present, setCards, resetCards, undo, redo, canUndo:s.past.length>0, canRedo:s.future.length>0 };
}

/* ---------- Inspector ---------- */
const INSP_COLORS = ['#f1f4f4','#ffffff','#c8d1d8','#a4b7bd','#5e7680','#354e53','#1d2a30','#0f1719'];
const INSP_FONTS = ['Display','Sans'];

function Inspector({ layer, onChange, onClose, onDup, onDel }) {
  const sizePx = Math.round(layer.size * 10.8);
  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="ic">{Icon.type({s:14})}</span>
        <b>Text layer</b>
        <button className="btn-icon x" style={{width:28,height:28}} onClick={onClose}>{Icon.x({s:15})}</button>
      </div>
      <div className="insp-body">
        <div className="insp-field">
          <label>Content</label>
          <textarea className="insp-select" style={{height:'auto',minHeight:44,padding:'9px 11px',lineHeight:1.4,resize:'vertical'}}
            value={layer.text} onChange={e=>onChange({text:e.target.value}, false)} />
        </div>

        <div className="insp-field">
          <label>Typeface</label>
          <div className="seg">
            {INSP_FONTS.map(f => (
              <button key={f} className={layer.font===f?'on':''} onClick={()=>onChange({font:f})}>
                <span style={{fontFamily:FONT_MAP[f]}}>{f==='Display'?'Serif':'Sans'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="insp-field">
          <div className="lbl-row"><label>Size</label><span className="val">{sizePx}px</span></div>
          <input className="range" type="range" min="2" max="13" step="0.1" value={layer.size}
            onChange={e=>onChange({size:parseFloat(e.target.value)}, false)} />
        </div>

        <div className="insp-field">
          <label>Color</label>
          <div className="sw-row">
            {INSP_COLORS.map(c => (
              <button key={c} className={'sw'+(layer.color.toLowerCase()===c?' on':'')} style={{background:c}} onClick={()=>onChange({color:c})} />
            ))}
          </div>
        </div>

        <div className="insp-field">
          <label>Alignment</label>
          <div className="seg">
            <button className={layer.align==='left'?'on':''} onClick={()=>onChange({align:'left'})}>{Icon.alignL({s:16})}</button>
            <button className={layer.align==='center'?'on':''} onClick={()=>onChange({align:'center'})}>{Icon.alignC({s:16})}</button>
            <button className={layer.align==='right'?'on':''} onClick={()=>onChange({align:'right'})}>{Icon.alignR({s:16})}</button>
          </div>
        </div>

        <div className="insp-field">
          <div className="lbl-row"><label>Opacity</label><span className="val">{Math.round(layer.opacity*100)}%</span></div>
          <input className="range" type="range" min="0.1" max="1" step="0.01" value={layer.opacity}
            onChange={e=>onChange({opacity:parseFloat(e.target.value)}, false)} />
        </div>

        <div className="insp-field">
          <label>Position</label>
          <div className="nudge">
            <div className="np"><span>X</span><b>{Math.round(layer.x)}%</b></div>
            <div className="np"><span>Y</span><b>{Math.round(layer.y)}%</b></div>
          </div>
          <input className="range" type="range" min="0" max="80" step="1" value={layer.x} onChange={e=>onChange({x:parseFloat(e.target.value)}, false)} />
          <input className="range" type="range" min="0" max="90" step="1" value={layer.y} onChange={e=>onChange({y:parseFloat(e.target.value)}, false)} />
        </div>

        <div style={{display:'flex',gap:8,paddingTop:2}}>
          <button className="btn btn-soft btn-sm" style={{flex:1}} onClick={onDup}>{Icon.copy({s:14})} Duplicate</button>
          <button className="btn btn-soft btn-sm" style={{flex:1,color:'#b4543f'}} onClick={onDel}>{Icon.trash({s:14})} Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Chat message blocks ---------- */
function ApprovalCard({ specs, onApprove, onAddCta, onEdit, ctaSet }) {
  return (
    <div className="approval">
      <div className="ap-head">
        <span className="ic">{Icon.spark({s:15})}</span>
        <b>Plan ready</b>
      </div>
      <div className="ap-body">
        <p className="lead">{specs.lead}</p>
        <div className="ap-specs">
          <div className="ap-spec"><span className="k">Style</span><span className="v">{specs.style}</span></div>
          <div className="ap-spec"><span className="k">Format</span><span className="v">{specs.format}</span></div>
          <div className="ap-spec"><span className="k">Brand</span><span className="v">{specs.brand}</span></div>
          <div className="ap-spec"><span className="k">CTA</span><span className={'v'+(ctaSet?'':' unset')}>{ctaSet ? specs.cta : 'not set'}</span></div>
        </div>
      </div>
      <div className="ap-foot">
        <button className="btn btn-primary" onClick={onApprove}>{Icon.check({s:16})} Approve &amp; create</button>
        {!ctaSet && <button className="btn btn-ghost btn-sm" onClick={onAddCta}>Add CTA</button>}
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit direction</button>
      </div>
    </div>
  );
}

window.OrraWorkspaceParts = { frameSize, RATIO_DIM, CREATE_RE, topicFromPrompt, useHistory, Inspector, ApprovalCard };
