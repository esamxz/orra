import { Plus, Copy, Trash2 } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export default function CarouselRail() {
  const { artifact, activeCardId, setActiveCard, addCard, duplicateCard, removeCard } = useWorkspaceStore();

  if (!artifact || artifact.cards.length <= 1) return null;

  return (
    <div className="carousel-rail">
      {artifact.cards.map((card) => (
        <div
          key={card.id}
          className={`carousel-rail__thumb ${activeCardId === card.id ? 'carousel-rail__thumb--active' : ''}`}
          onClick={() => setActiveCard(card.id)}
          title={`Card ${card.index + 1}`}
        >
          <div>{card.index + 1}</div>
          {activeCardId === card.id && (
            <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
              <button
                className="orra-btn orra-btn--small orra-btn--ghost"
                style={{ padding: '2px' }}
                onClick={(e) => { e.stopPropagation(); duplicateCard(card.id); }}
                title="Duplicate"
              >
                <Copy size={10} />
              </button>
              <button
                className="orra-btn orra-btn--small orra-btn--ghost"
                style={{ padding: '2px' }}
                onClick={(e) => { e.stopPropagation(); removeCard(card.id); }}
                title="Delete"
              >
                <Trash2 size={10} />
              </button>
            </div>
          )}
        </div>
      ))}
      <button className="carousel-rail__add" onClick={addCard} title="Add card">
        <Plus size={16} />
      </button>
    </div>
  );
}
