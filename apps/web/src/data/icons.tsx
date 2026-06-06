/* ORRA — line icons (stroke, currentColor) */
import React from 'react';

interface IconProps {
  s?: number;
  w?: number;
  style?: React.CSSProperties;
}

const I: React.FC<{ s?: number; w?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ s = 18, w = 1.7, style, children }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {children}
  </svg>
);

export const Icon = {
  post: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M4 15l4-4 3 3 4-4 5 5" />
      <circle cx="9" cy="9" r="1.4" />
    </I>
  ),
  carousel: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <rect x="7" y="5" width="10" height="14" rx="2.4" />
      <path d="M4 8v8M20 8v8" />
    </I>
  ),
  assets: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 13l4-3 4 3 3-2 5 4" />
    </I>
  ),
  spark: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />
    </I>
  ),
  sparkFill: ({ s, style }: IconProps) => (
    <svg width={s || 18} height={s || 18} viewBox="0 0 24 24" fill="currentColor" style={style}>
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" />
      <path d="M18 14l.7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7z" />
    </svg>
  ),
  search: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </I>
  ),
  caret: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M6 9l6 6 6-6" />
    </I>
  ),
  plus: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M12 5v14M5 12h14" />
    </I>
  ),
  x: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M6 6l12 12M18 6L6 18" />
    </I>
  ),
  check: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M5 12l4.5 4.5L19 7" />
    </I>
  ),
  arrowLeft: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M15 5l-7 7 7 7" />
    </I>
  ),
  arrowRight: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M9 5l7 7-7 7" />
    </I>
  ),
  undo: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
    </I>
  ),
  redo: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H9a5 5 0 0 0 0 10h1" />
    </I>
  ),
  history: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </I>
  ),
  download: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M12 4v11M7 11l5 4 5-4" />
      <path d="M4 19h16" />
    </I>
  ),
  image: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M5 17l4.5-4 3.5 3 3-2.5L19 17" />
    </I>
  ),
  zip: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M10 4v3M12 6v2M10 9v2M12 11v2M10 14v3h2v-3" />
    </I>
  ),
  type: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M5 7V5h14v2M12 5v14M9 19h6" />
    </I>
  ),
  attach: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 6" />
    </I>
  ),
  send: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M4 12l16-7-7 16-2.5-6.5z" />
    </I>
  ),
  alignL: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
    </I>
  ),
  alignC: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
    </I>
  ),
  alignR: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
    </I>
  ),
  copy: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </I>
  ),
  trash: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M5 7h14M10 7V5h4v2M6 7l1 12h10l1-12" />
    </I>
  ),
  layout: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 9v11" />
    </I>
  ),
  drag: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
    </I>
  ),
  brand: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </I>
  ),
  message: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M4 5h16v11H9l-4 3v-3H4z" />
    </I>
  ),
  moon: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </I>
  ),
  sun: ({ s, w, style }: IconProps) => (
    <I s={s} w={w} style={style}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </I>
  ),
};
