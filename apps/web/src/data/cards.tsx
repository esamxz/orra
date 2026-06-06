/* ORRA — sample content + social card renderer */
import React from 'react';

export const BRANDS = [
  { id:'still', name:'Still Studio', initial:'S', logoBg:'#1d2a30', logoFg:'#eef1f1',
    colors:['#1d2a30','#354e53','#5e7680','#c8d1d8'], fonts:['Newsreader','Hanken Grotesk'],
    tone:['Calm','Premium','Editorial'] },
  { id:'flora', name:'Flora & Co.', initial:'F', logoBg:'#cdd6cf', logoFg:'#33433a',
    colors:['#33433a','#5d7363','#a9bcae','#e6ece6'], fonts:['Spectral','Hanken Grotesk'],
    tone:['Organic','Warm','Soft'] },
  { id:'mono', name:'Monogram', initial:'M', logoBg:'#262421', logoFg:'#efece6',
    colors:['#1c1a17','#5a5048','#b8aca0','#efece6'], fonts:['Newsreader','Geist Mono'],
    tone:['Minimal','Bold','Mono'] },
];

export const TEMPLATES = [
  { id:'t1', tag:'Carousel', cat:'Wellness', title:'Quiet self-improvement', variant:'cover',
    desc:'Slow, reflective listicle carousel with calm typography and lots of breathing room.',
    prompt:'Create a 5-card carousel about quiet self-improvement habits. Calm, premium, focused tone. Instagram 4:5. Minimal type, generous whitespace.' },
  { id:'t2', tag:'Single post', cat:'Quote', title:'Editorial quote card', variant:'mist',
    desc:'A single statement post — large serif quote over a soft duotone field.',
    prompt:'Design a single editorial quote post. One short, striking line in large serif. Muted blue-gray duotone background. Square 1:1.' },
  { id:'t3', tag:'Carousel', cat:'Product', title:'Soft product launch', variant:'steel',
    desc:'Three-card launch sequence: hook, feature, call to action. Understated and confident.',
    prompt:'Create a 3-card product launch carousel. Card 1 hook, card 2 the key feature, card 3 a clear CTA. Premium, restrained. 4:5.' },
  { id:'t4', tag:'Carousel', cat:'Education', title:'Step-by-step explainer', variant:'pale',
    desc:'Numbered teaching carousel that walks through a process, one idea per card.',
    prompt:'Create a numbered explainer carousel that teaches a 4-step process, one step per card. Clean, instructive, calm. 4:5.' },
];

export const PROJECTS = [
  { id:'p1', name:'Morning rituals', mode:'Carousel', when:'2 hours ago', variant:'cover', cards:5 },
  { id:'p2', name:'Studio launch', mode:'Single post', when:'Yesterday', variant:'mist', cards:1 },
  { id:'p3', name:'Q3 brand refresh', mode:'Carousel', when:'2 days ago', variant:'steel', cards:7 },
  { id:'p4', name:'Quiet luxury notes', mode:'Single post', when:'4 days ago', variant:'pale', cards:1 },
  { id:'p5', name:'Field guide vol. 2', mode:'Carousel', when:'Last week', variant:'mist', cards:6 },
  { id:'p6', name:'Summer campaign', mode:'Carousel', when:'Last week', variant:'cover', cards:4 },
  { id:'p7', name:'Product drop teaser', mode:'Single post', when:'2 weeks ago', variant:'steel', cards:1 },
  { id:'p8', name:'Team culture deck', mode:'Carousel', when:'2 weeks ago', variant:'pale', cards:8 },
  { id:'p9', name:'Holiday lookbook', mode:'Carousel', when:'3 weeks ago', variant:'cta', cards:5 },
  { id:'p10', name:'Annual recap', mode:'Single post', when:'1 month ago', variant:'mist', cards:1 },
];
export const RECENT_PROJECTS = PROJECTS.slice(0, 4);

/* ---------- card background variants ---------- */
export function CardBg({ variant }: { variant: string }) {
  const grain = {
    position:'absolute' as const, inset:0, opacity:0.5, mixBlendMode:'soft-light' as const, pointerEvents:'none' as const,
    backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")"
  };
  const variants: Record<string, React.ReactNode> = {
    cover: (<div style={{position:'absolute',inset:0,background:'linear-gradient(165deg,#243338 0%,#1d2a30 55%,#16201f 100%)'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(120% 80% at 80% 110%, rgba(94,118,128,0.55), transparent 60%)'}} />
      <div style={{position:'absolute',left:'-10%',bottom:'-6%',width:'85%',height:'48%',background:'linear-gradient(120deg, rgba(200,209,216,0.22), transparent 70%)',clipPath:'polygon(0 100%, 35% 30%, 60% 62%, 100% 8%, 100% 100%)'}} />
    </div>),
    steel: (<div style={{position:'absolute',inset:0,background:'linear-gradient(155deg,#5e7680 0%,#48626a 60%,#354e53 100%)'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(100% 70% at 20% 0%, rgba(200,209,216,0.4), transparent 55%)'}} />
    </div>),
    pale: (<div style={{position:'absolute',inset:0,background:'linear-gradient(160deg,#eef1f1 0%,#dbe2e4 100%)'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(90% 60% at 90% 90%, rgba(164,183,189,0.5), transparent 55%)'}} />
    </div>),
    mist: (<div style={{position:'absolute',inset:0,background:'linear-gradient(160deg,#c8d1d8 0%,#aab9bf 45%,#7d949b 100%)'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(80% 60% at 25% 20%, rgba(238,241,241,0.7), transparent 55%)'}} />
      <div style={{position:'absolute',right:'-15%',top:'-10%',width:'70%',height:'70%',borderRadius:'50%',background:'radial-gradient(circle, rgba(29,42,48,0.18), transparent 70%)'}} />
    </div>),
    cta: (<div style={{position:'absolute',inset:0,background:'linear-gradient(150deg,#1d2a30 0%,#2c4146 100%)'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(70% 50% at 50% 120%, rgba(94,118,128,0.5), transparent 60%)'}} />
    </div>),
  };
  return <div className="social-bg">{variants[variant] || variants.cover}<div style={grain}/></div>;
}

export const FONT_MAP: Record<string, string> = { Display: "var(--font-display)", Sans: "var(--font-ui)" };

export interface ProtoLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  size: number;
  weight: number;
  color: string;
  align: string;
  font: string;
  opacity: number;
  lh?: number;
  ls?: string;
  italic?: boolean;
  upper?: boolean;
}

export interface ProtoCard {
  id: string;
  bg: string;
  layers: ProtoLayer[];
}

/* a single positioned, editable text layer */
export function Layer({ layer, selected, onSelect }: { layer: ProtoLayer; selected: boolean; onSelect: (id: string) => void }) {
  const st: React.CSSProperties = {
    left: layer.x + '%', top: layer.y + '%', width: (layer.w || 80) + '%',
    fontFamily: FONT_MAP[layer.font] || FONT_MAP.Sans,
    fontSize: layer.size + 'cqw',
    fontWeight: layer.weight, color: layer.color, textAlign: layer.align as 'left' | 'center' | 'right',
    opacity: layer.opacity, lineHeight: layer.lh || 1.08,
    letterSpacing: layer.ls || '-0.01em',
    fontStyle: layer.italic ? 'italic' : 'normal',
    textTransform: layer.upper ? 'uppercase' : 'none',
  };
  if (layer.upper) st.letterSpacing = '0.16em';
  return (
    <div className={'layer' + (selected ? ' selected' : '')} style={st}
      onClick={(e)=>{ e.stopPropagation(); onSelect(layer.id); }}>
      {layer.text}
    </div>
  );
}

/* full social card: bg + layers */
export function SocialCard({ card, selectedLayer, onSelectLayer, onBgClick }: {
  card: ProtoCard;
  selectedLayer: string | null;
  onSelectLayer: (id: string) => void;
  onBgClick: () => void;
}) {
  return (
    <div className="social" style={{containerType:'inline-size'}} onClick={onBgClick}>
      <CardBg variant={card.bg} />
      {card.layers.map(l => (
        <Layer key={l.id} layer={l} selected={selectedLayer===l.id} onSelect={onSelectLayer} />
      ))}
    </div>
  );
}

/* ---------- generated carousel content ---------- */
export function makeCarousel(brandHandle?: string) {
  const h = brandHandle || '@still.studio';
  const mk = (id: string, bg: string, layers: ProtoLayer[]) => ({ id, bg, layers });
  return [
    mk('c1','cover',[
      { id:'l1', text:'FIVE QUIET HABITS', x:10, y:14, w:80, size:3.2, weight:700, color:'#a4b7bd', align:'left', font:'Sans', upper:true, opacity:1 },
      { id:'l2', text:'that changed how I work', x:10, y:24, w:82, size:9.5, weight:500, color:'#f1f4f4', align:'left', font:'Display', opacity:1, lh:1.05 },
      { id:'l3', text:'A slow guide to doing less, better.', x:10, y:74, w:70, size:3.4, weight:500, color:'#c8d1d8', align:'left', font:'Sans', opacity:0.92 },
      { id:'l4', text:h, x:10, y:88, w:60, size:2.8, weight:600, color:'#5e7680', align:'left', font:'Sans', opacity:1 },
    ]),
    mk('c2','steel',[
      { id:'l1', text:'01', x:10, y:12, w:30, size:11, weight:600, color:'rgba(241,244,244,0.5)', align:'left', font:'Display', opacity:1 },
      { id:'l2', text:'Start before\nyou feel ready', x:10, y:34, w:80, size:8.5, weight:500, color:'#f1f4f4', align:'left', font:'Display', opacity:1, lh:1.06 },
      { id:'l3', text:'Readiness is a feeling that arrives after you begin — rarely before.', x:10, y:66, w:74, size:3.6, weight:500, color:'#e6eaeb', align:'left', font:'Sans', opacity:0.95, lh:1.4 },
    ]),
    mk('c3','pale',[
      { id:'l1', text:'02', x:10, y:12, w:30, size:11, weight:600, color:'rgba(53,78,83,0.28)', align:'left', font:'Display', opacity:1 },
      { id:'l2', text:'Protect your\nfirst hour', x:10, y:34, w:80, size:8.5, weight:500, color:'#1d2a30', align:'left', font:'Display', opacity:1, lh:1.06 },
      { id:'l3', text:'The first hour sets the tone for the whole day. Spend it on intent, not input.', x:10, y:66, w:76, size:3.6, weight:500, color:'#5e7680', align:'left', font:'Sans', opacity:1, lh:1.4 },
    ]),
    mk('c4','mist',[
      { id:'l1', text:'03', x:10, y:12, w:30, size:11, weight:600, color:'rgba(29,42,48,0.3)', align:'left', font:'Display', opacity:1 },
      { id:'l2', text:'Say no without\nthe paragraph', x:10, y:34, w:82, size:8, weight:500, color:'#1d2a30', align:'left', font:'Display', opacity:1, lh:1.06 },
      { id:'l3', text:'A clear no protects a clear yes. You don’t owe anyone the explanation.', x:10, y:66, w:74, size:3.6, weight:500, color:'#2c4146', align:'left', font:'Sans', opacity:0.95, lh:1.4 },
    ]),
    mk('c5','cta',[
      { id:'l1', text:'Save this for\nthe next slow week', x:10, y:28, w:82, size:8.5, weight:500, color:'#f1f4f4', align:'left', font:'Display', opacity:1, lh:1.06 },
      { id:'l2', text:'Follow for calm notes on work & craft.', x:10, y:62, w:72, size:3.4, weight:500, color:'#c8d1d8', align:'left', font:'Sans', opacity:0.92 },
      { id:'l3', text:h, x:10, y:84, w:60, size:3.4, weight:700, color:'#a4b7bd', align:'left', font:'Sans', opacity:1 },
    ]),
  ];
}

export function makeSinglePost(brandHandle?: string) {
  return [{ id:'s1', bg:'mist', layers:[
    { id:'l1', text:'“Do less,\nbut finish.”', x:12, y:30, w:80, size:11, weight:500, color:'#1d2a30', align:'left', font:'Display', opacity:1, lh:1.02 },
    { id:'l2', text:'A note on focus', x:12, y:18, w:60, size:3, weight:700, color:'#2c4146', align:'left', font:'Sans', upper:true, opacity:0.9 },
    { id:'l3', text:brandHandle || '@still.studio', x:12, y:86, w:60, size:3, weight:600, color:'#354e53', align:'left', font:'Sans', opacity:1 },
  ]}];
}
