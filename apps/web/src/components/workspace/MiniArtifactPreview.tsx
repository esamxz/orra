import type { Card } from '@orra/shared';

interface Props {
  card: Card;
}

export default function MiniArtifactPreview({ card }: Props) {
  const textLayers = card.layers.filter((l) => l.type === 'text');
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: card.baseColor,
        borderRadius: 'inherit',
      }}
    >
      {textLayers.map((l) => {
        const topPct = Math.max(0, Math.min(100, (l.y / 1350) * 100));
        const leftPct = Math.max(0, Math.min(100, (l.x / 1080) * 100));
        const widthPct = Math.max(0, Math.min(100, (l.w / 1080) * 100));
        const fontSizeCqw = (l.fontSize / 1080) * 100;
        return (
          <div
            key={l.id}
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              fontFamily: l.fontFamily,
              fontSize: `${fontSizeCqw}cqw`,
              fontWeight: l.fontWeight,
              color: l.color,
              textAlign: l.align,
              lineHeight: l.lineHeight,
              opacity: l.opacity,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              pointerEvents: 'none',
            }}
          >
            {l.content}
          </div>
        );
      })}
    </div>
  );
}
