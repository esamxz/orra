import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { ChatRepository } from '../repositories/chatRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import type { ArtifactRepository } from '../repositories/artifactRepository.js';
import type { ChatMessageRow } from '@orra/db';
import type { ArtifactDocument, BrandContextDto } from '@orra/shared';
import type { AssetRepository } from '../repositories/assetRepository.js';
import {
  classifyDirectorIntent,
  type DirectorIntentResult,
} from './directorIntentService.js';
import { buildApprovalCard } from './approvalCardBuilder.js';
import type { ProjectMemoryService } from './projectMemoryService.js';
import { ArtifactService } from './artifactService.js';
import { buildEditActions, buildEditConfirmation } from './editActionBuilder.js';
import type { AIProvider, SourceImageInput } from '@orra/ai';
import type { MediaIntent } from '@orra/shared';

const CHAT_UNAVAILABLE_MESSAGE = 'Orra AI is temporarily unavailable. Please try again in a moment.';

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
  /** 0-based index of the currently selected card. Used for card/text edits. */
  selectedCardIndex?: number;
  /** Explicit media intent. When omitted the service falls back to Director classification. */
  intent?: MediaIntent;
  /** Primary uploaded asset to use as the source for an image-to-image edit or analysis. */
  primarySourceAssetId?: string | null;
  /** Additional source assets referenced by the prompt. */
  sourceAssetIds?: string[];
}

export interface EditResult {
  document: ArtifactDocument;
  version: number;
  artifactId: string;
}

export interface AppendUserMessageResult {
  message: MessageResponse;
  intent: DirectorIntentResult;
  approvalMessage?: MessageResponse;
  /** Present only when an edit was successfully applied to the artifact. */
  editResult?: EditResult;
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

async function validateSourceAssetForProject(
  assetRepo: AssetRepository | undefined,
  input: { primarySourceAssetId?: string | null; sourceAssetIds?: string[] },
  projectId: string,
  workspaceId: string
): Promise<{ primarySourceAssetId?: string; sourceAssetIds?: string[] }> {
  if (!input.primarySourceAssetId) return {};
  if (!assetRepo) {
    throw new ApiError('VALIDATION', 'Asset repository not available to validate source asset.');
  }

  const asset = await assetRepo.findProjectAssetForWorkspace({
    id: input.primarySourceAssetId,
    projectId,
    workspaceId,
  });
  if (!asset) {
    throw new ApiError('VALIDATION', 'Selected source asset does not belong to this project.');
  }

  const allSourceIds = input.sourceAssetIds?.length ? input.sourceAssetIds : [input.primarySourceAssetId];
  for (const assetId of allSourceIds) {
    const exists = await assetRepo.findProjectAssetForWorkspace({
      id: assetId,
      projectId,
      workspaceId,
    });
    if (!exists) {
      throw new ApiError('VALIDATION', `Source asset ${assetId} does not belong to this project.`);
    }
  }

  return {
    primarySourceAssetId: input.primarySourceAssetId,
    sourceAssetIds: allSourceIds,
  };
}

function directorIntentToMediaIntent(intent: DirectorIntentResult): MediaIntent {
  if (intent.mode === 'generation') {
    return intent.generationHint?.generationMode === 'edit_uploaded_image'
      ? 'edit_image'
      : 'generate_image';
  }
  return 'chat_text';
}

export class ChatService {
  constructor(
    private chatRepo: ChatRepository,
    private projectRepo: ProjectRepository,
    private brandSystemRepo?: BrandSystemRepository,
    private projectMemoryService?: ProjectMemoryService,
    private artifactRepo?: ArtifactRepository,
    private aiProvider?: AIProvider,
    private assetRepo?: AssetRepository,
    private r2Bucket?: R2Bucket
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

    // Validate any referenced source assets belong to this project/workspace.
    const validatedSourceAssets = await validateSourceAssetForProject(
      this.assetRepo,
      input,
      projectId,
      workspaceId
    );

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
      metadata: {
        ...(validatedSourceAssets.primarySourceAssetId && {
          primarySourceAssetId: validatedSourceAssets.primarySourceAssetId,
          sourceAssetIds: validatedSourceAssets.sourceAssetIds,
        }),
        ...(input.intent !== undefined && { mediaIntent: input.intent }),
      } as unknown as import('@orra/db').Json,
    });

    const message = mapMessageRow(row, projectId);
    const intent = classifyDirectorIntent(input.content, !!validatedSourceAssets.primarySourceAssetId);
    const mediaIntent: MediaIntent = input.intent ?? directorIntentToMediaIntent(intent);

    // Fire-and-forget: update project memory from this message.
    if (this.projectMemoryService) {
      void this.projectMemoryService
        .updateFromUserMessage(ctx, projectId, input.content, intent)
        .catch((err) => console.error('[memory] updateFromUserMessage failed:', err));
    }

    // Keep backward-compatible safe-kernel edits when no explicit intent is provided.
    let approvalMessage: MessageResponse | undefined;
    let editResult: EditResult | undefined;

    if (!input.intent && intent.mode === 'edit' && intent.editHint) {
      const editHint = intent.editHint;

      // Unsupported image edits: reply gracefully without touching artifact.
      if (editHint.type === 'unsupported_image_edit') {
        const replyRow = await this.chatRepo.appendMessage({
          workspaceId,
          threadId: thread.id,
          role: 'assistant',
          kind: 'text',
          content: "That edit needs image editing, which isn't available yet. I can change text, card layout, or background color.",
          metadata: { sourceUserMessageId: message.id, intent } as unknown as import('@orra/db').Json,
        });
        approvalMessage = mapMessageRow(replyRow, projectId);
        return { message, intent, approvalMessage };
      }

      // Require an artifact repo to apply edits.
      if (!this.artifactRepo) {
        const replyRow = await this.chatRepo.appendMessage({
          workspaceId,
          threadId: thread.id,
          role: 'assistant',
          kind: 'text',
          content: "I couldn't apply that edit right now. Please try again.",
          metadata: { sourceUserMessageId: message.id, intent } as unknown as import('@orra/db').Json,
        });
        approvalMessage = mapMessageRow(replyRow, projectId);
        return { message, intent, approvalMessage };
      }

      const artifactSvc = new ArtifactService(this.artifactRepo);

      try {
        // Fetch current committed document (throws NOT_FOUND if no artifact yet).
        const current = await artifactSvc.getProjectArtifact(ctx, projectId);

        // Build kernel action(s) for the edit intent.
        const actions = buildEditActions(editHint, current.document, input.selectedCardIndex ?? 0);

        if (actions.length === 0) {
          // Intent recognised but could not be mapped to a concrete action.
          const replyRow = await this.chatRepo.appendMessage({
            workspaceId,
            threadId: thread.id,
            role: 'assistant',
            kind: 'text',
            content: "I couldn't apply that edit. Try being more specific, or check that the selected card has the layer you're editing.",
            metadata: { sourceUserMessageId: message.id, intent } as unknown as import('@orra/db').Json,
          });
          approvalMessage = mapMessageRow(replyRow, projectId);
          return { message, intent, approvalMessage };
        }

        // Apply actions sequentially (v1 edits produce at most one action).
        let latestDocument = current.document;
        let latestVersion = current.version;
        const artifactId = current.artifactId;
        for (const action of actions) {
          const applied = await artifactSvc.applyAction(ctx, artifactId, {
            baseVersion: latestVersion,
            action,
          });
          latestDocument = applied.document;
          latestVersion = applied.version;
        }

        editResult = { document: latestDocument, version: latestVersion, artifactId };

        // Append assistant confirmation.
        const confirmText = buildEditConfirmation(editHint);
        const confirmRow = await this.chatRepo.appendMessage({
          workspaceId,
          threadId: thread.id,
          role: 'assistant',
          kind: 'text',
          content: confirmText,
          metadata: { sourceUserMessageId: message.id, intent } as unknown as import('@orra/db').Json,
        });
        approvalMessage = mapMessageRow(confirmRow, projectId);
      } catch (err) {
        const isNotFound = err instanceof ApiError && err.code === 'NOT_FOUND';
        const isConflict =
          err instanceof ApiError && (err.code === 'VERSION_CONFLICT' || err.code === 'CONFLICT');
        const content = isNotFound
          ? "There's no design to edit yet — approve a generation first."
          : isConflict
            ? "That edit couldn't be applied — the design was updated recently. Try again."
            : "I couldn't apply that edit right now. Please try again.";
        const replyRow = await this.chatRepo.appendMessage({
          workspaceId,
          threadId: thread.id,
          role: 'assistant',
          kind: 'text',
          content,
          metadata: { sourceUserMessageId: message.id, intent } as unknown as import('@orra/db').Json,
        });
        approvalMessage = mapMessageRow(replyRow, projectId);
      }

      return { message, intent, approvalMessage, editResult };
    }

    // Route by explicit media intent (or backward-compatible Director fallback).
    if (mediaIntent === 'analyze_image') {
      approvalMessage = await this.handleAnalyzeImage(
        workspaceId,
        projectId,
        thread.id,
        message.id,
        input.content,
        validatedSourceAssets,
        intent
      );
      return { message, intent, approvalMessage };
    }

    if (mediaIntent === 'chat_text') {
      // For conversation mode, call the AI provider if available.
      // Real provider: must return AI reply or persist unavailable error.
      // No provider injected: return without assistant message (backward compat for tests).
      if (this.aiProvider) {
        const replyContent = await this.callChatProvider(input.content);
        const replyRow = await this.chatRepo.appendMessage({
          workspaceId,
          threadId: thread.id,
          role: 'assistant',
          kind: 'text',
          content: replyContent,
          metadata: { sourceUserMessageId: message.id, intent, mediaIntent } as unknown as import('@orra/db').Json,
        });
        approvalMessage = mapMessageRow(replyRow, projectId);
      }
      return { message, intent, approvalMessage };
    }

    // Remaining intents are generation approvals: generate_image or edit_image.
    // Load brand context if the project has a brand system attached.
    const brandContext = await this.loadBrandContext(workspaceId, project.brand_system_id);

    // Phase 14D: load a compact memory summary for the approval card.
    // Non-blocking — missing memory never prevents approval card creation.
    let memorySummary: string | null = null;
    if (this.projectMemoryService) {
      try {
        const mem = await this.projectMemoryService.getMemory(ctx, projectId);
        if (mem?.summary) memorySummary = mem.summary.slice(0, 120);
      } catch {
        // intentionally silent
      }
    }

    const approvalCard = buildApprovalCard({
      content: input.content,
      intent,
      projectType: project.type,
      ratioName: (project.ratio as { name: string }).name ?? '4:5',
      brandContext,
      projectName: project.name,
      memorySummary,
      primarySourceAssetId: validatedSourceAssets.primarySourceAssetId,
      sourceAssetIds: validatedSourceAssets.sourceAssetIds,
      mediaIntent,
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
        ...(validatedSourceAssets.primarySourceAssetId && {
          primarySourceAssetId: validatedSourceAssets.primarySourceAssetId,
          sourceAssetIds: validatedSourceAssets.sourceAssetIds,
        }),
        mediaIntent,
      } as unknown as import('@orra/db').Json,
    });

    approvalMessage = mapMessageRow(approvalRow, projectId);
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
      description: brand.description,
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
   * Append a dashboard first prompt as the initial user chat message.
   * Skips intent classification, approval card creation, and memory updates.
   * Used exclusively by the POST /v1/projects/new dashboard start endpoint.
   */
  async appendFirstMessage(
    ctx: ServiceContext,
    projectId: string,
    prompt: string
  ): Promise<MessageResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

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

    const row = await this.chatRepo.appendMessage({
      workspaceId,
      threadId: thread.id,
      role: 'user',
      kind: 'text',
      content: prompt,
    });

    return mapMessageRow(row, projectId);
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
      case 'create_card_by_card': {
        newStatus = 'approved';
        newMetadata.cardByCardMode = true;
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

  /**
   * Process an existing first user message through director/planning logic.
   * Idempotent: if an assistant response already references this messageId,
   * returns it without creating a duplicate.
   * Does NOT create a generation job and does NOT reserve credits.
   */
  async prepareMessage(
    ctx: ServiceContext,
    projectId: string,
    messageId: string
  ): Promise<AppendUserMessageResult> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const project = await this.projectRepo.findByIdForWorkspace({ id: projectId, workspaceId });
    if (!project) throw new ApiError('NOT_FOUND', 'Project not found.');

    const messageRow = await this.chatRepo.findMessageByIdForProject({ workspaceId, projectId, messageId });
    if (!messageRow) throw new ApiError('NOT_FOUND', 'Message not found.');

    if (messageRow.role !== 'user' || messageRow.kind !== 'text') {
      throw new ApiError('VALIDATION', 'Only user text messages can be prepared.');
    }

    const content = messageRow.content ?? '';
    const message = mapMessageRow(messageRow, projectId);

    // Source assets may have been stored on the original user message metadata.
    const userMetadata = (messageRow.metadata ?? {}) as Record<string, unknown>;
    const existingPrimarySourceAssetId = userMetadata.primarySourceAssetId as string | undefined;
    const existingSourceAssetIds = Array.isArray(userMetadata.sourceAssetIds)
      ? (userMetadata.sourceAssetIds as string[])
      : undefined;

    // Validate source assets still belong to this project/workspace.
    const validatedSourceAssets = await validateSourceAssetForProject(
      this.assetRepo,
      {
        primarySourceAssetId: existingPrimarySourceAssetId,
        sourceAssetIds: existingSourceAssetIds,
      },
      projectId,
      workspaceId
    );

    const intent = classifyDirectorIntent(content, !!validatedSourceAssets.primarySourceAssetId);

    const thread = await this.chatRepo.ensureThreadForProject({ workspaceId, projectId });

    // Idempotency: return existing response if one already references this message.
    const existingRows = await this.chatRepo.listMessagesByThread({
      workspaceId,
      threadId: thread.id,
      limit: 100,
    });
    const existingResponse = existingRows.find((r) => {
      const meta = r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : null;
      return meta?.sourceUserMessageId === messageId;
    });
    if (existingResponse) {
      return { message, intent, approvalMessage: mapMessageRow(existingResponse, projectId) };
    }

    let approvalMessage: MessageResponse | undefined;

    if (intent.mode === 'generation') {
      const brandContext = await this.loadBrandContext(workspaceId, project.brand_system_id);

      let memorySummary: string | null = null;
      if (this.projectMemoryService) {
        try {
          const mem = await this.projectMemoryService.getMemory(ctx, projectId);
          if (mem?.summary) memorySummary = mem.summary.slice(0, 120);
        } catch { /* intentionally silent */ }
      }

      const approvalCard = buildApprovalCard({
        content,
        intent,
        projectType: project.type,
        ratioName: (project.ratio as { name: string }).name ?? '4:5',
        brandContext,
        projectName: project.name,
        memorySummary,
        primarySourceAssetId: validatedSourceAssets.primarySourceAssetId,
        sourceAssetIds: validatedSourceAssets.sourceAssetIds,
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
          approvalState: { status: 'pending', updatedAt: new Date().toISOString() },
          ...(validatedSourceAssets.primarySourceAssetId && {
            primarySourceAssetId: validatedSourceAssets.primarySourceAssetId,
            sourceAssetIds: validatedSourceAssets.sourceAssetIds,
          }),
        } as unknown as import('@orra/db').Json,
      });

      approvalMessage = mapMessageRow(approvalRow, projectId);
    } else if (this.aiProvider) {
      const replyContent = await this.callChatProvider(content);
      const clarRow = await this.chatRepo.appendMessage({
        workspaceId,
        threadId: thread.id,
        role: 'assistant',
        kind: 'text',
        content: replyContent,
        metadata: { sourceUserMessageId: message.id, intent } as unknown as import('@orra/db').Json,
      });
      approvalMessage = mapMessageRow(clarRow, projectId);
    }

    return { message, intent, approvalMessage };
  }

  private async loadSourceImageInput(
    assetId: string,
    projectId: string,
    workspaceId: string
  ): Promise<SourceImageInput> {
    if (!this.assetRepo || !this.r2Bucket) {
      throw new ApiError('VALIDATION', 'Asset repository and R2 bucket required to load source image.');
    }
    const asset = await this.assetRepo.findProjectAssetForWorkspace({
      id: assetId,
      projectId,
      workspaceId,
    });
    if (!asset) {
      throw new ApiError('VALIDATION', 'Source asset not found.');
    }
    const r2Object = await this.r2Bucket.get(asset.r2_key);
    if (!r2Object) {
      throw new ApiError('NOT_FOUND', 'Source image bytes not found in storage.');
    }
    const bytes = new Uint8Array(await r2Object.arrayBuffer());
    return {
      bytes,
      contentType: asset.content_type ?? 'image/png',
      assetId,
    };
  }

  private async handleAnalyzeImage(
    workspaceId: string,
    projectId: string,
    threadId: string,
    sourceUserMessageId: string,
    content: string,
    validatedSourceAssets: { primarySourceAssetId?: string; sourceAssetIds?: string[] },
    intent: DirectorIntentResult
  ): Promise<MessageResponse> {
    const primary = validatedSourceAssets.primarySourceAssetId;
    let reply: string;

    if (!primary) {
      reply = 'Image analysis requires a source image.';
    } else if (!this.aiProvider) {
      reply = CHAT_UNAVAILABLE_MESSAGE;
    } else {
      try {
        const sourceInput = await this.loadSourceImageInput(primary, projectId, workspaceId);
        const result = await this.aiProvider.analyzeImage({
          prompt: content || 'Describe this image.',
          sourceImages: [sourceInput],
        });
        reply = result.reply;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[analyze_image] failed:', errMsg);
        reply = CHAT_UNAVAILABLE_MESSAGE;
      }
    }

    const row = await this.chatRepo.appendMessage({
      workspaceId,
      threadId,
      role: 'assistant',
      kind: 'text',
      content: reply,
      metadata: {
        sourceUserMessageId,
        intent,
        mediaIntent: 'analyze_image',
        ...(primary && {
          primarySourceAssetId: primary,
          sourceAssetIds: validatedSourceAssets.sourceAssetIds,
        }),
      } as unknown as import('@orra/db').Json,
    });

    return mapMessageRow(row, projectId);
  }

  private async callChatProvider(userMessage: string): Promise<string> {
    try {
      const result = await this.aiProvider!.chat({ userMessage });
      return result.reply;
    } catch {
      return CHAT_UNAVAILABLE_MESSAGE;
    }
  }
}
