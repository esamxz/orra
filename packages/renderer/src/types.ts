// ---------------------------------------------------------------------------
// Render-ready layer types
// ---------------------------------------------------------------------------

export type RenderTextLayer = {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  align: 'left' | 'center' | 'right';
};

export type RenderBackgroundLayer = {
  kind: 'background';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  assetId: string;
  baseColor: string;
};

export type RenderImageLayer = {
  kind: 'image';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  assetId: string;
};

export type RenderObjectLayer = {
  kind: 'object';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  assetId: string;
};

export type RenderLogoLayer = {
  kind: 'logo';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  assetId: string;
};

export type RenderShapeLayer = {
  kind: 'shape';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  shapeKind: 'rect' | 'ellipse' | 'line';
  fill?: string;
  stroke?: { color: string; width: number };
  cornerRadius?: number;
};

export type RenderOverlayLayer = {
  kind: 'overlay';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  overlayKind: 'linearGradient' | 'radialGradient' | 'solid' | 'blur';
  params: Record<string, unknown>;
};

export type RenderLayer =
  | RenderTextLayer
  | RenderBackgroundLayer
  | RenderImageLayer
  | RenderObjectLayer
  | RenderLogoLayer
  | RenderShapeLayer
  | RenderOverlayLayer;

// ---------------------------------------------------------------------------
// Render-ready card data
// ---------------------------------------------------------------------------

export type RenderCardData = {
  width: number;
  height: number;
  baseColor: string;
  layers: RenderLayer[];
};
