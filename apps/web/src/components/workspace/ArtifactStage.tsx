import { useWorkspaceStore } from '../../stores/workspaceStore';

export default function ArtifactStage() {
  const { artifact, activeCardId, selectedLayerId, setSelectedLayer } = useWorkspaceStore();

  if (!artifact || !activeCardId) {
    return (
      <div className="stage-area__canvas">
        <div className="empty-state">
          <h3>No design yet</h3>
          <p>Send a message to start creating.</p>
        </div>
      </div>
    );
  }

  const card = artifact.cards.find((c) => c.id === activeCardId);
  if (!card) return null;

  const { ratio } = artifact;
  const scale = Math.min(1, (window.innerWidth - 400) / ratio.w);
  const displayW = ratio.w * scale;
  const displayH = ratio.h * scale;

  return (
    <div className="stage-area__canvas">
      <div
        className="mock-card"
        style={{
          width: displayW,
          height: displayH,
          background: card.baseColor,
        }}
        onClick={() => setSelectedLayer(null)}
      >
        <div className="mock-card__bg" style={{ background: card.baseColor }} />
        {card.layers.map((layer) => {
          const isText = layer.type === 'text';
          const isSelected = layer.id === selectedLayerId;
          const style: React.CSSProperties = {
            left: (layer.x / ratio.w) * displayW,
            top: (layer.y / ratio.h) * displayH,
            width: (layer.w / ratio.w) * displayW,
            height: (layer.h / ratio.h) * displayH,
            opacity: layer.opacity,
            transform: `rotate(${layer.rotation}deg)`,
            display: layer.hidden ? 'none' : 'block',
          };

          if (isText) {
            style.fontFamily = (layer.fontFamily as string) || 'Inter';
            style.fontSize = `${((layer.fontSize as number) || 24) * scale}px`;
            style.fontWeight = (layer.fontWeight as number) || 400;
            style.lineHeight = layer.lineHeight as number || 1.2;
            style.letterSpacing = `${(layer.letterSpacing as number) || 0}px`;
            style.color = (layer.color as string) || '#1d2a30';
            style.textAlign = (layer.align as 'left' | 'center' | 'right' | undefined) || 'left';
          }

          return (
            <div
              key={layer.id}
              className={`mock-card__layer ${isText ? 'mock-card__layer--text' : ''} ${isSelected ? 'mock-card__layer--selected' : ''}`}
              style={style}
              onClick={(e) => {
                e.stopPropagation();
                if (!layer.locked) setSelectedLayer(layer.id);
              }}
              title={layer.type}
            >
              {isText ? (layer.content as string) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
