import { useState, useRef, useCallback, useEffect } from 'react';
import { ArtifactDocumentSchema } from '@orra/shared';
import type { Action, ArtifactDocument } from '@orra/shared';
import { applyArtifactAction, getArtifact } from '../api/artifacts.js';
import { ApiClientError } from '../api/errors.js';
import {
  historyApply,
  historyUndo,
  historyRedo,
  type DocHistoryState,
} from './useDocumentHistory';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

export interface UsePersistedActionDispatchResult {
  artifact: ArtifactDocument | null;
  dispatch: (action: Action) => boolean;
  undo: () => void;
  redo: () => void;
  reset: (doc: ArtifactDocument | null) => void;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  currentVersionId: string | null;
  artifactVersionNumber: number | null;
}

interface UsePersistedActionDispatchOptions {
  artifactId?: string | null;
  onError?: (msg: string) => void;
  onConflict?: (msg: string) => void;
}

/**
 * Document history hook with kernel-based undo/redo and server persistence.
 *
 * Every committed action (dispatch, undo, redo) is applied locally first for
 * instant feedback, then sent to the server with the correct baseVersion.
 *
 * The server is authoritative: on mismatch we adopt the server document.
 */
export function usePersistedActionDispatch(
  initial: ArtifactDocument | null,
  options: UsePersistedActionDispatchOptions = {},
): UsePersistedActionDispatchResult {
  const { artifactId, onError, onConflict } = options;

  const [state, setState] = useState<DocHistoryState>({
    document: initial,
    past: [],
    future: [],
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serverMeta, setServerMeta] = useState<{
    currentVersionId: string | null;
    artifactVersionNumber: number | null;
  }>({ currentVersionId: null, artifactVersionNumber: null });

  const inFlightCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setSavedThenIdle = useCallback(() => {
    if (!mountedRef.current) return;
    setSaveStatus('saved');
    setTimeout(() => {
      if (!mountedRef.current) return;
      setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
    }, 1500);
  }, []);

  /**
   * Compare server document with local optimistic state and decide whether
   * to keep or clear the undo/redo stacks.
   */
  const reconcileServerDocument = useCallback((serverDoc: ArtifactDocument) => {
    const currentDoc = stateRef.current.document;
    if (!currentDoc) {
      setState({ document: serverDoc, past: [], future: [] });
      return;
    }

    // Exact match — keep undo/redo stacks
    if (
      serverDoc.version === currentDoc.version &&
      serverDoc.artifactId === currentDoc.artifactId
    ) {
      return;
    }

    // Server is behind local: another edit was applied while this request
    // was in flight. Keep local state; the later response will true us up.
    if (
      serverDoc.artifactId === currentDoc.artifactId &&
      serverDoc.version < currentDoc.version
    ) {
      return;
    }

    // Server is ahead or artifact changed — adopt server state and clear
    // stacks so stale inverses cannot corrupt the document.
    setState({ document: serverDoc, past: [], future: [] });
  }, []);

  /**
   * Refetch the artifact from the server and replace local state.
   */
  const refetchAndReset = useCallback(
    async (id: string) => {
      try {
        const refreshed = await getArtifact(id);
        if (!mountedRef.current) return;
        setState({ document: refreshed.document, past: [], future: [] });
        setServerMeta({
          currentVersionId: refreshed.currentVersionId,
          artifactVersionNumber: null,
        });
        // Caller decides final saveStatus
      } catch (fetchErr) {
        if (!mountedRef.current) return;
        const msg =
          fetchErr instanceof ApiClientError
            ? fetchErr.message
            : 'Unable to reload the latest version.';
        setSaveStatus('error');
        setSaveError(msg);
        onError?.(msg);
      }
    },
    [onError],
  );

  /**
   * Send a single action to the server and reconcile the response.
   */
  const handlePersist = useCallback(
    async (baseVersion: number, action: Action) => {
      if (!artifactId) return;

      inFlightCountRef.current++;
      if (!mountedRef.current) return;
      setSaveStatus('saving');
      setSaveError(null);

      try {
        const result = await applyArtifactAction(artifactId, {
          baseVersion,
          action,
        });

        const parsed = ArtifactDocumentSchema.safeParse(result.document);
        if (!parsed.success) {
          throw new ApiClientError(
            'VALIDATION',
            'Server returned an invalid document.',
          );
        }

        if (!mountedRef.current) return;
        setServerMeta({
          currentVersionId: result.currentVersionId,
          artifactVersionNumber: result.artifactVersionNumber,
        });

        reconcileServerDocument(parsed.data);

        inFlightCountRef.current--;
        if (inFlightCountRef.current <= 0) {
          inFlightCountRef.current = 0;
          setSavedThenIdle();
        }
      } catch (err) {
        inFlightCountRef.current--;
        if (inFlightCountRef.current < 0) inFlightCountRef.current = 0;
        if (!mountedRef.current) return;

        if (err instanceof ApiClientError && err.code === 'VERSION_CONFLICT') {
          setSaveStatus('conflict');
          onConflict?.('This project changed. Reloaded the latest version.');
          await refetchAndReset(artifactId);
          if (mountedRef.current) setSaveStatus('idle');
          return;
        }

        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Save failed. Reloading latest version…';
        setSaveStatus('error');
        setSaveError(msg);
        onError?.(msg);

        // Refetch to avoid leaving UI out of sync with server
        await refetchAndReset(artifactId);
      }
    },
    [
      artifactId,
      onError,
      onConflict,
      reconcileServerDocument,
      refetchAndReset,
      setSavedThenIdle,
    ],
  );

  /**
   * Apply an action locally, then persist it to the server.
   * Captures baseVersion BEFORE the local apply.
   */
  const dispatch = useCallback(
    (action: Action): boolean => {
      const baseVersion = stateRef.current.document?.version ?? 0;

      const next = historyApply(stateRef.current, action);
      if ('error' in next) {
        onError?.(next.error);
        return false;
      }

      setState(next);

      if (artifactId) {
        handlePersist(baseVersion, action).catch(() => {});
      }

      return true;
    },
    [artifactId, onError, handlePersist],
  );

  /**
   * Undo the most recent action locally, then persist the inverse action.
   */
  const undo = useCallback(() => {
    if (!stateRef.current.document || stateRef.current.past.length === 0) return;

    const undoAction = stateRef.current.past[stateRef.current.past.length - 1];
    const baseVersion = stateRef.current.document.version;

    const next = historyUndo(stateRef.current);
    if ('error' in next) return;

    setState(next);

    if (artifactId) {
      handlePersist(baseVersion, undoAction).catch(() => {});
    }
  }, [artifactId, handlePersist]);

  /**
   * Redo the most recent undone action locally, then persist it.
   */
  const redo = useCallback(() => {
    if (!stateRef.current.document || stateRef.current.future.length === 0) return;

    const redoAction = stateRef.current.future[stateRef.current.future.length - 1];
    const baseVersion = stateRef.current.document.version;

    const next = historyRedo(stateRef.current);
    if ('error' in next) return;

    setState(next);

    if (artifactId) {
      handlePersist(baseVersion, redoAction).catch(() => {});
    }
  }, [artifactId, handlePersist]);

  const reset = useCallback((doc: ArtifactDocument | null) => {
    setState({ document: doc, past: [], future: [] });
    setSaveStatus('idle');
    setSaveError(null);
  }, []);

  return {
    artifact: state.document,
    dispatch,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    saveStatus,
    saveError,
    currentVersionId: serverMeta.currentVersionId,
    artifactVersionNumber: serverMeta.artifactVersionNumber,
  };
}
