import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Icon } from '../../data/icons';
import type { Layer, Action, TextLayer } from '@orra/shared';
import {
  getFontByFamily,
  getFontsByCategory,
  isSupportedFontFamily,
} from '@orra/shared';
import {
  buildSetTextContentAction,
  buildSetTextStyleAction,
  buildUpdateLayerPropsAction,
  buildRemoveLayerAction,
  buildAddLayerAction,
  buildReorderLayersAction,
} from './inspectorActions';

interface Props {
  layer: Layer;
  cardId: string;
  cardW: number;
  cardH: number;
  cardLayers?: Layer[];
  onAction: (action: Action) => void;
  onClose: () => void;
  brandColors?: string[];
  brandFonts?: string[];
}

type StylePresetKey = 'modern' | 'editorial' | 'bold' | 'custom';

const STYLE_PRESETS: Record<StylePresetKey, { label: string; fontFamily?: string; fontWeight?: number }> = {
  modern:   { label: 'Modern',   fontFamily: 'Inter',       fontWeight: 600 },
  editorial:{ label: 'Editorial',fontFamily: 'Newsreader',  fontWeight: 500 },
  bold:     { label: 'Bold',     fontFamily: 'Bebas Neue',  fontWeight: 400 },
  custom:   { label: 'Custom' },
};

const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

const FONT_CATEGORIES = [
  { key: 'sans'    as const, label: 'Sans'    },
  { key: 'serif'   as const, label: 'Serif'   },
  { key: 'display' as const, label: 'Display' },
  { key: 'poster'  as const, label: 'Poster'  },
  { key: 'script'  as const, label: 'Script'  },
  { key: 'mono'    as const, label: 'Mono'    },
  { key: 'arabic'  as const, label: 'Arabic'  },
];

function layerTypeIcon(type: string) {
  switch (type) {
    case 'text':       return <Icon.layerText s={14} />;
    case 'image':      return <Icon.layerImage s={14} />;
    case 'object':     return <Icon.layerObject s={14} />;
    case 'logo':       return <Icon.layerLogo s={14} />;
    case 'shape':      return <Icon.layerShape s={14} />;
    case 'overlay':    return <Icon.layerOverlay s={14} />;
    case 'background': return <Icon.layerBackground s={14} />;
    default:           return <Icon.type s={14} />;
  }
}

function layerTypeLabel(type: string): string {
  switch (type) {
    case 'text':       return 'Text layer';
    case 'background': return 'Background layer';
    case 'image':      return 'Image layer';
    case 'object':     return 'Object layer';
    case 'logo':       return 'Logo layer';
    case 'shape':      return 'Shape layer';
    case 'overlay':    return 'Overlay layer';
    default:           return `${type} layer`;
  }
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="insp-section">
      {title && <div className="insp-section-title">{title}</div>}
      {children}
    </div>
  );
}

function SliderInput({
  label, value, min, max, step, suffix = '', disabled, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  suffix?: string; disabled?: boolean; onChange: (v: number) => void;
}) {
  return (
    <div className="insp-field">
      <div className="insp-field-header">
        <span className="insp-field-label">{label}</span>
        <span className="insp-field-value">{value}{suffix}</span>
      </div>
      <input
        type="range" className="insp-slider"
        min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

function CompactNumber({
  label, value, disabled, onChange, suffix = '',
}: {
  label: string; value: number; disabled?: boolean; onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div className="insp-compact">
      <span className="insp-compact-label">{label}</span>
      <input
        type="number" className="insp-compact-input"
        value={value} disabled={disabled}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }}
      />
      {suffix && <span className="insp-compact-suffix">{suffix}</span>}
    </div>
  );
}

function SwatchInput({
  label, value, disabled, brandColors = [], onChange,
}: {
  label: string; value: string; disabled?: boolean; brandColors?: string[]; onChange: (v: string) => void;
}) {
  const presets = useMemo(() => {
    const neutrals = ['#1d2a30', '#354e53', '#5e7680', '#a4b7bd', '#c8d1d8', '#e6eaeb', '#f1f4f4', '#ffffff'];
    return Array.from(new Set([...brandColors, ...neutrals]));
  }, [brandColors]);

  return (
    <div className="insp-field">
      <div className="insp-field-header">
        <span className="insp-field-label">{label}</span>
        <span className="insp-field-value">{value}</span>
      </div>
      <div className="insp-swatches">
        {presets.map((c) => (
          <button
            key={c}
            className={`insp-swatch${c.toLowerCase() === value.toLowerCase() ? ' active' : ''}`}
            style={{ background: c }}
            disabled={disabled}
            onClick={() => onChange(c)}
            aria-label={`Select color ${c}`}
          />
        ))}
        <div className="insp-swatch-custom">
          <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} title="Custom color" />
        </div>
      </div>
    </div>
  );
}

function AlignmentInput({
  value, disabled, onChange,
}: {
  value: 'left' | 'center' | 'right'; disabled?: boolean; onChange: (v: 'left' | 'center' | 'right') => void;
}) {
  const opts = [
    { key: 'left'   as const, icon: <Icon.alignL s={14} /> },
    { key: 'center' as const, icon: <Icon.alignC s={14} /> },
    { key: 'right'  as const, icon: <Icon.alignR s={14} /> },
  ];
  return (
    <div className="insp-seg">
      {opts.map((o) => (
        <button key={o.key} className={o.key === value ? 'on' : ''} disabled={disabled} onClick={() => onChange(o.key)} title={o.key}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}

function StylePresetInput({
  disabled, onApply,
}: {
  disabled?: boolean; onApply: (preset: StylePresetKey) => void;
}) {
  const [active, setActive] = useState<StylePresetKey>('custom');

  const handle = (key: StylePresetKey) => {
    setActive(key);
    onApply(key);
  };

  return (
    <div className="insp-seg">
      {(Object.keys(STYLE_PRESETS) as StylePresetKey[]).map((key) => (
        <button
          key={key}
          className={active === key ? 'on' : ''}
          disabled={disabled}
          onClick={() => handle(key)}
        >
          {STYLE_PRESETS[key].label}
        </button>
      ))}
    </div>
  );
}

function FontDropdown({
  value, disabled, brandFonts = [], onChange,
}: {
  value: string; disabled?: boolean; brandFonts?: string[]; onChange: (family: string) => void;
}) {
  const currentMeta = getFontByFamily(value);

  // Fallback unsupported fonts to a safe catalog default
  const fallbackRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (currentMeta) { fallbackRef.current = false; return; }
    if (!disabled && !fallbackRef.current) {
      fallbackRef.current = true;
      if (value !== 'Inter') onChangeRef.current('Inter');
    }
  }, [currentMeta, disabled, value]);

  const validBrandFonts = brandFonts.filter(isSupportedFontFamily);

  return (
    <div className="insp-field">
      <select
        className="insp-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {validBrandFonts.length > 0 && (
          <optgroup label="Brand">
            {validBrandFonts.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
            ))}
          </optgroup>
        )}
        {FONT_CATEGORIES.map((cat) => (
          <optgroup key={cat.key} label={cat.label}>
            {getFontsByCategory(cat.key).map((f) => (
              <option key={f.id} value={f.family} style={{ fontFamily: f.family }}>{f.family}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function WeightDropdown({
  value, fontFamily, disabled, onChange,
}: {
  value: number; fontFamily: string; disabled?: boolean; onChange: (w: number) => void;
}) {
  const meta = getFontByFamily(fontFamily);
  const weights = meta?.weights ?? [400];

  return (
    <div className="insp-field">
      <select
        className="insp-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
      >
        {weights.map((w) => (
          <option key={w} value={w}>
            {WEIGHT_LABELS[w] ? `${WEIGHT_LABELS[w]} (${w})` : String(w)}
          </option>
        ))}
      </select>
    </div>
  );
}

function PositionControl({
  label, value, max, disabled, onChange,
}: {
  label: string; value: number; max: number; disabled?: boolean; onChange: (px: number) => void;
}) {
  const percent = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div className="insp-pos">
      <div className="insp-pos-header">
        <span className="insp-pos-label">{label}</span>
        <div className="insp-pos-input-wrap">
          <input
            type="number" className="insp-pos-input"
            value={percent} min={0} max={100} disabled={disabled}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(Math.round((v / 100) * max)); }}
          />
          <span className="insp-pos-suffix">%</span>
        </div>
      </div>
      <input
        type="range" className="insp-slider"
        min={0} max={100} step={1} value={percent} disabled={disabled}
        onChange={(e) => onChange(Math.round((parseFloat(e.target.value) / 100) * max))}
      />
    </div>
  );
}

export default function Inspector({ layer, cardId, cardW, cardH, cardLayers, onAction, onClose, brandColors, brandFonts }: Props) {
  const isLocked = layer.locked;
  const isBackground = layer.type === 'background';
  const isText = layer.type === 'text';
  const textLayer = isText ? (layer as TextLayer) : null;

  const layerOrderSorted = cardLayers ? [...cardLayers].sort((a, b) => a.z - b.z) : [];
  const myLayerIdx = layerOrderSorted.findIndex((l) => l.id === layer.id);
  const bgLayerIdx = layerOrderSorted.findIndex((l) => l.type === 'background');
  const minMovableIdx = bgLayerIdx >= 0 ? bgLayerIdx + 1 : 0;
  const isAtTop = myLayerIdx !== -1 && myLayerIdx === layerOrderSorted.length - 1;
  const isAtBottom = myLayerIdx >= 0 && myLayerIdx <= minMovableIdx;

  const dispatchTextContent = useCallback(
    (content: string) => { onAction(buildSetTextContentAction(cardId, layer.id, content)); },
    [cardId, layer.id, onAction],
  );

  // Local state for text content — dispatches once on blur (not per keystroke)
  const [localContent, setLocalContent] = useState(textLayer?.content ?? '');
  useEffect(() => {
    setLocalContent(textLayer?.content ?? '');
  }, [textLayer?.id, textLayer?.content]);

  const dispatchTextStyle = useCallback(
    (style: Parameters<typeof buildSetTextStyleAction>[2]) => { onAction(buildSetTextStyleAction(cardId, layer.id, style)); },
    [cardId, layer.id, onAction],
  );

  const dispatchGeometry = useCallback(
    (props: Parameters<typeof buildUpdateLayerPropsAction>[2]) => { onAction(buildUpdateLayerPropsAction(cardId, layer.id, props)); },
    [cardId, layer.id, onAction],
  );

  const handleApplyPreset = useCallback(
    (key: StylePresetKey) => {
      const preset = STYLE_PRESETS[key];
      if (preset.fontFamily && preset.fontWeight !== undefined) {
        dispatchTextStyle({ fontFamily: preset.fontFamily, fontWeight: preset.fontWeight });
      }
    },
    [dispatchTextStyle],
  );

  const handleBringToFront = useCallback(() => {
    if (!cardLayers) return;
    const sorted = [...cardLayers].sort((a, b) => a.z - b.z);
    const rest = sorted.filter((l) => l.id !== layer.id);
    onAction(buildReorderLayersAction(cardId, [...rest.map((l) => l.id), layer.id]));
  }, [cardId, cardLayers, layer.id, onAction]);

  const handleSendBehind = useCallback(() => {
    if (!cardLayers) return;
    const sorted = [...cardLayers].sort((a, b) => a.z - b.z);
    const rest = sorted.filter((l) => l.id !== layer.id);
    const bgIdx = rest.findIndex((l) => l.type === 'background');
    const insertAt = bgIdx >= 0 ? bgIdx + 1 : 0;
    const newOrder = [
      ...rest.slice(0, insertAt).map((l) => l.id),
      layer.id,
      ...rest.slice(insertAt).map((l) => l.id),
    ];
    onAction(buildReorderLayersAction(cardId, newOrder));
  }, [cardId, cardLayers, layer.id, onAction]);

  const handleDuplicate = useCallback(() => {
    const dupId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dup: Layer = { ...structuredClone(layer), id: dupId, z: layer.z + 1 };
    onAction(buildAddLayerAction(cardId, dup));
  }, [cardId, layer, onAction]);

  const handleDelete = useCallback(() => {
    onAction(buildRemoveLayerAction(cardId, layer.id));
    onClose();
  }, [cardId, layer.id, onAction, onClose]);

  return (
    <div className="inspector">
      {/* Header */}
      <div className="insp-head">
        <div className="insp-head-left">
          <span className="insp-head-icon">{layerTypeIcon(layer.type)}</span>
          <span className="insp-head-title">{layerTypeLabel(layer.type)}</span>
          {isLocked && (
            <span className="insp-head-locked">
              {<Icon.lock s={11} />}
              <span>Locked</span>
            </span>
          )}
        </div>
        <button className="insp-head-close" onClick={onClose}>{<Icon.x s={14} />}</button>
      </div>

      <div className="insp-body">
        {/* Text content */}
        {textLayer && (
          <Section>
            <textarea
              className="insp-content"
              value={localContent}
              disabled={isLocked}
              onChange={(e) => setLocalContent(e.target.value)}
              onBlur={(e) => { if (e.target.value !== textLayer.content) dispatchTextContent(e.target.value); }}
              rows={3}
              placeholder="Type something…"
            />
          </Section>
        )}

        {/* Style preset */}
        {textLayer && (
          <Section title="Style">
            <StylePresetInput disabled={isLocked} onApply={handleApplyPreset} />
          </Section>
        )}

        {/* Font */}
        {textLayer && (
          <Section title="Font">
            <FontDropdown
              value={textLayer.fontFamily}
              disabled={isLocked}
              brandFonts={brandFonts}
              onChange={(fontFamily) => dispatchTextStyle({ fontFamily })}
            />
          </Section>
        )}

        {/* Weight */}
        {textLayer && (
          <Section title="Weight">
            <WeightDropdown
              value={textLayer.fontWeight}
              fontFamily={textLayer.fontFamily}
              disabled={isLocked}
              onChange={(fontWeight) => dispatchTextStyle({ fontWeight })}
            />
          </Section>
        )}

        {/* Size */}
        {textLayer && (
          <Section title="Size">
            <SliderInput
              label="Font size"
              value={textLayer.fontSize}
              min={8} max={200} step={1}
              suffix="px"
              disabled={isLocked}
              onChange={(fontSize) => dispatchTextStyle({ fontSize })}
            />
          </Section>
        )}

        {/* Color */}
        {textLayer && (
          <Section title="Color">
            <SwatchInput
              label="Text color"
              value={textLayer.color}
              disabled={isLocked}
              brandColors={brandColors}
              onChange={(color) => dispatchTextStyle({ color })}
            />
          </Section>
        )}

        {/* Alignment */}
        {textLayer && (
          <Section title="Alignment">
            <AlignmentInput
              value={textLayer.align}
              disabled={isLocked}
              onChange={(align) => dispatchTextStyle({ align })}
            />
          </Section>
        )}

        {/* Layer ordering */}
        {textLayer && cardLayers && (
          <Section title="Layer">
            <div className="insp-seg">
              <button
                disabled={isLocked || isBackground || isAtTop}
                title={
                  isLocked ? 'Layer is locked'
                  : isBackground ? 'Background cannot be moved'
                  : isAtTop ? 'Already at front'
                  : undefined
                }
                onClick={handleBringToFront}
              >
                In Front
              </button>
              <button
                disabled={isLocked || isBackground || isAtBottom}
                title={
                  isLocked ? 'Layer is locked'
                  : isBackground ? 'Background cannot be moved'
                  : isAtBottom ? 'Already at back'
                  : undefined
                }
                onClick={handleSendBehind}
              >
                Behind
              </button>
            </div>
          </Section>
        )}

        {/* Opacity */}
        <Section title="Opacity">
          <SliderInput
            label="Opacity"
            value={Math.round(layer.opacity * 100)}
            min={0} max={100} step={1}
            suffix="%"
            disabled={isLocked}
            onChange={(v) => dispatchGeometry({ opacity: v / 100 })}
          />
        </Section>

        {/* Position */}
        <Section title="Position">
          <div className="insp-pair">
            <PositionControl label="X" value={layer.x} max={cardW} disabled={isLocked} onChange={(x) => dispatchGeometry({ x })} />
            <PositionControl label="Y" value={layer.y} max={cardH} disabled={isLocked} onChange={(y) => dispatchGeometry({ y })} />
          </div>
        </Section>

        {/* Dimensions */}
        <Section title="Dimensions">
          <div className="insp-pair">
            <CompactNumber label="W" value={layer.w} disabled={isLocked} onChange={(w) => dispatchGeometry({ w })} />
            <CompactNumber label="H" value={layer.h} disabled={isLocked} onChange={(h) => dispatchGeometry({ h })} />
          </div>
        </Section>

        {/* Rotation */}
        <Section title="Rotation">
          <CompactNumber label="Angle" value={layer.rotation} disabled={isLocked} onChange={(rotation) => dispatchGeometry({ rotation })} suffix="°" />
        </Section>

        {/* Shape fill — read-only in v1 */}
        {layer.type === 'shape' && layer.fill && (
          <Section title="Fill">
            <SwatchInput
              label="Fill color"
              value={layer.fill}
              disabled={isLocked}
              brandColors={brandColors}
              onChange={() => {
                // Shape fill is not part of updateLayerProps or setTextStyle.
                // No kernel action for shape fill yet — read-only in v1.
              }}
            />
          </Section>
        )}

        {/* Logo / Image / Object read-only info */}
        {(layer.type === 'logo' || layer.type === 'image' || layer.type === 'object') && (
          <Section>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', color: 'var(--muted)' }}>
              <div>
                {(layer as { assetId?: string }).assetId
                  ? (layer.type === 'image' ? 'Project asset' : 'Loaded')
                  : 'None'}
              </div>
              {layer.type === 'logo' && <div style={{ fontSize: '11.5px', opacity: 0.7 }}>Logo asset cannot be changed</div>}
            </div>
          </Section>
        )}

        {/* Footer */}
        <div className="insp-footer">
          <button className="insp-footer-btn" disabled={isLocked} onClick={handleDuplicate} title={isLocked ? 'Layer is locked' : 'Duplicate layer'}>
            {<Icon.duplicate s={14} />}
            <span>Duplicate</span>
          </button>
          <button className="insp-footer-btn danger" disabled={isLocked} onClick={handleDelete} title={isLocked ? 'Layer is locked' : 'Delete layer'}>
            {<Icon.trash s={14} />}
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
