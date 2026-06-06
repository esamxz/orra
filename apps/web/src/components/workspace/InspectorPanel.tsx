import { useWorkspaceStore } from '../../stores/workspaceStore';
import { APP_FONT_CATALOG } from '../../data/fonts';

export default function InspectorPanel() {
  const { artifact, activeCardId, selectedLayerId, updateLayerProp } = useWorkspaceStore();

  if (!artifact || !activeCardId || !selectedLayerId) {
    return (
      <div className="inspector-panel">
        <div className="inspector-panel__header">
          <span className="inspector-panel__title">Inspector</span>
        </div>
        <div className="inspector-panel__empty">
          Select a layer to edit its properties.
        </div>
      </div>
    );
  }

  const card = artifact.cards.find((c) => c.id === activeCardId);
  const layer = card?.layers.find((l) => l.id === selectedLayerId);
  if (!layer) return null;

  const isText = layer.type === 'text';

  return (
    <div className="inspector-panel">
      <div className="inspector-panel__header">
        <span className="inspector-panel__title">Inspector</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{layer.type}</span>
      </div>
      <div className="inspector-panel__body">
        {isText && (
          <>
            <div className="inspector__field">
              <span className="inspector__label">Content</span>
              <textarea
                className="orra-textarea"
                value={(layer.content as string) || ''}
                onChange={(e) => updateLayerProp(activeCardId, layer.id, 'content', e.target.value)}
                rows={3}
              />
            </div>

            <div className="inspector__field">
              <span className="inspector__label">Font family</span>
              <select
                className="orra-input"
                value={(layer.fontFamily as string) || 'Inter'}
                onChange={(e) => updateLayerProp(activeCardId, layer.id, 'fontFamily', e.target.value)}
              >
                {APP_FONT_CATALOG.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div className="inspector__row">
              <div className="inspector__field" style={{ flex: 1 }}>
                <span className="inspector__label">Size</span>
                <input
                  type="number"
                  className="orra-input"
                  value={Math.round((layer.fontSize as number) || 24)}
                  onChange={(e) => updateLayerProp(activeCardId, layer.id, 'fontSize', Number(e.target.value))}
                />
              </div>
              <div className="inspector__field" style={{ flex: 1 }}>
                <span className="inspector__label">Weight</span>
                <input
                  type="number"
                  className="orra-input"
                  value={(layer.fontWeight as number) || 400}
                  step={100}
                  min={100}
                  max={900}
                  onChange={(e) => updateLayerProp(activeCardId, layer.id, 'fontWeight', Number(e.target.value))}
                />
              </div>
            </div>

            <div className="inspector__field">
              <span className="inspector__label">Color</span>
              <input
                type="color"
                className="orra-input"
                value={(layer.color as string) || '#1d2a30'}
                onChange={(e) => updateLayerProp(activeCardId, layer.id, 'color', e.target.value)}
                style={{ height: '40px', padding: '2px', cursor: 'pointer' }}
              />
            </div>

            <div className="inspector__field">
              <span className="inspector__label">Align</span>
              <select
                className="orra-input"
                value={(layer.align as string) || 'left'}
                onChange={(e) => updateLayerProp(activeCardId, layer.id, 'align', e.target.value)}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </>
        )}

        <div className="inspector__field">
          <span className="inspector__label">Opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={layer.opacity}
            onChange={(e) => updateLayerProp(activeCardId, layer.id, 'opacity', Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div className="inspector__row">
          <div className="inspector__field" style={{ flex: 1 }}>
            <span className="inspector__label">X</span>
            <input
              type="number"
              className="orra-input"
              value={Math.round(layer.x)}
              onChange={(e) => updateLayerProp(activeCardId, layer.id, 'x', Number(e.target.value))}
            />
          </div>
          <div className="inspector__field" style={{ flex: 1 }}>
            <span className="inspector__label">Y</span>
            <input
              type="number"
              className="orra-input"
              value={Math.round(layer.y)}
              onChange={(e) => updateLayerProp(activeCardId, layer.id, 'y', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="inspector__row">
          <div className="inspector__field" style={{ flex: 1 }}>
            <span className="inspector__label">W</span>
            <input
              type="number"
              className="orra-input"
              value={Math.round(layer.w)}
              onChange={(e) => updateLayerProp(activeCardId, layer.id, 'w', Number(e.target.value))}
            />
          </div>
          <div className="inspector__field" style={{ flex: 1 }}>
            <span className="inspector__label">H</span>
            <input
              type="number"
              className="orra-input"
              value={Math.round(layer.h)}
              onChange={(e) => updateLayerProp(activeCardId, layer.id, 'h', Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
