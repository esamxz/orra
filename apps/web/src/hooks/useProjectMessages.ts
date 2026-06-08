import { useState, useEffect, useCallback, useRef } from 'react';
import { listProjectMessages } from '../api/chat.js';
import { ApiClientError } from '../api/errors.js';
import type { ChatMessageDto } from '../api/types.js';

export type MessagesLoadState = 'idle' | 'loading' | 'error' | 'empty';

export interface UseProjectMessagesResult {
  messages: ChatMessageDto[];
  state: MessagesLoadState;
  error: string | null;
  reload: () => void;
}

/**
 * Fetch chat messages for a project from the API.
 * Returns a calm error state instead of crashing.
 * Does not call the API when projectId is missing (demo/local mode).
 * Guards against stale load results if the projectId changes quickly.
 */
export function useProjectMessages(projectId: string | undefined): UseProjectMessagesResult {
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [state, setState] = useState<MessagesLoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const activeIdRef = useRef<string | undefined>(undefined);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!projectId) {
      setMessages([]);
      setState('idle');
      setError(null);
      activeIdRef.current = undefined;
      return;
    }

    let cancelled = false;
    activeIdRef.current = projectId;

    async function load() {
      setState('loading');
      setError(null);

      try {
        const data = await listProjectMessages(projectId!);
        if (cancelled || activeIdRef.current !== projectId) return;
        setMessages(data);
        setState(data.length === 0 ? 'empty' : 'idle');
      } catch (err) {
        if (cancelled || activeIdRef.current !== projectId) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load messages. Please try again.';
        setError(msg);
        setMessages([]);
        setState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  return { messages, state, error, reload };
}
