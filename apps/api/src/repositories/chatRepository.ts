import type { DbClient } from '../db/client.js';
import type { ChatThreadRow, ChatMessageRow, Json } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// Chat repository
// ---------------------------------------------------------------------------
// Workspace-scoped chat thread and message CRUD.
// Every method scopes by workspace_id so cross-workspace access is impossible.

export interface EnsureThreadInput {
  workspaceId: string;
  projectId: string;
}

export interface FindThreadInput {
  workspaceId: string;
  projectId: string;
}

export interface ListMessagesInput {
  workspaceId: string;
  threadId: string;
  limit: number;
}

export interface AppendMessageInput {
  workspaceId: string;
  threadId: string;
  role: ChatMessageRow['role'];
  kind: ChatMessageRow['kind'];
  content: string;
  metadata?: Json;
  seq?: number;
}

export interface FindMessageInput {
  workspaceId: string;
  projectId: string;
  messageId: string;
}

export interface UpdateMessageMetadataInput {
  workspaceId: string;
  messageId: string;
  metadata: Json;
}

export interface ListRecentMessagesForProjectInput {
  workspaceId: string;
  projectId: string;
  limit: number;
}

export interface RecentMessageRow {
  role: string;
  content: string | null;
  created_at: string;
}

export interface ChatRepository {
  ensureThreadForProject(input: EnsureThreadInput): Promise<ChatThreadRow>;
  findThreadByProjectId(input: FindThreadInput): Promise<ChatThreadRow | null>;
  listMessagesByThread(input: ListMessagesInput): Promise<ChatMessageRow[]>;
  listRecentMessagesForProject(input: ListRecentMessagesForProjectInput): Promise<RecentMessageRow[]>;
  appendMessage(input: AppendMessageInput): Promise<ChatMessageRow>;
  findMessageByIdForProject(input: FindMessageInput): Promise<ChatMessageRow | null>;
  updateMessageMetadata(input: UpdateMessageMetadataInput): Promise<ChatMessageRow>;
}

/**
 * Stub implementation that satisfies the interface but throws
 * "not implemented" for every method. Kept for testability.
 */
export class StubChatRepository implements ChatRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async ensureThreadForProject(_input: EnsureThreadInput): Promise<ChatThreadRow> {
    throw new Error('ChatRepository.ensureThreadForProject is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findThreadByProjectId(_input: FindThreadInput): Promise<ChatThreadRow | null> {
    throw new Error('ChatRepository.findThreadByProjectId is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async listMessagesByThread(_input: ListMessagesInput): Promise<ChatMessageRow[]> {
    throw new Error('ChatRepository.listMessagesByThread is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async listRecentMessagesForProject(_input: ListRecentMessagesForProjectInput): Promise<RecentMessageRow[]> {
    throw new Error('ChatRepository.listRecentMessagesForProject is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async appendMessage(_input: AppendMessageInput): Promise<ChatMessageRow> {
    throw new Error('ChatRepository.appendMessage is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findMessageByIdForProject(_input: FindMessageInput): Promise<ChatMessageRow | null> {
    throw new Error('ChatRepository.findMessageByIdForProject is not implemented yet.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateMessageMetadata(_input: UpdateMessageMetadataInput): Promise<ChatMessageRow> {
    throw new Error('ChatRepository.updateMessageMetadata is not implemented yet.');
  }
}

/**
 * Production implementation backed by Supabase.
 * All queries scope by workspace_id; no method can access another workspace's chats.
 */
export class SupabaseChatRepository implements ChatRepository {
  constructor(private db: DbClient) {}

  async ensureThreadForProject(input: EnsureThreadInput): Promise<ChatThreadRow> {
    const existing = await this.findThreadByProjectId(input);
    if (existing) {
      return existing;
    }

    const { data, error } = await this.db
      .from('chat_threads')
      .insert({
        workspace_id: input.workspaceId,
        project_id: input.projectId,
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as ChatThreadRow;
  }

  async findThreadByProjectId(input: FindThreadInput): Promise<ChatThreadRow | null> {
    const { data, error } = await this.db
      .from('chat_threads')
      .select('*')
      .eq('project_id', input.projectId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data;
  }

  async listMessagesByThread(input: ListMessagesInput): Promise<ChatMessageRow[]> {
    const { data, error } = await this.db
      .from('chat_messages')
      .select('*')
      .eq('thread_id', input.threadId)
      .eq('workspace_id', input.workspaceId)
      .order('created_at', { ascending: true })
      .limit(input.limit);

    if (error) {
      throw mapDbError(error);
    }

    return data ?? [];
  }

  async listRecentMessagesForProject(input: ListRecentMessagesForProjectInput): Promise<RecentMessageRow[]> {
    const thread = await this.findThreadByProjectId({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
    if (!thread) return [];

    const { data, error } = await this.db
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('thread_id', thread.id)
      .eq('workspace_id', input.workspaceId)
      .order('created_at', { ascending: true })
      .limit(input.limit);

    if (error) {
      throw mapDbError(error);
    }

    return (data ?? []) as RecentMessageRow[];
  }

  async appendMessage(input: AppendMessageInput): Promise<ChatMessageRow> {
    const { data, error } = await this.db
      .from('chat_messages')
      .insert({
        workspace_id: input.workspaceId,
        thread_id: input.threadId,
        role: input.role,
        kind: input.kind,
        content: input.content,
        metadata: input.metadata ?? {},
        seq: input.seq ?? null,
      })
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as ChatMessageRow;
  }

  async findMessageByIdForProject(input: FindMessageInput): Promise<ChatMessageRow | null> {
    // Join through chat_threads to ensure the message belongs to the project
    // in the requested workspace.
    const { data, error } = await this.db
      .from('chat_messages')
      .select('*, chat_threads!inner(project_id, workspace_id)')
      .eq('id', input.messageId)
      .eq('chat_threads.project_id', input.projectId)
      .eq('chat_threads.workspace_id', input.workspaceId)
      .maybeSingle();

    if (error) {
      throw mapDbError(error);
    }

    return data as ChatMessageRow | null;
  }

  async updateMessageMetadata(input: UpdateMessageMetadataInput): Promise<ChatMessageRow> {
    const { data, error } = await this.db
      .from('chat_messages')
      .update({ metadata: input.metadata })
      .eq('id', input.messageId)
      .eq('workspace_id', input.workspaceId)
      .select()
      .single();

    if (error) {
      throw mapDbError(error);
    }

    return data as ChatMessageRow;
  }
}
