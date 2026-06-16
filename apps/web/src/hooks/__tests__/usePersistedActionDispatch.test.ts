// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePersistedActionDispatch } from '../usePersistedActionDispatch';
import * as artifactsApi from '../../api/artifacts.js';
import { ApiClientError } from '../../api/errors.js';
import {
  buildSetTextContentAction,
  buildSetTextStyleAction,
  buildUpdateLayerPropsAction,
} from '../../components/workspace/inspectorActions';
import { makeArtifactSinglePost } from '../../data/mockArtifacts';

vi.mock('../../api/artifacts.js');

describe('usePersistedActionDispatch', () => {
  beforeEach(() => {
    // resetAllMocks clears both call history AND the once-queue of mock implementations.
    // clearAllMocks only clears call history, which leaks unconsumed mockResolvedValueOnce
    // entries from tests that exit early (e.g. the unmount-during-save-timeout test).
    vi.resetAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const validDoc = makeArtifactSinglePost('@test');

  function serverSuccessResponse(doc: typeof validDoc, version?: number) {
    const v = version ?? doc.version;
    return {
      artifactId: doc.artifactId,
      projectId: 'proj-1',
      currentVersionId: `ver-${v}`,
      version: v,
      document: { ...doc, version: v },
      artifactVersionNumber: v + 1,
    };
  }

  it('initial state has idle save status and no document', () => {
    const { result } = renderHook(() =>
      usePersistedActionDispatch(null, { artifactId: 'art-1' }),
    );
    expect(result.current.artifact).toBeNull();
    expect(result.current.saveStatus).toBe('idle');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('applies action locally immediately', async () => {
    const doc = { ...validDoc, version: 3 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse({ ...doc, version: 4 }, 4),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Hello');

    act(() => {
      result.current.dispatch(action);
    });

    // Local apply is synchronous — version increments immediately
    expect(result.current.artifact?.version).toBeGreaterThan(3);
  });

  it('sends baseVersion from initial document (server version, not local optimistic)', async () => {
    const doc = { ...validDoc, version: 3 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(doc, 4),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Hello');

    act(() => { result.current.dispatch(action); });

    await waitFor(() =>
      expect(artifactsApi.applyArtifactAction).toHaveBeenCalledWith('art-1', {
        baseVersion: 3,
        action,
      }),
    );
  });

  it('success reconciles server document and sets saved status', async () => {
    const doc = { ...validDoc, version: 1 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(doc, 2),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Hello');

    act(() => { result.current.dispatch(action); });

    await waitFor(() => expect(result.current.saveStatus).toBe('saved'));
    expect(result.current.canUndo).toBe(true);
  });

  it('keeps undo stacks when server document matches local', async () => {
    const doc = { ...validDoc, version: 1 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(doc, 2),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Hello');

    act(() => { result.current.dispatch(action); });

    await waitFor(() => expect(result.current.saveStatus).toBe('saved'));
    expect(result.current.canUndo).toBe(true);
  });

  it('VERSION_CONFLICT refetches and hydrates latest document', async () => {
    const doc = { ...validDoc, version: 1 };
    const refreshedDoc = { ...validDoc, version: 5 };
    vi.mocked(artifactsApi.applyArtifactAction).mockRejectedValueOnce(
      new ApiClientError('VERSION_CONFLICT', 'Document was modified elsewhere.'),
    );
    vi.mocked(artifactsApi.getArtifact).mockResolvedValueOnce({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-5',
      version: 5,
      document: refreshedDoc,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const onConflict = vi.fn();
    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, {
        artifactId: 'art-1',
        onConflict,
      }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Hello');

    act(() => { result.current.dispatch(action); });

    await waitFor(() => expect(result.current.artifact?.version).toBe(5));
    expect(onConflict).toHaveBeenCalledWith(
      'This project changed. Reloaded the latest version.',
    );
    expect(result.current.canUndo).toBe(false);
    expect(result.current.saveStatus).toBe('idle');
  });

  it('network error shows error and refetches', async () => {
    const doc = { ...validDoc, version: 1 };
    vi.mocked(artifactsApi.applyArtifactAction).mockRejectedValueOnce(
      new ApiClientError('NETWORK_ERROR', 'Unable to reach the server.'),
    );
    vi.mocked(artifactsApi.getArtifact).mockResolvedValueOnce({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-1',
      version: 1,
      document: doc,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const onError = vi.fn();
    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, {
        artifactId: 'art-1',
        onError,
      }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Hello');

    act(() => { result.current.dispatch(action); });

    await waitFor(() => expect(result.current.saveStatus).toBe('error'));
    expect(onError).toHaveBeenCalled();
  });

  it('invalid returned document triggers error and refetch', async () => {
    const doc = { ...validDoc, version: 1 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValueOnce({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-2',
      version: 2,
      document: { invalid: true },
      artifactVersionNumber: 2,
    } as any);
    vi.mocked(artifactsApi.getArtifact).mockResolvedValueOnce({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-1',
      version: 1,
      document: doc,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const onError = vi.fn();
    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, {
        artifactId: 'art-1',
        onError,
      }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Hello');

    act(() => { result.current.dispatch(action); });

    await waitFor(() => expect(result.current.saveStatus).toBe('error'));
    expect(onError).toHaveBeenCalledWith('Server returned an invalid document.');
  });

  it('does not call API when artifactId is null (local-only mode)', () => {
    const doc = validDoc;
    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: null }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Hello');

    act(() => { result.current.dispatch(action); });

    expect(artifactsApi.applyArtifactAction).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('idle');
  });

  it('undo persists the inverse action with server version from previous response', async () => {
    const doc = { ...validDoc, version: 1 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(doc, 2),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Changed');

    act(() => { result.current.dispatch(action); });
    await waitFor(() => expect(result.current.canUndo).toBe(true));

    act(() => { result.current.undo(); });

    await waitFor(() =>
      expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(2),
    );

    const undoCall = vi.mocked(artifactsApi.applyArtifactAction).mock.calls[1];
    // Second call must use server version (2) returned from first action
    expect((undoCall[1] as { baseVersion: number }).baseVersion).toBe(2);
    expect((undoCall[1] as { action: { type: string } }).action.type).toBe('setTextContent');
  });

  it('redo persists the forward action using latest server version', async () => {
    const doc = { ...validDoc, version: 1 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(doc, 2),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Changed');

    act(() => { result.current.dispatch(action); });
    await waitFor(() => expect(result.current.canUndo).toBe(true));

    act(() => { result.current.undo(); });
    await waitFor(() => expect(result.current.canRedo).toBe(true));

    act(() => { result.current.redo(); });

    await waitFor(() =>
      expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(3),
    );

    const redoCall = vi.mocked(artifactsApi.applyArtifactAction).mock.calls[2];
    expect((redoCall[1] as { baseVersion: number }).baseVersion).toBe(2);
    expect((redoCall[1] as { action: { type: string } }).action.type).toBe('setTextContent');
  });

  it('single dispatch sends one request', async () => {
    const doc = { ...validDoc, version: 2 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValueOnce(
      serverSuccessResponse(doc, 3),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildUpdateLayerPropsAction(cardId, layerId, { x: 150, y: 200 });

    act(() => { result.current.dispatch(action); });

    await waitFor(() =>
      expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(1),
    );
    expect(artifactsApi.applyArtifactAction).toHaveBeenCalledWith('art-1', {
      baseVersion: 2,
      action,
    });
  });

  it('reset clears state and save status', () => {
    const doc = validDoc;
    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    act(() => { result.current.reset(null); });

    expect(result.current.artifact).toBeNull();
    expect(result.current.saveStatus).toBe('idle');
    expect(result.current.canUndo).toBe(false);
  });

  it('serial queue: two dispatches — second uses server version from first response', async () => {
    const doc = { ...validDoc, version: 1 };
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    // First action returns version 5 from the server
    vi.mocked(artifactsApi.applyArtifactAction)
      .mockResolvedValueOnce(serverSuccessResponse(doc, 5))
      .mockResolvedValueOnce(serverSuccessResponse(doc, 6));

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    act(() => {
      result.current.dispatch(buildSetTextContentAction(cardId, layerId, 'First'));
    });

    await waitFor(() => expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.dispatch(buildSetTextContentAction(cardId, layerId, 'Second'));
    });

    await waitFor(() => expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(2));

    const calls = vi.mocked(artifactsApi.applyArtifactAction).mock.calls;
    expect((calls[0][1] as { baseVersion: number }).baseVersion).toBe(1);
    expect((calls[1][1] as { baseVersion: number }).baseVersion).toBe(5);
  });

  it('same-tick setTextStyle dispatches coalesce into one request', async () => {
    const doc = { ...validDoc, version: 1 };
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(doc, 2),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    // Both dispatched in same act() tick — microtask flush deferred, so coalescing runs first
    act(() => {
      result.current.dispatch(buildSetTextStyleAction(cardId, layerId, { fontSize: 10 }));
      result.current.dispatch(buildSetTextStyleAction(cardId, layerId, { color: '#ff0000' }));
    });

    await waitFor(() => expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(1));

    const call = vi.mocked(artifactsApi.applyArtifactAction).mock.calls[0];
    const action = call[1].action as any;
    expect(action.type).toBe('setTextStyle');
    expect(action.style).toMatchObject({ fontSize: 10, color: '#ff0000' });
  });

  it('same-tick updateLayerProps dispatches coalesce into one request', async () => {
    const doc = { ...validDoc, version: 1 };
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(doc, 2),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    act(() => {
      result.current.dispatch(buildUpdateLayerPropsAction(cardId, layerId, { x: 10 }));
      result.current.dispatch(buildUpdateLayerPropsAction(cardId, layerId, { y: 20 }));
    });

    await waitFor(() => expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(1));

    const call = vi.mocked(artifactsApi.applyArtifactAction).mock.calls[0];
    const action = call[1].action as any;
    expect(action.type).toBe('updateLayerProps');
    expect(action.props).toMatchObject({ x: 10, y: 20 });
  });

  it('does not coalesce setTextStyle for different layers', async () => {
    const doc = { ...validDoc, version: 1 };
    const cardId = doc.cards[0].id;
    const layers = doc.cards[0].layers.filter((l) => l.type === 'text');
    if (layers.length < 2) {
      // Skip if document only has one text layer
      return;
    }
    const layerA = layers[0].id;
    const layerB = layers[1].id;

    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(doc, 2),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    act(() => {
      result.current.dispatch(buildSetTextStyleAction(cardId, layerA, { fontSize: 10 }));
      result.current.dispatch(buildSetTextStyleAction(cardId, layerB, { fontSize: 20 }));
    });

    await waitFor(() => expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(2));
  });

  it('409 on first action clears queue and does not send subsequent queued actions', async () => {
    const doc = { ...validDoc, version: 1 };
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    vi.mocked(artifactsApi.applyArtifactAction).mockRejectedValueOnce(
      new ApiClientError('VERSION_CONFLICT', 'Document changed.'),
    );
    vi.mocked(artifactsApi.getArtifact).mockResolvedValueOnce({
      artifactId: 'art-1',
      projectId: 'proj-1',
      currentVersionId: 'ver-5',
      version: 5,
      document: { ...doc, version: 5 },
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const onConflict = vi.fn();
    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1', onConflict }),
    );

    // Second action is queued but should be dropped when 409 occurs
    act(() => {
      result.current.dispatch(buildSetTextStyleAction(cardId, layerId, { fontSize: 10 }));
      result.current.dispatch(buildSetTextStyleAction(cardId, layerId, { fontSize: 20 }));
    });

    await waitFor(() => expect(result.current.artifact?.version).toBe(5));

    // Only one POST was sent (the coalesced action); 409 cleared the remaining queue
    expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(1);
    expect(artifactsApi.getArtifact).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledTimes(1);
  });

  it('epoch guard: stale in-flight response after reset is silently ignored', async () => {
    const doc = { ...validDoc, version: 1 };
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    let resolveRequest: ((v: any) => void) | undefined;
    vi.mocked(artifactsApi.applyArtifactAction).mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    act(() => {
      result.current.dispatch(buildSetTextContentAction(cardId, layerId, 'in-flight'));
    });

    // Flush the microtask scheduled by scheduleFlush so that flushQueue() runs
    // and applyArtifactAction is actually called (setting resolveRequest).
    // Without this await, the microtask queue is still pending and resolveRequest
    // would be undefined when we try to call it below.
    await act(async () => { await Promise.resolve(); });

    expect(resolveRequest).toBeTypeOf('function');

    // Reset before the in-flight request resolves — increments epoch
    const resetDoc = { ...doc, version: 99 };
    act(() => { result.current.reset(resetDoc); });

    // Resolve the stale request — flushQueue resumes, sees epoch mismatch, and breaks
    act(() => {
      resolveRequest!({
        artifactId: 'art-1',
        projectId: 'proj-1',
        currentVersionId: 'ver-stale',
        version: 999,
        document: { ...doc, version: 999 },
        artifactVersionNumber: 1000,
      });
    });

    // Drain any remaining microtasks
    await act(async () => { await Promise.resolve(); });

    // State must reflect the reset, not the stale response
    expect(result.current.artifact?.version).toBe(99);
    expect(result.current.saveStatus).toBe('idle');
  });

  it('reset drains scheduled flush: after reset, queued actions are not sent', async () => {
    const doc = { ...validDoc, version: 1 };
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    // Mock doesn't resolve so we can observe if it was even called
    vi.mocked(artifactsApi.applyArtifactAction).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    // Dispatch and immediately reset in the same tick (before microtask fires)
    act(() => {
      result.current.dispatch(buildSetTextStyleAction(cardId, layerId, { fontSize: 50 }));
      result.current.reset(null);
    });

    // After microtasks/timers: reset cleared the queue, nothing sent
    await act(async () => { await Promise.resolve(); });
    expect(artifactsApi.applyArtifactAction).not.toHaveBeenCalled();
    expect(result.current.artifact).toBeNull();
  });

  it('two sequential edits after server confirmation use incrementing server version', async () => {
    const doc = { ...validDoc, version: 10 };
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    vi.mocked(artifactsApi.applyArtifactAction)
      .mockResolvedValueOnce(serverSuccessResponse(doc, 11))
      .mockResolvedValueOnce(serverSuccessResponse(doc, 12));

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    act(() => { result.current.dispatch(buildSetTextContentAction(cardId, layerId, 'A')); });
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

    act(() => { result.current.dispatch(buildSetTextContentAction(cardId, layerId, 'B')); });
    await waitFor(() => expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(2));

    const calls = vi.mocked(artifactsApi.applyArtifactAction).mock.calls;
    expect((calls[0][1] as { baseVersion: number }).baseVersion).toBe(10);
    expect((calls[1][1] as { baseVersion: number }).baseVersion).toBe(11);
  });

  it('does not throw or leak state updates after unmount during save timeout', async () => {
    const doc = { ...validDoc, version: 1 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValueOnce(
      serverSuccessResponse(doc, 2),
    );

    const { result, unmount } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    act(() => {
      result.current.dispatch(buildSetTextContentAction(cardId, layerId, 'Hello'));
    });

    unmount();

    act(() => { vi.advanceTimersByTime(2000); });

    expect(true).toBe(true); // passes if no throw
  });

  it('leaves error status visible when refetch after VERSION_CONFLICT also fails', async () => {
    const doc = { ...validDoc, version: 1 };
    vi.mocked(artifactsApi.applyArtifactAction).mockRejectedValueOnce(
      new ApiClientError('VERSION_CONFLICT', 'Document was modified elsewhere.'),
    );
    vi.mocked(artifactsApi.getArtifact).mockRejectedValueOnce(
      new ApiClientError('NETWORK_ERROR', 'Unable to reload.'),
    );

    const onConflict = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, {
        artifactId: 'art-1',
        onConflict,
        onError,
      }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    act(() => {
      result.current.dispatch(buildSetTextContentAction(cardId, layerId, 'Hello'));
    });

    await waitFor(() => expect(result.current.saveStatus).toBe('error'));
    expect(result.current.saveError).toBe('Unable to reload.');
    expect(onConflict).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(result.current.saveStatus).not.toBe('idle');
    expect(result.current.saveStatus).not.toBe('conflict');
  });

  it('serializes two rapid sequential dispatches without 409', async () => {
    const doc = { ...validDoc, version: 1 };
    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    vi.mocked(artifactsApi.applyArtifactAction)
      .mockResolvedValueOnce(serverSuccessResponse(doc, 2))
      .mockResolvedValueOnce(serverSuccessResponse(doc, 3));

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    act(() => {
      result.current.dispatch(buildSetTextContentAction(cardId, layerId, 'First'));
    });
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

    act(() => {
      result.current.dispatch(buildSetTextContentAction(cardId, layerId, 'Second'));
    });
    await waitFor(() => expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(2));

    // No 409 — both calls used the correct sequential server versions
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.canUndo).toBe(true);
  });
});
