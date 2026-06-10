import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { ChatRepository } from '../repositories/chatRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import type { ChatMessageRow } from '@orra/db';
import type { BrandContextDto } from '@orra/shared';
import {
  classifyDirectorIntent,
  type DirectorIntentResult,
} from './directorIntentService.js';
import { buildApprovalCard } from './approvalCardBuilder.js';
import type { ProjectMemoryService } from './projectMemoryService.js';

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
    private projectRepo: ProjectRepository,
    private brandSystemRepo?: BrandSystemRepository,
    private projectMemoryService?: ProjectMemoryService
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

    // Fire-and-forget: update project memory from this message.
    if (this.projectMemoryService) {
      void this.projectMemoryService
        .updateFromUserMessage(ctx, projectId, input.content, intent)
        .catch((err) => console.error('[memory] updateFromUserMessage failed:', err));
    }

    // For generation intent, build and persist a lightweight approval card.
    // No AI calls. No credits move. No generation job starts.
    let approvalMessage: MessageResponse | undefined;
    if (intent.mode === 'generation') {
      // Load brand context if the project has a brand system attached.
      const brandContext = await this.loadBrandContext(workspaceId, project.brand_system_id);

      const approvalCard = buildApprovalCard({
        content: input.content,
        intent,
        projectType: project.type,
        ratioName: (project.ratio as { name: string }).name ?? '4:5',
        brandContext,
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
          approvalState: {
            status: 'pending',
            updatedAt: new Date().toISOString(),
          },
        } as unknown as import('@orra/db').Json,
      });

      approvalMessage = mapMessageRow(approvalRow, projectId);
    }

    return { message, intent, approvalMessage };
  }

  /**
   * Load brand context for the approval card builder.
   * Returns null when no brand is attached or the brand cannot be found.
   * Never blocks no-brand projects.
   */
  private async loadBrandContext(
    workspaceId: string,
    brandSystemId: string | null
  ): Promise<BrandContextDto | null> {
    if (!brandSystemId || !this.brandSystemRepo) {
      return null;
    }

    const brand = await this.brandSystemRepo.findByIdForWorkspace({
      id: brandSystemId,
      workspaceId,
    });

    if (!brand) {
      return null;
    }

    // Map palette array to color roles
    const palette = brand.palette as Array<{ hex: string; role: string }> | undefined;
    const colors: BrandContextDto['colors'] = {};
    if (Array.isArray(palette)) {
      for (const entry of palette) {
        if (entry && typeof entry === 'object' && 'hex' in entry && 'role' in entry) {
          const role = entry.role as string;
          const hex = entry.hex as string;
          if (role && hex && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
            (colors as Record<string, string>)[role] = hex;
          }
        }
      }
    }

    // Extract heading/body fonts from typography object if present
    const typography =
      brand.typography && typeof brand.typography === 'object'
        ? (brand.typography as Record<string, unknown>)
        : {};
    const headingFont =
      typeof typography.titleFont === 'string'
        ? typography.titleFont
        : typeof typography.headingFont === 'string'
          ? typography.headingFont
          : undefined;
    const bodyFont =
      typeof typography.bodyFont === 'string'
        ? typography.bodyFont
        : typeof typography.font === 'string'
          ? typography.font
          : undefined;

    return {
      brandSystemId: brand.id,
      name: brand.name,
      tone: brand.tone_of_voice,
      colors: Object.keys(colors).length > 0 ? colors : undefined,
      typography:
        headingFont || bodyFont
          ? {
              headingFont,
              bodyFont,
              preset: typeof typography.preset === 'string' ? typography.preset : undefined,
            }
          : undefined,
      visualDirection: brand.visual_direction,
      rules: brand.rules,
    };
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

  /**
   * Handle an approval action on an approval_summary message.
   * Validates the message, applies the state transition, updates metadata,
   * and returns the updated message. No generation jobs or credits move.
   */
  async handleApprovalAction(
    ctx: ServiceContext,
    projectId: string,
    messageId: string,
    input: { action: import('@orra/shared').ApprovalAction; value?: string }
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

    // Fetch the message scoped by workspace + project.
    const messageRow = await this.chatRepo.findMessageByIdForProject({
      workspaceId,
      projectId,
      messageId,
    });
    if (!messageRow) {
      throw new ApiError('NOT_FOUND', 'Approval message not found.');
    }

    // Must be an assistant approval_summary message.
    if (messageRow.role !== 'assistant' || messageRow.kind !== 'approval_summary') {
      throw new ApiError('VALIDATION', 'Message is not an approval summary.');
    }

    const metadata = (messageRow.metadata ?? {}) as Record<string, unknown>;
    const approvalCard = metadata.approvalCard as Record<string, unknown> | undefined;
    if (!approvalCard) {
      throw new ApiError('VALIDATION', 'Approval message metadata is malformed.');
    }

    // Determine current state. Back-compat: treat missing approvalState as pending.
    const existingState = metadata.approvalState as Record<string, unknown> | undefined;
    const currentStatus = (existingState?.status as string) ?? 'pending';

    // Terminal states cannot be acted upon again.
    if (currentStatus === 'approved' || currentStatus === 'cancelled') {
      throw new ApiError('CONFLICT', `Approval is already ${currentStatus}.`);
    }

    const now = new Date().toISOString();
    let newStatus: string = currentStatus;
    const newMetadata: Record<string, unknown> = { ...metadata };

    switch (input.action) {
      case 'approve_and_create': {
        newStatus = 'approved';
        newMetadata.note = 'Generation will be wired in a later phase.';
        break;
      }
      case 'cancel': {
        newStatus = 'cancelled';
        break;
      }
      case 'add_cta': {
        newStatus = 'needs_cta';
        if (input.value) {
          const cardCopy = { ...approvalCard };
          cardCopy.cta = input.value;
          newMetadata.approvalCard = cardCopy;
        }
        break;
      }
      case 'edit_direction': {
        newStatus = 'editing_direction';
        if (input.value) {
          newMetadata.editDirection = input.value;
        }
        break;
      }
      default: {
        throw new ApiError('VALIDATION', `Unsupported action: ${input.action}`);
      }
    }

    newMetadata.approvalState = {
      status: newStatus,
      selectedAction: input.action,
      updatedAt: now,
    };

    // Fire-and-forget: update project memory from this approval action.
    if (this.projectMemoryService) {
      void this.projectMemoryService
        .updateFromApprovalAction(
          ctx,
          projectId,
          input.action,
          approvalCard as import('@orra/shared').ApprovalCardDto
        )
        .catch((err) => console.error('[memory] updateFromApprovalAction failed:', err));
    }

    const updatedRow = await this.chatRepo.updateMessageMetadata({
      workspaceId,
      messageId,
      metadata: newMetadata as unknown as import('@orra/db').Json,
    });

    return mapMessageRow(updatedRow, projectId);
  }
}
