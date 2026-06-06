import { Icon } from '../../data/icons';
import { FONT_MAP } from '../../data/cards';
import type { ProtoLayer } from '../../data/cards';

const INSP_COLORS = ['#f1f4f4','#ffffff','#c8d1d8','#a4b7bd','#5e7680','#354e53','#1d2a30','#0f1719'];
const INSP_FONTS = ['Display','Sans'];

interface Props {
  layer: ProtoLayer;
  onChange: (patch: Partial<ProtoLayer>, record?: boolean) => void;
  onClose: () => void;
  onDup: () => void;
  onDel: () => void;
}

export default function Inspector({ layer, onChange, onClose, onDup, onDel }: Props) {
  const sizePx = Math.round(layer.size * 10.8);
  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="ic">{<Icon.type s={14} />}</span>
        <b>Text layer</b>
        <button className="btn-icon x" style={{width:28,height:28}} onClick={onClose}>{<Icon.x s={15} />}</button>
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
              <button key={f} className={layer.font===f?'on':''} onClick={()=>onChange({font:f as 'Display'|'Sans'})}>
                <span style={{fontFamily:FONT_MAP[f]}}>{f==='Display'?'Serif':'Sans'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="insp-field">
          <div className="lbl-row"><label>Size</label><span className="val">{sizePx}px</span></div>
          <input className="range" type="range" min={2} max={13} step={0.1} value={layer.size}
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
            <button className={layer.align==='left'?'on':''} onClick={()=>onChange({align:'left'})}>{<Icon.alignL s={16} />}</button>
            <button className={layer.align==='center'?'on':''} onClick={()=>onChange({align:'center'})}>{<Icon.alignC s={16} />}</button>
            <button className={layer.align==='right'?'on':''} onClick={()=>onChange({align:'right'})}>{<Icon.alignR s={16} />}</button>
          </div>
        </div>

        <div className="insp-field">
          <div className="lbl-row"><label>Opacity</label><span className="val">{Math.round(layer.opacity*100)}%</span></div>
          <input className="range" type="range" min={0.1} max={1} step={0.01} value={layer.opacity}
            onChange={e=>onChange({opacity:parseFloat(e.target.value)}, false)} />
        </div>

        <div className="insp-field">
          <label>Position</label>
          <div className="nudge">
            <div className="np"><span>X</span><b>{Math.round(layer.x)}%</b></div>
            <div className="np"><span>Y</span><b>{Math.round(layer.y)}%</b></div>
          </div>
          <input className="range" type="range" min={0} max={80} step={1} value={layer.x} onChange={e=>onChange({x:parseFloat(e.target.value)}, false)} />
          <input className="range" type="range" min={0} max={90} step={1} value={layer.y} onChange={e=>onChange({y:parseFloat(e.target.value)}, false)} />
        </div>

        <div style={{display:'flex',gap:8,paddingTop:2}}>
          <button className="btn btn-soft btn-sm" style={{flex:1}} onClick={onDup}>{<Icon.copy s={14} />} Duplicate</button>
          <button className="btn btn-soft btn-sm" style={{flex:1,color:'#b4543f'}} onClick={onDel}>{<Icon.trash s={14} />} Delete</button>
        </div>
      </div>
    </div>
  );
}
