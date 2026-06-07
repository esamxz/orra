import { describe, it, expect } from 'vitest';
import {
  historyApply,
  historyUndo,
  historyRedo,
  type DocHistoryState,
} from '../useDocumentHistory';
import {
  buildSetTextContentAction,
  buildSetTextStyleAction,
  buildUpdateLayerPropsAction,
  buildRemoveLayerAction,
  buildAddLayerAction,
} from '../../components/workspace/inspectorActions';
import {
  makeArtifactSinglePost,
  makeArtifactCarousel,
  makeCard,
} from '../../data/mockArtifacts';
import type { Layer } from '@orra/shared';

// ── helpers ─────────────────────────────────────────────────────────────────

function freshState(doc = makeArtifactSinglePost('@test')): DocHistoryState {
  return { document: doc, past: [], future: [] };
}

function textLayer(state: DocHistoryState) {
  const card = state.document!.cards[0];
  const layer = card.layers.find((l) => l.type === 'text');
  if (!layer) throw new Error('no text layer');
  return layer;
}

// ── historyApply ─────────────────────────────────────────────────────────────

describe('historyApply', () => {
  it('applies action and updates document', () => {
    const state = freshState();
    const layer = textLayer(state);
    const card = state.document!.cards[0];
    const action = buildSetTextContentAction(card.id, layer.id, 'Hello');
    const next = historyApply(state, action);
    expect('error' in next).toBe(false);
    const nextState = next as DocHistoryState;
    const updated = nextState.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect((updated as { content: string }).content).toBe('Hello');
  });

  it('increments document version', () => {
    const state = freshState();
    const layer = textLayer(state);
    const card = state.document!.cards[0];
    const action = buildSetTextContentAction(card.id, layer.id, 'Hello');
    const next = historyApply(state, action) as DocHistoryState;
    expect(next.document!.version).toBe(state.document!.version + 1);
  });

  it('pushes inverse action onto past stack', () => {
    const state = freshState();
    const layer = textLayer(state);
    const card = state.document!.cards[0];
    const action = buildSetTextContentAction(card.id, layer.id, 'Hello');
    const next = historyApply(state, action) as DocHistoryState;
    expect(next.past).toHaveLength(1);
  });

  it('clears future (redo) stack on new action', () => {
    const state = freshState();
    const layer = textLayer(state);
    const card = state.document!.cards[0];
    const stateWithFuture: DocHistoryState = {
      ...state,
      future: [buildSetTextContentAction(card.id, layer.id, 'Phantom')],
    };
    const action = buildSetTextContentAction(card.id, layer.id, 'Hello');
    const next = historyApply(stateWithFuture, action) as DocHistoryState;
    expect(next.future).toHaveLength(0);
  });

  it('returns error on rejected kernel action (locked layer)', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    (state.document!.cards[0].layers.find((l) => l.id === layer.id) as unknown as { locked: boolean }).locked = true;
    const action = buildSetTextContentAction(card.id, layer.id, 'Hello');
    const result = historyApply(state, action);
    expect('error' in result).toBe(true);
  });

  it('does not push history on rejected action', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    (state.document!.cards[0].layers.find((l) => l.id === layer.id) as unknown as { locked: boolean }).locked = true;
    const action = buildSetTextContentAction(card.id, layer.id, 'Hello');
    historyApply(state, action);
    expect(state.past).toHaveLength(0);
  });

  it('returns error when document is null', () => {
    const state: DocHistoryState = { document: null, past: [], future: [] };
    const result = historyApply(state, { type: 'setRatio', ratio: { name: '1:1', w: 270, h: 270 } });
    expect('error' in result).toBe(true);
  });
});

// ── historyUndo ──────────────────────────────────────────────────────────────

describe('historyUndo', () => {
  it('returns error when past stack is empty', () => {
    const result = historyUndo(freshState());
    expect('error' in result).toBe(true);
  });

  it('restores document to previous state', () => {
    const state = freshState();
    const originalContent = (textLayer(state) as unknown as { content: string }).content;
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'New text')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const restoredLayer = undone.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect((restoredLayer as unknown as { content: string }).content).toBe(originalContent);
  });

  it('pops the most recent entry from the past stack', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'A')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    expect(undone.past).toHaveLength(0);
  });

  it('pushes a redo action onto the future stack', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'A')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    expect(undone.future).toHaveLength(1);
  });

  it('undo of style edit restores previous font size', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const origSize = (layer as unknown as { fontSize: number }).fontSize;
    const after = historyApply(state, buildSetTextStyleAction(card.id, layer.id, { fontSize: origSize + 10 })) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const restored = undone.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect((restored as unknown as { fontSize: number }).fontSize).toBe(origSize);
  });

  it('undo of drag (updateLayerProps) restores x/y', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const origX = layer.x;
    const origY = layer.y;
    const after = historyApply(state, buildUpdateLayerPropsAction(card.id, layer.id, { x: origX + 50, y: origY + 30 })) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const restored = undone.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect(restored.x).toBe(origX);
    expect(restored.y).toBe(origY);
  });

  it('undo of resize (updateLayerProps) restores w/h', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const origW = layer.w;
    const origH = layer.h;
    const after = historyApply(state, buildUpdateLayerPropsAction(card.id, layer.id, { w: origW + 100, h: origH + 50 })) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const restored = undone.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect(restored.w).toBe(origW);
    expect(restored.h).toBe(origH);
  });

  it('undo of removeLayer restores the layer', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildRemoveLayerAction(card.id, layer.id)) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const restored = undone.document!.cards[0].layers.find((l) => l.id === layer.id);
    expect(restored).toBeDefined();
  });

  it('undo of addCard removes the added card', () => {
    const doc = makeArtifactCarousel('@test');
    const state: DocHistoryState = { document: doc, past: [], future: [] };
    const initialCardCount = doc.cards.length;
    const newCard = makeCard();
    const after = historyApply(state, { type: 'addCard', card: newCard }) as DocHistoryState;
    expect(after.document!.cards).toHaveLength(initialCardCount + 1);
    const undone = historyUndo(after) as DocHistoryState;
    expect(undone.document!.cards).toHaveLength(initialCardCount);
  });

  it('increments document version on undo (kernel applies inverse action)', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'X')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    expect(undone.document!.version).toBe(after.document!.version + 1);
  });
});

// ── historyRedo ──────────────────────────────────────────────────────────────

describe('historyRedo', () => {
  it('returns error when future stack is empty', () => {
    const result = historyRedo(freshState());
    expect('error' in result).toBe(true);
  });

  it('reapplies text content after undo', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'Hello')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const redone = historyRedo(undone) as DocHistoryState;
    const restoredLayer = redone.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect((restoredLayer as unknown as { content: string }).content).toBe('Hello');
  });

  it('redo moves action back from future to past stack', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'Hello')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    expect(undone.future).toHaveLength(1);
    const redone = historyRedo(undone) as DocHistoryState;
    expect(redone.future).toHaveLength(0);
    expect(redone.past).toHaveLength(1);
  });

  it('redo of position change reapplies x', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const origX = layer.x;
    const after = historyApply(state, buildUpdateLayerPropsAction(card.id, layer.id, { x: origX + 50 })) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const redone = historyRedo(undone) as DocHistoryState;
    const redoneLayer = redone.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect(redoneLayer.x).toBe(origX + 50);
  });

  it('increments version on redo', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'X')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const redone = historyRedo(undone) as DocHistoryState;
    expect(redone.document!.version).toBe(undone.document!.version + 1);
  });
});

// ── multi-step sequences ─────────────────────────────────────────────────────

describe('multi-step undo/redo sequences', () => {
  it('new edit after undo clears the redo stack', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const s1 = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'A')) as DocHistoryState;
    const s2 = historyUndo(s1) as DocHistoryState;
    expect(s2.future).toHaveLength(1);
    const s3 = historyApply(s2, buildSetTextContentAction(card.id, layer.id, 'B')) as DocHistoryState;
    expect(s3.future).toHaveLength(0);
  });

  it('multiple undos restore each step in reverse', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const originalContent = (textLayer(state) as unknown as { content: string }).content;
    const s1 = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'A')) as DocHistoryState;
    const s2 = historyApply(s1, buildSetTextContentAction(card.id, layer.id, 'B')) as DocHistoryState;
    const s3 = historyApply(s2, buildSetTextContentAction(card.id, layer.id, 'C')) as DocHistoryState;
    const u1 = historyUndo(s3) as DocHistoryState;
    const u2 = historyUndo(u1) as DocHistoryState;
    const u3 = historyUndo(u2) as DocHistoryState;
    const restored = u3.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect((restored as unknown as { content: string }).content).toBe(originalContent);
    expect(u3.past).toHaveLength(0);
  });

  it('apply → undo → redo returns document to same state', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const applied = historyApply(state, buildUpdateLayerPropsAction(card.id, layer.id, { x: 999, w: 500 })) as DocHistoryState;
    const undone = historyUndo(applied) as DocHistoryState;
    const redone = historyRedo(undone) as DocHistoryState;
    const finalLayer = redone.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect(finalLayer.x).toBe(999);
    expect(finalLayer.w).toBe(500);
  });

  it('drag creates exactly one history entry', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildUpdateLayerPropsAction(card.id, layer.id, { x: 100, y: 200 })) as DocHistoryState;
    expect(after.past).toHaveLength(1);
  });

  it('resize creates exactly one history entry', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildUpdateLayerPropsAction(card.id, layer.id, { w: 700, h: 300 })) as DocHistoryState;
    expect(after.past).toHaveLength(1);
  });

  it('rejected action does not push history entry', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    (state.document!.cards[0].layers.find((l) => l.id === layer.id) as unknown as { locked: boolean }).locked = true;
    const result = historyApply(state, buildUpdateLayerPropsAction(card.id, layer.id, { x: 999 }));
    expect('error' in result).toBe(true);
    expect(state.past).toHaveLength(0);
  });

  it('undo of addLayer: layer no longer exists in document after undo', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const dup = { ...layer, id: '00000000-0000-0000-0000-000000000099', z: layer.z + 1 } as Layer;
    const after = historyApply(state, buildAddLayerAction(card.id, dup)) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const found = undone.document!.cards[0].layers.find((l) => l.id === dup.id);
    expect(found).toBeUndefined();
  });
});

// ── kernel validation in undo/redo ───────────────────────────────────────────

describe('kernel validation respected during undo/redo', () => {
  it('undo respects kernel: version increments on undo', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const versionBefore = state.document!.version;
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'A')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    // Two applyAction calls: dispatch + undo
    expect(undone.document!.version).toBe(versionBefore + 2);
  });

  it('redo respects kernel: version increments on redo', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const versionBefore = state.document!.version;
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'A')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const redone = historyRedo(undone) as DocHistoryState;
    // Three applyAction calls: dispatch, undo, redo
    expect(redone.document!.version).toBe(versionBefore + 3);
  });

  it('undo of text content edit: content is the original content', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const origContent = (layer as unknown as { content: string }).content;
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'Changed')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const restored = undone.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect((restored as unknown as { content: string }).content).toBe(origContent);
  });

  it('redo of text content edit: content returns to edited value', () => {
    const state = freshState();
    const card = state.document!.cards[0];
    const layer = textLayer(state);
    const after = historyApply(state, buildSetTextContentAction(card.id, layer.id, 'Changed')) as DocHistoryState;
    const undone = historyUndo(after) as DocHistoryState;
    const redone = historyRedo(undone) as DocHistoryState;
    const restored = redone.document!.cards[0].layers.find((l) => l.id === layer.id)!;
    expect((restored as unknown as { content: string }).content).toBe('Changed');
  });
});
