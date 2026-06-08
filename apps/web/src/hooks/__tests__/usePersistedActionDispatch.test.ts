// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePersistedActionDispatch } from '../usePersistedActionDispatch';
import * as artifactsApi from '../../api/artifacts.js';
import { ApiClientError } from '../../api/errors.js';
import {
  buildSetTextContentAction,
  buildUpdateLayerPropsAction,
} from '../../components/workspace/inspectorActions';
import { makeArtifactSinglePost } from '../../data/mockArtifacts';

vi.mock('../../api/artifacts.js');

describe('usePersistedActionDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const validDoc = makeArtifactSinglePost('@test');

  function serverSuccessResponse(doc: typeof validDoc) {
    return {
      artifactId: doc.artifactId,
      projectId: 'proj-1',
      currentVersionId: 'ver-2',
      version: doc.version,
      document: doc,
      artifactVersionNumber: 2,
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

  it('sends baseVersion before local apply', async () => {
    const doc = { ...validDoc, version: 3 };
    const nextDoc = { ...validDoc, version: 4 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValueOnce(
      serverSuccessResponse(nextDoc),
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

    expect(artifactsApi.applyArtifactAction).toHaveBeenCalledWith('art-1', {
      baseVersion: 3,
      action,
    });
  });

  it('success replaces local document with server document when versions differ', async () => {
    const doc = { ...validDoc, version: 1 };
    const serverDoc = { ...validDoc, version: 99 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValueOnce(
      serverSuccessResponse(serverDoc),
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

    await waitFor(() => expect(result.current.artifact?.version).toBe(99));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.saveStatus).toBe('saved');
  });

  it('keeps undo stacks when server document matches local', async () => {
    const doc = { ...validDoc, version: 1 };
    const serverDoc = { ...validDoc, version: 2 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValueOnce(
      serverSuccessResponse(serverDoc),
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

    act(() => {
      result.current.dispatch(action);
    });

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

    act(() => {
      result.current.dispatch(action);
    });

    await waitFor(() => expect(result.current.saveStatus).toBe('error'));
    expect(onError).toHaveBeenCalled();
    expect(result.current.artifact?.version).toBe(1);
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

    act(() => {
      result.current.dispatch(action);
    });

    await waitFor(() => expect(result.current.saveStatus).toBe('error'));
    expect(onError).toHaveBeenCalledWith(
      'Server returned an invalid document.',
    );
  });

  it('does not call API when artifactId is null (local-only mode)', () => {
    const doc = validDoc;
    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: null }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Hello');

    act(() => {
      result.current.dispatch(action);
    });

    expect(artifactsApi.applyArtifactAction).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('idle');
  });

  it('undo persists the inverse action', async () => {
    const doc = { ...validDoc, version: 1 };
    const serverDoc = { ...validDoc, version: 2 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(serverDoc),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Changed');

    act(() => {
      result.current.dispatch(action);
    });

    await waitFor(() => expect(result.current.canUndo).toBe(true));

    act(() => {
      result.current.undo();
    });

    await waitFor(() =>
      expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(2),
    );

    const undoCall = vi.mocked(artifactsApi.applyArtifactAction).mock.calls[1];
    expect((undoCall[1] as { baseVersion: number }).baseVersion).toBe(2);
    expect((undoCall[1] as { action: { type: string } }).action.type).toBe('setTextContent');
  });

  it('redo persists the forward action', async () => {
    const doc = { ...validDoc, version: 1 };
    const serverDoc = { ...validDoc, version: 2 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValue(
      serverSuccessResponse(serverDoc),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildSetTextContentAction(cardId, layerId, 'Changed');

    act(() => {
      result.current.dispatch(action);
    });
    await waitFor(() => expect(result.current.canUndo).toBe(true));

    act(() => {
      result.current.undo();
    });
    await waitFor(() => expect(result.current.canRedo).toBe(true));

    act(() => {
      result.current.redo();
    });

    await waitFor(() =>
      expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(3),
    );

    const redoCall = vi.mocked(artifactsApi.applyArtifactAction).mock.calls[2];
    expect((redoCall[1] as { baseVersion: number }).baseVersion).toBe(3);
    expect((redoCall[1] as { action: { type: string } }).action.type).toBe('setTextContent');
  });

  it('drag end sends one action with correct baseVersion', async () => {
    const doc = { ...validDoc, version: 2 };
    const serverDoc = { ...validDoc, version: 3 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValueOnce(
      serverSuccessResponse(serverDoc),
    );

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;
    const action = buildUpdateLayerPropsAction(cardId, layerId, { x: 150, y: 200 });

    act(() => {
      result.current.dispatch(action);
    });

    expect(artifactsApi.applyArtifactAction).toHaveBeenCalledTimes(1);
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

    act(() => {
      result.current.reset(null);
    });

    expect(result.current.artifact).toBeNull();
    expect(result.current.saveStatus).toBe('idle');
    expect(result.current.canUndo).toBe(false);
  });

  it('out-of-order server responses do not overwrite newer local state', async () => {
    const doc = { ...validDoc, version: 1 };
    const serverDocV2 = { ...validDoc, version: 2 };
    const serverDocV3 = { ...validDoc, version: 3 };

    let callCount = 0;
    vi.mocked(artifactsApi.applyArtifactAction).mockImplementation(async (_id, input) => {
      const payload = input as { action: { content?: string } };
      callCount++;
      if (payload.action.content === 'First') {
        // Delay the first response so the second arrives first
        await new Promise((r) => setTimeout(r, 80));
        return serverSuccessResponse(serverDocV2);
      }
      return serverSuccessResponse(serverDocV3);
    });

    const { result } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    act(() => {
      result.current.dispatch(
        buildSetTextContentAction(cardId, layerId, 'First'),
      );
    });

    act(() => {
      result.current.dispatch(
        buildSetTextContentAction(cardId, layerId, 'Second'),
      );
    });

    // Wait for both async responses to finish (saveStatus will leave 'saving')
    await waitFor(() => expect(result.current.saveStatus).not.toBe('saving'));

    // The first (delayed) response should not regress the document to v2
    expect(result.current.artifact?.version).toBe(3);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.saveStatus).toBe('saved');
  });

  it('does not throw or leak state updates after unmount during save timeout', async () => {
    const doc = { ...validDoc, version: 1 };
    const serverDoc = { ...validDoc, version: 2 };
    vi.mocked(artifactsApi.applyArtifactAction).mockResolvedValueOnce(
      serverSuccessResponse(serverDoc),
    );

    const { result, unmount } = renderHook(() =>
      usePersistedActionDispatch(doc, { artifactId: 'art-1' }),
    );

    const cardId = doc.cards[0].id;
    const layerId = doc.cards[0].layers.find((l) => l.type === 'text')!.id;

    act(() => {
      result.current.dispatch(
        buildSetTextContentAction(cardId, layerId, 'Hello'),
      );
    });

    // Unmount before the 1500 ms "saved → idle" timer fires
    unmount();

    // Advance timers past the transition window
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // No assertion on unmounted state — the test passes if it doesn't throw
    expect(true).toBe(true);
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
      result.current.dispatch(
        buildSetTextContentAction(cardId, layerId, 'Hello'),
      );
    });

    await waitFor(() => expect(result.current.saveStatus).toBe('error'));
    expect(result.current.saveError).toBe('Unable to reload.');
    expect(onConflict).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    // Must NOT flip back to idle when refetch fails
    expect(result.current.saveStatus).not.toBe('idle');
    expect(result.current.saveStatus).not.toBe('conflict');
  });
});
