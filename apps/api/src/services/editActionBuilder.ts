// ---------------------------------------------------------------------------
// Edit Action Builder
// ---------------------------------------------------------------------------
// Maps an EditIntent + current ArtifactDocument + selectedCardIndex to
// a list of kernel Action objects ready to be applied via applyAction().
//
// Returns an empty array when the intent cannot be mapped (e.g., no matching
// layer found). The caller should treat an empty return as "cannot apply" and
// respond with a friendly clarification message instead.
// ---------------------------------------------------------------------------

import type { ArtifactDocument, Action, TextLayer } from '@orra/shared';
import type { EditIntent } from './editIntentService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findTextLayer(layers: ArtifactDocument['cards'][number]['layers'], role: 'title' | 'accent' | 'any'): TextLayer | undefined {
  if (role === 'any') {
    return layers.find((l): l is TextLayer => l.type === 'text');
  }
  if (role === 'accent') {
    // Try accent first, then fall back to any non-title text layer
    const accent = layers.find((l): l is TextLayer => l.type === 'text' && l.role === 'accent');
    if (accent) return accent;
    // Last text layer that isn't the title
    const nonTitle = layers.filter((l): l is TextLayer => l.type === 'text' && l.role !== 'title');
    return nonTitle[nonTitle.length - 1];
  }
  return layers.find((l): l is TextLayer => l.type === 'text' && l.role === role);
}

function findAnyTextLayer(layers: ArtifactDocument['cards'][number]['layers']): TextLayer | undefined {
  // Prefer title layer, then any text layer
  return findTextLayer(layers, 'title') ?? findTextLayer(layers, 'any');
}

function defaultTextLayer(): TextLayer {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    z: 1,
    x: 80,
    y: 200,
    w: 920,
    h: 200,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    content: '',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: -0.5,
    color: '#f1f4f4',
    align: 'center',
    role: 'title',
  };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build kernel actions for the given edit intent on the selected card.
 * Returns an empty array when the intent cannot be applied to the current document.
 */
export function buildEditActions(
  intent: EditIntent,
  document: ArtifactDocument,
  selectedCardIndex: number,
): Action[] {
  // Guard: card index must be valid
  const card = document.cards[selectedCardIndex];
  if (!card) return [];

  switch (intent.type) {
    case 'text_content': {
      const roleToFind = intent.targetRole === 'cta' ? 'accent' : 'title';
      const layer = findTextLayer(card.layers, roleToFind);
      if (!layer || !intent.newContent) return [];
      return [{ type: 'setTextContent', cardId: card.id, layerId: layer.id, content: intent.newContent }];
    }

    case 'text_size_increase': {
      const layer = findAnyTextLayer(card.layers);
      if (!layer) return [];
      const newSize = Math.min(layer.fontSize + 8, 200);
      return [{ type: 'setTextStyle', cardId: card.id, layerId: layer.id, style: { fontSize: newSize } }];
    }

    case 'text_size_decrease': {
      const layer = findAnyTextLayer(card.layers);
      if (!layer) return [];
      const newSize = Math.max(layer.fontSize - 8, 8);
      return [{ type: 'setTextStyle', cardId: card.id, layerId: layer.id, style: { fontSize: newSize } }];
    }

    case 'card_duplicate': {
      return [{ type: 'duplicateCard', cardId: card.id }];
    }

    case 'card_delete': {
      // Protect the last remaining card
      if (document.cards.length <= 1) return [];
      return [{ type: 'removeCard', cardId: card.id }];
    }

    case 'card_add': {
      const newCard = {
        id: crypto.randomUUID(),
        index: document.cards.length,
        baseColor: '#1d2a30',
        layers: [defaultTextLayer()],
      };
      return [{ type: 'addCard', card: newCard }];
    }

    case 'card_background_dark': {
      return [{ type: 'setCardBase', cardId: card.id, baseColor: '#1d2a30' }];
    }

    case 'card_background_light': {
      return [{ type: 'setCardBase', cardId: card.id, baseColor: '#dfe8eb' }];
    }

    case 'unsupported_image_edit':
      // Caller handles the unsupported case — return empty to signal no action
      return [];

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Confirmation copy
// ---------------------------------------------------------------------------

/** Human-readable confirmation message for a successfully applied edit. */
export function buildEditConfirmation(intent: EditIntent): string {
  switch (intent.type) {
    case 'text_content':
      return intent.targetRole === 'cta'
        ? 'Done — I updated the CTA text.'
        : 'Done — I updated the title.';
    case 'text_size_increase':
      return 'Done — I made the text larger.';
    case 'text_size_decrease':
      return 'Done — I made the text smaller.';
    case 'card_duplicate':
      return 'Done — I duplicated the card.';
    case 'card_delete':
      return 'Done — I removed the card.';
    case 'card_add':
      return 'Done — I added a new card.';
    case 'card_background_dark':
      return 'Done — I made the background darker.';
    case 'card_background_light':
      return 'Done — I made the background lighter.';
    default:
      return 'Done.';
  }
}
