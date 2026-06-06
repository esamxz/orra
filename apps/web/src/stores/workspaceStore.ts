import { create } from 'zustand';
import type { Card, Layer } from '@orra/shared';

// ---------------------------------------------------------------------------
// Selection state
//
// UI/session state only. Never persisted. Never written into ArtifactDocument.
// ---------------------------------------------------------------------------

export interface WorkspaceSelectionState {
  activeCardIndex: number;
  selectedLayerId: string | null;
  selectedLayerType: string | null;

  setActiveCard: (index: number, cards?: Card[]) => void;
  selectLayer: (layerId: string, layerType: string) => void;
  clearSelection: () => void;
  syncSelectionWithCard: (card: Card) => void;
}

export function isLayerSelectable(layer: Layer): boolean {
  if (layer.hidden) return false;
  if (layer.type === 'background' || layer.type === 'overlay') return false;
  return true;
}

export function findSelectableLayer(card: Card, layerId: string): Layer | null {
  const layer = card.layers.find((l) => l.id === layerId);
  if (!layer) return null;
  if (!isLayerSelectable(layer)) return null;
  return layer;
}

export const useWorkspaceStore = create<WorkspaceSelectionState>((set, get) => ({
  activeCardIndex: 0,
  selectedLayerId: null,
  selectedLayerType: null,

  setActiveCard: (index, cards) => {
    set({ activeCardIndex: index });
    if (cards) {
      const card = cards[index];
      if (card) {
        get().syncSelectionWithCard(card);
      }
    }
  },

  selectLayer: (layerId, layerType) => {
    set({ selectedLayerId: layerId, selectedLayerType: layerType });
  },

  clearSelection: () => {
    set({ selectedLayerId: null, selectedLayerType: null });
  },

  syncSelectionWithCard: (card) => {
    const { selectedLayerId } = get();
    if (!selectedLayerId) return;
    const layer = findSelectableLayer(card, selectedLayerId);
    if (!layer) {
      set({ selectedLayerId: null, selectedLayerType: null });
    }
  },
}));
