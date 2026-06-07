import { useState, useRef, useCallback } from 'react';
import { applyAction, KernelError } from '@orra/shared';
import type { ArtifactDocument, Action } from '@orra/shared';

export interface DocHistoryState {
  document: ArtifactDocument | null;
  past: Action[];   // inverse actions (structurally Action-compatible InverseActions)
  future: Action[]; // forward actions for redo
}

/**
 * Apply an action through the kernel and record its inverse on the undo stack.
 * Clears the redo stack. Returns an error string on kernel rejection.
 */
export function historyApply(
  state: DocHistoryState,
  action: Action,
): DocHistoryState | { error: string } {
  if (!state.document) return { error: 'No document' };
  try {
    const result = applyAction(state.document, action);
    return {
      document: result.document,
      past: result.inverse ? [...state.past, result.inverse as unknown as Action] : state.past,
      future: [],
    };
  } catch (err) {
    return { error: err instanceof KernelError ? err.message : 'Something went wrong' };
  }
}

/**
 * Apply the most recent inverse action (undo), moving its re-inverse onto the redo stack.
 * Returns an error string when the stack is empty or the kernel rejects.
 */
export function historyUndo(
  state: DocHistoryState,
): DocHistoryState | { error: string } {
  if (!state.document || state.past.length === 0) return { error: 'Nothing to undo' };
  const undoAction = state.past[state.past.length - 1];
  try {
    const result = applyAction(state.document, undoAction);
    return {
      document: result.document,
      past: state.past.slice(0, -1),
      future: result.inverse
        ? [...state.future, result.inverse as unknown as Action]
        : state.future,
    };
  } catch (err) {
    return { error: err instanceof KernelError ? err.message : 'Undo failed' };
  }
}

/**
 * Apply the most recent redo action, moving its inverse back onto the undo stack.
 * Returns an error string when the stack is empty or the kernel rejects.
 */
export function historyRedo(
  state: DocHistoryState,
): DocHistoryState | { error: string } {
  if (!state.document || state.future.length === 0) return { error: 'Nothing to redo' };
  const redoAction = state.future[state.future.length - 1];
  try {
    const result = applyAction(state.document, redoAction);
    return {
      document: result.document,
      past: result.inverse
        ? [...state.past, result.inverse as unknown as Action]
        : state.past,
      future: state.future.slice(0, -1),
    };
  } catch (err) {
    return { error: err instanceof KernelError ? err.message : 'Redo failed' };
  }
}

/**
 * React hook for document history with kernel-based undo/redo.
 *
 * @param initial   Starting document (null until an artifact is generated).
 * @param onError   Called with a human-readable message when an action or undo/redo is rejected.
 */
export function useDocumentHistory(
  initial: ArtifactDocument | null,
  onError: (msg: string) => void,
) {
  const [state, setState] = useState<DocHistoryState>({
    document: initial,
    past: [],
    future: [],
  });

  // Always-current ref so dispatch/undo/redo callbacks never see stale state
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback(
    (action: Action): boolean => {
      const next = historyApply(stateRef.current, action);
      if ('error' in next) {
        onError(next.error);
        return false;
      }
      setState(next);
      return true;
    },
    [onError],
  );

  const undo = useCallback(() => {
    const next = historyUndo(stateRef.current);
    if ('error' in next) return; // nothing to undo — silent
    setState(next);
  }, []);

  const redo = useCallback(() => {
    const next = historyRedo(stateRef.current);
    if ('error' in next) return; // nothing to redo — silent
    setState(next);
  }, []);

  const reset = useCallback((doc: ArtifactDocument | null) => {
    setState({ document: doc, past: [], future: [] });
  }, []);

  return {
    artifact: state.document,
    dispatch,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
