import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { ChatRepository } from '../repositories/chatRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { ChatMessageRow } from '@orra/db';
import {
  classifyDirectorIntent,
  type DirectorIntentResult,
} from './directorIntentService.js';
import { buildApprovalCard } from './approvalCardBuilder.js';

// ---------------------------------------------------------------------------
// Chat service
// ---------------------------------------------------------------------------
// Business logic for chat thread and message operations.
// All methods enforce workspace scoping and verify project ownership.

export interface MessageResponse {
  id: string;
  projectId: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  kind: 'text' | 'approval_summary' | 'job_ref';
  content: string | null;
  metadata: unknown;
  seq: number | null;
  createdAt: string;
}

export interface AppendUserMessageRequest {
  content: string;
}

export interface AppendUserMessageResult {
  message: MessageResponse;
  intent: DirectorIntentResult;
  approvalMessage?: MessageResponse;
}

export interface AppendAssistantMessageRequest {
  content: string;
  kind?: 'text' | 'approval_summary' | 'job_ref';
  metadata?: import('@orra/db').Json;
}

export interface ListMessagesQuery {
  limit: number;
}

function mapMessageRow(
  row: ChatMessageRow,
  projectId: string
): MessageResponse {
  return {
    id: row.id,
    projectId,
    threadId: row.thread_id,
    role: row.role,
    kind: row.kind,
    content: row.content,
    metadata: row.metadata,
    seq: row.seq,
    createdAt: row.created_at,
  };
}

export class ChatService {
  constructor(
    private chatRepo: ChatRepository,
    private projectRepo: ProjectRepository
  ) {}

  /**
   * List messages for a project thread.
   * Verifies project ownership, ensures the thread exists, and returns messages.
   */
  async listMessages(
    ctx: ServiceContext,
    projectId: string,
    query: ListMessagesQuery
  ): Promise<MessageResponse[]> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the project exists in this workspace.
    const project = await this.projectRepo.findByIdForWorkspace({
      id: projectId,
      workspaceId,
    });

    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    // Ensure the thread exists (lazy creation for v1).
    const thread = await this.chatRepo.ensureThreadForProject({
      workspaceId,
      projectId,
    });

    const rows = await this.chatRepo.listMessagesByThread({
      workspaceId,
      threadId: thread.id,
      limit: query.limit,
    });

    return rows.map((row) => mapMessageRow(row, projectId));
  }

  /**
   * Append a user message to a project thread.
   * Verifies project ownership, ensures the thread exists, inserts the message,
   * and classifies Director intent (deterministic rule-based skeleton).
   * Does NOT trigger generation jobs, approval cards, or AI replies.
   */
  async appendUserMessage(
    ctx: ServiceContext,
    projectId: string,
    input: AppendUserMessageRequest
  ): Promise<AppendUserMessageResult> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the project exists in this workspace.
    const project = await this.projectRepo.findByIdForWorkspace({
      id: projectId,
      workspaceId,
    });

    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    // Ensure the thread exists (lazy creation for v1).
    const thread = await this.chatRepo.ensureThreadForProject({
      workspaceId,
      projectId,
    });

    const row = await this.chatRepo.appendMessage({
      workspaceId,
      threadId: thread.id,
      role: 'user',
      kind: 'text',
      content: input.content,
    });

    const message = mapMessageRow(row, projectId);
    const intent = classifyDirectorIntent(input.content);

    // For generation intent, build and persist a lightweight approval card.
    // No AI calls. No credits move. No generation job starts.
    let approvalMessage: MessageResponse | undefined;
    if (intent.mode === 'generation') {
      const approvalCard = buildApprovalCard({
        content: input.content,
        intent,
        projectType: project.type,
        ratioName: (project.ratio as { name: string }).name ?? '4:5',
        brandSystemId: project.brand_system_id,
        projectName: project.name,
      });

      const approvalRow = await this.chatRepo.appendMessage({
        workspaceId,
        threadId: thread.id,
        role: 'assistant',
        kind: 'approval_summary',
        content: approvalCard.summaryLine,
        metadata: {
          approvalCard,
          sourceUserMessageId: message.id,
          intent,
        } as unknown as import('@orra/db').Json,
      });

      approvalMessage = mapMessageRow(approvalRow, projectId);
    }

    return { message, intent, approvalMessage };
  }

  /**
   * Append an assistant or system message.
   * For future internal use (Director replies, approval cards, job refs).
   * Does NOT trigger generation.
   */
  async appendAssistantMessage(
    ctx: ServiceContext,
    projectId: string,
    input: AppendAssistantMessageRequest
  ): Promise<MessageResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the project exists in this workspace.
    const project = await this.projectRepo.findByIdForWorkspace({
      id: projectId,
      workspaceId,
    });

    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    // Ensure the thread exists.
    const thread = await this.chatRepo.ensureThreadForProject({
      workspaceId,
      projectId,
    });

    const row = await this.chatRepo.appendMessage({
      workspaceId,
      threadId: thread.id,
      role: 'assistant',
      kind: input.kind ?? 'text',
      content: input.content,
      metadata: input.metadata,
    });

    return mapMessageRow(row, projectId);
  }

  /**
   * Ensure a project has a chat thread.
   * Returns the thread row. Creates one if missing.
   */
  async ensureProjectThread(
    ctx: ServiceContext,
    projectId: string
  ): Promise<{ id: string; projectId: string; workspaceId: string; createdAt: string }> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the project exists in this workspace.
    const project = await this.projectRepo.findByIdForWorkspace({
      id: projectId,
      workspaceId,
    });

    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    const thread = await this.chatRepo.ensureThreadForProject({
      workspaceId,
      projectId,
    });

    return {
      id: thread.id,
      projectId,
      workspaceId: thread.workspace_id,
      createdAt: thread.created_at,
    };
  }
}
