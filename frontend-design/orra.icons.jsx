/* ORRA — line icons (stroke, currentColor) */
const I = (p) => React.createElement('svg', {
  width: p.s || 18, height: p.s || 18, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: p.w || 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
  style: p.style
}, p.children);

const Icon = {
  post: (p={}) => I({...p, children: [
    React.createElement('rect', {key:1, x:4, y:4, width:16, height:16, rx:3}),
    React.createElement('path', {key:2, d:'M4 15l4-4 3 3 4-4 5 5'}),
    React.createElement('circle', {key:3, cx:9, cy:9, r:1.4})
  ]}),
  carousel: (p={}) => I({...p, children: [
    React.createElement('rect', {key:1, x:7, y:5, width:10, height:14, rx:2.4}),
    React.createElement('path', {key:2, d:'M4 8v8M20 8v8'})
  ]}),
  assets: (p={}) => I({...p, children: [
    React.createElement('path', {key:1, d:'M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'}),
    React.createElement('path', {key:2, d:'M4 13l4-3 4 3 3-2 5 4'})
  ]}),
  spark: (p={}) => I({...p, children: [
    React.createElement('path', {key:1, d:'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18'})
  ]}),
  sparkFill: (p={}) => React.createElement('svg', {width:p.s||18,height:p.s||18,viewBox:'0 0 24 24',fill:'currentColor',style:p.style},
    React.createElement('path',{d:'M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z'}),
    React.createElement('path',{d:'M18 14l.7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7z'})
  ),
  search: (p={}) => I({...p, children: [
    React.createElement('circle', {key:1, cx:11, cy:11, r:7}),
    React.createElement('path', {key:2, d:'M20 20l-3.5-3.5'})
  ]}),
  caret: (p={}) => I({...p, children: React.createElement('path', {d:'M6 9l6 6 6-6'})}),
  plus: (p={}) => I({...p, children: React.createElement('path', {d:'M12 5v14M5 12h14'})}),
  x: (p={}) => I({...p, children: React.createElement('path', {d:'M6 6l12 12M18 6L6 18'})}),
  check: (p={}) => I({...p, children: React.createElement('path', {d:'M5 12l4.5 4.5L19 7'})}),
  arrowLeft: (p={}) => I({...p, children: React.createElement('path', {d:'M15 5l-7 7 7 7'})}),
  arrowRight: (p={}) => I({...p, children: React.createElement('path', {d:'M9 5l7 7-7 7'})}),
  undo: (p={}) => I({...p, children: [
    React.createElement('path', {key:1, d:'M9 7L4 12l5 5'}),
    React.createElement('path', {key:2, d:'M4 12h11a5 5 0 0 1 0 10h-1'})
  ]}),
  redo: (p={}) => I({...p, children: [
    React.createElement('path', {key:1, d:'M15 7l5 5-5 5'}),
    React.createElement('path', {key:2, d:'M20 12H9a5 5 0 0 0 0 10h1'})
  ]}),
  history: (p={}) => I({...p, children: [
    React.createElement('path', {key:1, d:'M3 12a9 9 0 1 0 3-6.7L3 8'}),
    React.createElement('path', {key:2, d:'M3 4v4h4'}),
    React.createElement('path', {key:3, d:'M12 8v4l3 2'})
  ]}),
  download: (p={}) => I({...p, children: [
    React.createElement('path', {key:1, d:'M12 4v11M7 11l5 4 5-4'}),
    React.createElement('path', {key:2, d:'M4 19h16'})
  ]}),
  image: (p={}) => I({...p, children: [
    React.createElement('rect', {key:1, x:4, y:5, width:16, height:14, rx:2}),
    React.createElement('circle', {key:2, cx:9, cy:10, r:1.6}),
    React.createElement('path', {key:3, d:'M5 17l4.5-4 3.5 3 3-2.5L19 17'})
  ]}),
  zip: (p={}) => I({...p, children: [
    React.createElement('path', {key:1, d:'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'}),
    React.createElement('path', {key:2, d:'M10 4v3M12 6v2M10 9v2M12 11v2M10 14v3h2v-3'})
  ]}),
  type: (p={}) => I({...p, children: [
    React.createElement('path', {key:1, d:'M5 7V5h14v2M12 5v14M9 19h6'})
  ]}),
  attach: (p={}) => I({...p, children: React.createElement('path', {d:'M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 6'})}),
  send: (p={}) => I({...p, children: React.createElement('path', {d:'M4 12l16-7-7 16-2.5-6.5z'})}),
  alignL: (p={}) => I({...p, children: React.createElement('path', {d:'M4 6h16M4 10h10M4 14h16M4 18h10'})}),
  alignC: (p={}) => I({...p, children: React.createElement('path', {d:'M4 6h16M7 10h10M4 14h16M7 18h10'})}),
  alignR: (p={}) => I({...p, children: React.createElement('path', {d:'M4 6h16M10 10h10M4 14h16M10 18h10'})}),
  copy: (p={}) => I({...p, children: [
    React.createElement('rect', {key:1, x:8, y:8, width:12, height:12, rx:2}),
    React.createElement('path', {key:2, d:'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'})
  ]}),
  trash: (p={}) => I({...p, children: React.createElement('path', {d:'M5 7h14M10 7V5h4v2M6 7l1 12h10l1-12'})}),
  layout: (p={}) => I({...p, children: [
    React.createElement('rect', {key:1, x:4, y:4, width:16, height:16, rx:2}),
    React.createElement('path', {key:2, d:'M4 9h16M9 9v11'})
  ]}),
  drag: (p={}) => I({...p, children: React.createElement('path', {d:'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01'})}),
  brand: (p={}) => I({...p, children: [
    React.createElement('circle', {key:1, cx:12, cy:12, r:8}),
    React.createElement('circle', {key:2, cx:12, cy:12, r:3})
  ]}),
  message: (p={}) => I({...p, children: React.createElement('path', {d:'M4 5h16v11H9l-4 3v-3H4z'})}),
};
window.Icon = Icon;
