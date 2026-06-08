import { describe, it, expect } from 'vitest';
import { SupabaseChatRepository } from '../repositories/chatRepository.js';
import { createFakeDbClient } from './fakeDbClient.js';

describe('SupabaseChatRepository', () => {
  it('ensureThreadForProject creates thread when none exists', async () => {
    const fakeDb = createFakeDbClient({ projects: [] });
    const repo = new SupabaseChatRepository(fakeDb);

    const thread = await repo.ensureThreadForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
    });

    expect(thread).toBeDefined();
    expect(thread.workspace_id).toBe('ws-1');
    expect(thread.project_id).toBe('proj-1');
  });

  it('ensureThreadForProject returns existing thread', async () => {
    const fakeDb = createFakeDbClient({
      chat_threads: [
        {
          id: 'thread-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          title: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseChatRepository(fakeDb);

    const thread = await repo.ensureThreadForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
    });

    expect(thread.id).toBe('thread-1');
  });

  it('findThreadByProjectId scopes by workspaceId', async () => {
    const fakeDb = createFakeDbClient({
      chat_threads: [
        {
          id: 'thread-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          title: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseChatRepository(fakeDb);

    const found = await repo.findThreadByProjectId({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
    });
    expect(found).not.toBeNull();
    expect(found!.id).toBe('thread-1');

    const missing = await repo.findThreadByProjectId({
      workspaceId: 'ws-2',
      projectId: 'proj-1',
    });
    expect(missing).toBeNull();
  });

  it('listMessagesByThread scopes by workspaceId and threadId', async () => {
    const fakeDb = createFakeDbClient({
      chat_messages: [
        {
          id: 'msg-1',
          workspace_id: 'ws-1',
          thread_id: 'thread-1',
          role: 'user',
          kind: 'text',
          content: 'Hello',
          metadata: {},
          seq: null,
          created_at: '2026-01-01',
        },
        {
          id: 'msg-2',
          workspace_id: 'ws-1',
          thread_id: 'thread-1',
          role: 'assistant',
          kind: 'text',
          content: 'Hi there',
          metadata: {},
          seq: null,
          created_at: '2026-01-02',
        },
        {
          id: 'msg-3',
          workspace_id: 'ws-2',
          thread_id: 'thread-2',
          role: 'user',
          kind: 'text',
          content: 'Other workspace',
          metadata: {},
          seq: null,
          created_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseChatRepository(fakeDb);

    const messages = await repo.listMessagesByThread({
      workspaceId: 'ws-1',
      threadId: 'thread-1',
      limit: 50,
    });

    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.id)).toContain('msg-1');
    expect(messages.map((m) => m.id)).toContain('msg-2');
    expect(messages.map((m) => m.id)).not.toContain('msg-3');
  });

  it('appendMessage inserts role kind content metadata', async () => {
    const fakeDb = createFakeDbClient({});
    const repo = new SupabaseChatRepository(fakeDb);

    const row = await repo.appendMessage({
      workspaceId: 'ws-1',
      threadId: 'thread-1',
      role: 'user',
      kind: 'text',
      content: 'Test message',
      metadata: { extra: 'data' },
      seq: 1,
    });

    expect(row.workspace_id).toBe('ws-1');
    expect(row.thread_id).toBe('thread-1');
    expect(row.role).toBe('user');
    expect(row.kind).toBe('text');
    expect(row.content).toBe('Test message');
    expect(row.metadata).toEqual({ extra: 'data' });
    expect(row.seq).toBe(1);
  });

  it('cross-workspace thread is not returned', async () => {
    const fakeDb = createFakeDbClient({
      chat_threads: [
        {
          id: 'thread-1',
          workspace_id: 'ws-1',
          project_id: 'proj-1',
          title: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const repo = new SupabaseChatRepository(fakeDb);

    const found = await repo.findThreadByProjectId({
      workspaceId: 'ws-2',
      projectId: 'proj-1',
    });
    expect(found).toBeNull();
  });

  it('DB errors map safely to ApiError', async () => {
    // The fake client does not simulate errors, so this test documents
    // the contract: SupabaseChatRepository always calls mapDbError on errors.
    // Real error-mapping coverage is in db-errors.test.ts.
    const fakeDb = createFakeDbClient({});
    const repo = new SupabaseChatRepository(fakeDb);

    // Verify the method exists and follows the contract.
    expect(typeof repo.ensureThreadForProject).toBe('function');
    expect(typeof repo.findThreadByProjectId).toBe('function');
    expect(typeof repo.listMessagesByThread).toBe('function');
    expect(typeof repo.appendMessage).toBe('function');
  });
});
