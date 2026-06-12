import type { ArtifactDocument } from '@orra/shared';
import { Icon } from '../../data/icons';
import MiniArtifactPreview from './MiniArtifactPreview';

// ---------------------------------------------------------------------------
// Carousel rail — extracted from WorkspacePage for W5
// ---------------------------------------------------------------------------
// Shows a vertical list of card thumbnails for carousel projects.
// Visible whenever a carousel artifact exists (not gated to 'generated' phase).
// Controls are disabled while a generation job is active.

interface Props {
  artifact: ArtifactDocument;
  activeCardIndex: number;
  ratio: string;
  isCardByCardMode: boolean;
  activeJobId?: string;
  onSelectCard: (index: number) => void;
  onAddCard: () => void;
  onDuplicateCard: (index: number) => void;
  onDeleteCard: (index: number, e?: React.MouseEvent) => void;
  onGenerateCard?: (cardId: string) => void;
}

function thumbSize(ratio: string): { w: number; h: number } {
  const [wStr, hStr] = ratio.split(':');
  const rw = parseFloat(wStr) || 1;
  const rh = parseFloat(hStr) || 1;
  const maxH = 78;
  const maxW = 120;
  if (rw / rh > maxW / maxH) {
    const w = maxW;
    return { w, h: Math.round((w * rh) / rw) };
  }
  const h = maxH;
  return { w: Math.round((h * rw) / rh), h };
}

export default function CarouselRail({
  artifact,
  activeCardIndex,
  ratio,
  isCardByCardMode,
  activeJobId,
  onSelectCard,
  onAddCard,
  onDuplicateCard,
  onDeleteCard,
  onGenerateCard,
}: Props) {
  const isDisabled = !!activeJobId;
  const t = thumbSize(ratio);

  return (
    <div className="rail">
      <div className="rail-head">
        {<Icon.carousel s={16} style={{ color: 'var(--muted)' }} />}
        <b>Carousel</b>
        <span className="count">{artifact.cards.length} cards</span>
        {isCardByCardMode && (
          <span className="cbcb-badge" title="Generate cards one at a time">Card&#8209;by&#8209;card</span>
        )}
        <div className="actions">
          <button
            className="btn-icon"
            style={{ width: 30, height: 30 }}
            title="Duplicate current"
            disabled={isDisabled}
            onClick={() => onDuplicateCard(activeCardIndex)}
          >
            {<Icon.copy s={16} />}
          </button>
          <button
            className="btn-icon"
            style={{ width: 30, height: 30 }}
            title="Delete current"
            disabled={isDisabled}
            onClick={() => onDeleteCard(activeCardIndex)}
          >
            {<Icon.trash s={16} />}
          </button>
        </div>
      </div>
      <div className="rail-track">
        {artifact.cards.map((c, i) => (
          <div
            key={c.id}
            className={'rail-item' + (i === activeCardIndex ? ' active' : '')}
            onClick={() => onSelectCard(i)}
          >
            <div className="rail-thumb" style={{ width: t.w, height: t.h, position: 'relative' }}>
              <MiniArtifactPreview card={c} />
              <span className="rail-num">{i + 1}</span>
              <button
                className="del"
                title="Delete card"
                disabled={isDisabled}
                onClick={(e) => onDeleteCard(i, e)}
              >
                {<Icon.x s={12} />}
              </button>
              {isCardByCardMode && onGenerateCard && (
                <button
                  className="rail-gen"
                  title="Generate this card"
                  disabled={isDisabled}
                  onClick={(e) => { e.stopPropagation(); onGenerateCard(c.id); }}
                >
                  {<Icon.spark s={11} />}
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          className="rail-add"
          disabled={isDisabled}
          onClick={onAddCard}
          title="Add card"
        >
          {<Icon.plus s={20} />}
        </button>
      </div>
    </div>
  );
}
