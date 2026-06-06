import { Icon } from '../../data/icons';
import type { Layer } from '@orra/shared';
import { getFontByFamily } from '@orra/shared';

interface Props {
  layer: Layer;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="insp-field">
      <label>{label}</label>
      <div className="insp-select" style={{ height: 'auto', padding: '8px 11px', color: 'var(--ink)', background: 'var(--inset)', cursor: 'default' }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12, marginTop: 4 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function layerTypeLabel(type: string): string {
  switch (type) {
    case 'text': return 'Text';
    case 'background': return 'Background';
    case 'image': return 'Image';
    case 'object': return 'Object';
    case 'logo': return 'Logo';
    case 'shape': return 'Shape';
    case 'overlay': return 'Overlay';
    default: return type;
  }
}

function FontInfo({ family }: { family: string }) {
  const meta = getFontByFamily(family);
  if (!meta) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{family}</span>
        <span style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 500 }}>Unknown</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: meta.family, fontSize: 15 }}>{meta.family}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
        {meta.category} · {meta.roleSuggestion}
      </span>
    </div>
  );
}

export default function Inspector({ layer, onClose }: Props) {
  const isLocked = layer.locked;

  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="ic">{<Icon.type s={14} />}</span>
        <b>{layerTypeLabel(layer.type)} layer</b>
        {isLocked && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>Locked</span>}
        <button className="btn-icon x" style={{ width: 28, height: 28 }} onClick={onClose}>{<Icon.x s={15} />}</button>
      </div>
      <div className="insp-body">
        {/* Common geometry */}
        <Section title="Position">
          <div className="nudge">
            <div className="np"><span>X</span><b>{layer.x}px</b></div>
            <div className="np"><span>Y</span><b>{layer.y}px</b></div>
          </div>
          <div className="nudge">
            <div className="np"><span>W</span><b>{layer.w}px</b></div>
            <div className="np"><span>H</span><b>{layer.h}px</b></div>
          </div>
          <div className="nudge">
            <div className="np"><span>Rotation</span><b>{layer.rotation}°</b></div>
            <div className="np"><span>Opacity</span><b>{Math.round(layer.opacity * 100)}%</b></div>
          </div>
        </Section>

        {/* Text-specific */}
        {layer.type === 'text' && (
          <Section title="Typography">
            <Field label="Content" value={layer.content} />
            <div className="insp-field">
              <label>Font family</label>
              <div className="insp-select" style={{ height: 'auto', padding: '8px 11px', background: 'var(--inset)', cursor: 'default' }}>
                <FontInfo family={layer.fontFamily} />
              </div>
            </div>
            <Field label="Font size" value={`${layer.fontSize}px`} />
            <Field label="Font weight" value={String(layer.fontWeight)} />
            <Field label="Line height" value={String(layer.lineHeight)} />
            <Field label="Letter spacing" value={`${layer.letterSpacing}px`} />
            <div className="insp-field">
              <label>Color</label>
              <div className="sw-row">
                <span className="sw on" style={{ background: layer.color, cursor: 'default' }} />
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>{layer.color}</span>
              </div>
            </div>
            <Field label="Alignment" value={layer.align} />
          </Section>
        )}

        {/* Image-backed layers */}
        {(layer.type === 'image' || layer.type === 'object' || layer.type === 'logo' || layer.type === 'background') && (
          <Section title="Asset">
            <Field label="Asset ID" value={layer.assetId} />
            {'fit' in layer && <Field label="Fit" value={layer.fit} />}
            {'aiManaged' in layer && layer.type !== 'logo' && (
              <Field label="AI managed" value={layer.aiManaged ? 'Yes' : 'No'} />
            )}
            {'sourcePrompt' in layer && layer.sourcePrompt && (
              <Field label="Source prompt" value={layer.sourcePrompt} />
            )}
          </Section>
        )}

        {/* Shape */}
        {layer.type === 'shape' && (
          <Section title="Shape">
            <Field label="Kind" value={layer.shapeKind} />
            {layer.fill && (
              <div className="insp-field">
                <label>Fill</label>
                <div className="sw-row">
                  <span className="sw on" style={{ background: layer.fill, cursor: 'default' }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>{layer.fill}</span>
                </div>
              </div>
            )}
            {layer.stroke && (
              <div className="insp-field">
                <label>Stroke</label>
                <div className="nudge">
                  <div className="np"><span>Color</span><b>{layer.stroke.color}</b></div>
                  <div className="np"><span>Width</span><b>{layer.stroke.width}px</b></div>
                </div>
              </div>
            )}
            {layer.cornerRadius !== undefined && (
              <Field label="Corner radius" value={`${layer.cornerRadius}px`} />
            )}
          </Section>
        )}

        {/* Overlay */}
        {layer.type === 'overlay' && (
          <Section title="Overlay">
            <Field label="Kind" value={layer.overlayKind} />
            {'color' in layer.params && layer.params.color && (
              <div className="insp-field">
                <label>Color</label>
                <div className="sw-row">
                  <span className="sw on" style={{ background: layer.params.color as string, cursor: 'default' }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>{layer.params.color as string}</span>
                </div>
              </div>
            )}
            {'stops' in layer.params && Array.isArray(layer.params.stops) && (
              <Field label="Stops" value={`${(layer.params.stops as unknown[]).length} stops`} />
            )}
            {'angle' in layer.params && layer.params.angle !== undefined && (
              <Field label="Angle" value={`${layer.params.angle}°`} />
            )}
            {'blurRadius' in layer.params && layer.params.blurRadius !== undefined && (
              <Field label="Blur radius" value={`${layer.params.blurRadius}px`} />
            )}
          </Section>
        )}

        {/* Layer state */}
        <Section title="State">
          <div className="nudge">
            <div className="np"><span>Locked</span><b>{isLocked ? 'Yes' : 'No'}</b></div>
            <div className="np"><span>Hidden</span><b>{layer.hidden ? 'Yes' : 'No'}</b></div>
          </div>
          <Field label="Z-index" value={String(layer.z)} />
          <Field label="Layer ID" value={layer.id} />
        </Section>
      </div>
    </div>
  );
}
