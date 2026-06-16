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

interface QueueEntry {
  action: Action;
}

/**
 * Merge consecutive setTextStyle or updateLayerProps actions for the same
 * card+layer into a single entry. Structural actions (addLayer, removeLayer,
 * reorderLayers, setTextContent) are never coalesced.
 */
function coalesceQueue(queue: QueueEntry[]): QueueEntry[] {
  if (queue.length <= 1) return queue;
  const out: QueueEntry[] = [];
  for (const entry of queue) {
    const prev = out[out.length - 1];
    const a = prev?.action as any;
    const b = entry.action as any;
    if (
      a &&
      a.type === 'setTextStyle' &&
      b.type === 'setTextStyle' &&
      a.cardId === b.cardId &&
      a.layerId === b.layerId
    ) {
      out[out.length - 1] = {
        action: { ...a, style: { ...a.style, ...b.style } } as Action,
      };
    } else if (
      a &&
      a.type === 'updateLayerProps' &&
      b.type === 'updateLayerProps' &&
      a.cardId === b.cardId &&
      a.layerId === b.layerId
    ) {
      out[out.length - 1] = {
        action: { ...a, props: { ...a.props, ...b.props } } as Action,
      };
    } else {
      out.push(entry);
    }
  }
  return out;
}

/**
 * Document history hook with kernel-based undo/redo and server persistence.
 *
 * Actions are applied locally first for instant feedback, then serialised
 * through a queue that sends one request at a time using the last confirmed
 * server version as baseVersion. Same-microtask dispatches are coalesced
 * before the first flush so rapid inspector edits produce a single request.
 *
 * An epoch counter invalidates any in-flight response that resolves after a
 * reset or conflict recovery, preventing stale reconciliation.
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

  // Serial queue — holds actions not yet sent to server
  const queueRef = useRef<QueueEntry[]>([]);
  // Last server-confirmed document version; used as baseVersion at flush time
  const serverVersionRef = useRef<number>(initial?.version ?? 0);
  // Whether the serial flush loop is currently running
  const isFlushingRef = useRef(false);
  // Whether a microtask flush is already scheduled (prevents double scheduling)
  const scheduledFlushRef = useRef(false);
  // Monotonic counter incremented on reset/refetch/conflict; guards stale responses
  const queueEpochRef = useRef(0);

  const mountedRef = useRef(true);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    };
  }, []);

  const setSavedThenIdle = useCallback(() => {
    if (!mountedRef.current) return;
    setSaveStatus('saved');
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => {
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

    // Server is ahead or artifact changed — adopt server state and clear stacks.
    setState({ document: serverDoc, past: [], future: [] });
  }, []);

  /**
   * Refetch the artifact from the server and replace local state.
   */
  const refetchAndReset = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const refreshed = await getArtifact(id);
        if (!mountedRef.current) return false;
        serverVersionRef.current = refreshed.document.version;
        setState({ document: refreshed.document, past: [], future: [] });
        setServerMeta({
          currentVersionId: refreshed.currentVersionId,
          artifactVersionNumber: null,
        });
        return true;
      } catch (fetchErr) {
        if (!mountedRef.current) return false;
        const msg =
          fetchErr instanceof ApiClientError
            ? fetchErr.message
            : 'Unable to reload the latest version.';
        setSaveStatus('error');
        setSaveError(msg);
        onError?.(msg);
        return false;
      }
    },
    [onError],
  );

  /**
   * Serial flush loop. Processes one queue entry at a time, using the last
   * confirmed server version as baseVersion. An epoch guard discards responses
   * that arrive after a reset or conflict recovery.
   */
  const flushQueue = useCallback(async () => {
    if (isFlushingRef.current || !artifactId) return;
    isFlushingRef.current = true;
    const epochAtStart = queueEpochRef.current;

    while (queueRef.current.length > 0) {
      if (!mountedRef.current || queueEpochRef.current !== epochAtStart) break;

      // Coalesce pending entries before sending the next one
      queueRef.current = coalesceQueue(queueRef.current);
      const entry = queueRef.current[0];
      if (!entry) break;

      const baseVersion = serverVersionRef.current;
      setSaveStatus('saving');
      setSaveError(null);

      try {
        const result = await applyArtifactAction(artifactId, {
          baseVersion,
          action: entry.action,
        });

        // Epoch check after await — reset or conflict may have occurred while in-flight
        if (!mountedRef.current || queueEpochRef.current !== epochAtStart) break;

        const parsed = ArtifactDocumentSchema.safeParse(result.document);
        if (!parsed.success) {
          throw new ApiClientError(
            'VALIDATION',
            'Server returned an invalid document.',
          );
        }

        serverVersionRef.current = result.version;
        setServerMeta({
          currentVersionId: result.currentVersionId,
          artifactVersionNumber: result.artifactVersionNumber,
        });
        reconcileServerDocument(parsed.data);
        queueRef.current = queueRef.current.slice(1);
        if (queueRef.current.length === 0) setSavedThenIdle();

      } catch (err) {
        if (!mountedRef.current || queueEpochRef.current !== epochAtStart) break;

        queueRef.current = [];

        if (err instanceof ApiClientError && err.code === 'VERSION_CONFLICT') {
          setSaveStatus('conflict');
          onConflict?.('This project changed. Reloaded the latest version.');
          queueEpochRef.current++;
          const ok = await refetchAndReset(artifactId);
          // TODO: after refetch, reapply the latest pending style/geometry edit
          // once against the fresh server version (safe replay for inspector edits).
          if (mountedRef.current && ok) setSaveStatus('idle');
          break;
        }

        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Save failed. Reloading latest version…';
        setSaveStatus('error');
        setSaveError(msg);
        onError?.(msg);
        queueEpochRef.current++;
        await refetchAndReset(artifactId);
        break;
      }
    }

    isFlushingRef.current = false;
  }, [
    artifactId,
    onError,
    onConflict,
    reconcileServerDocument,
    refetchAndReset,
    setSavedThenIdle,
  ]);

  /**
   * Schedule a flush via microtask so multiple same-tick dispatches accumulate
   * in queueRef before the first flush begins, enabling effective coalescing.
   */
  const scheduleFlush = useCallback(() => {
    if (scheduledFlushRef.current) return;
    scheduledFlushRef.current = true;
    queueMicrotask(() => {
      scheduledFlushRef.current = false;
      flushQueue().catch(() => {});
    });
  }, [flushQueue]);

  /**
   * Apply an action locally for instant feedback, then enqueue it for server
   * persistence. The server call is deferred to a microtask so rapid
   * same-tick dispatches coalesce before the first request is sent.
   */
  const dispatch = useCallback(
    (action: Action): boolean => {
      const next = historyApply(stateRef.current, action);
      if ('error' in next) {
        onError?.(next.error);
        return false;
      }

      setState(next);

      if (artifactId) {
        queueRef.current = [...queueRef.current, { action }];
        scheduleFlush();
      }

      return true;
    },
    [artifactId, onError, scheduleFlush],
  );

  /**
   * Undo the most recent action locally, then enqueue the inverse action for
   * server persistence.
   */
  const undo = useCallback(() => {
    if (!stateRef.current.document || stateRef.current.past.length === 0) return;

    const undoAction = stateRef.current.past[stateRef.current.past.length - 1];
    const next = historyUndo(stateRef.current);
    if ('error' in next) return;

    setState(next);

    if (artifactId) {
      queueRef.current = [...queueRef.current, { action: undoAction }];
      scheduleFlush();
    }
  }, [artifactId, scheduleFlush]);

  /**
   * Redo the most recent undone action locally, then enqueue it for server
   * persistence.
   */
  const redo = useCallback(() => {
    if (!stateRef.current.document || stateRef.current.future.length === 0) return;

    const redoAction = stateRef.current.future[stateRef.current.future.length - 1];
    const next = historyRedo(stateRef.current);
    if ('error' in next) return;

    setState(next);

    if (artifactId) {
      queueRef.current = [...queueRef.current, { action: redoAction }];
      scheduleFlush();
    }
  }, [artifactId, scheduleFlush]);

  const reset = useCallback((doc: ArtifactDocument | null) => {
    queueRef.current = [];
    isFlushingRef.current = false;
    scheduledFlushRef.current = false;
    queueEpochRef.current++;
    serverVersionRef.current = doc?.version ?? 0;
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
