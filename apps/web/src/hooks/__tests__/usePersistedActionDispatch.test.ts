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
});
