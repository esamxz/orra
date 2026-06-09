import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { GenerationJobRepository } from '../repositories/generationJobRepository.js';
import type { ChatRepository } from '../repositories/chatRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { GenerationJobRow } from '@orra/db';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// Generation service
// ---------------------------------------------------------------------------
// Business logic for generation job operations.
// All methods enforce workspace scoping and verify project ownership.
// Phase 9G: enqueue { jobId } to GENERATION_QUEUE after creating the row.
// No AI, no credit reservation, no artifact mutation yet.

export interface CreateStubGenerationJobInput {
  projectId: string;
  approvalMessageId: string;
  idempotencyKey?: string;
}

export interface GenerationJobDto {
  id: string;
  projectId: string;
  status: GenerationJobRow['status'];
  kind: GenerationJobRow['kind'];
  resultVersionId: string | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function mapJobRowToDto(row: GenerationJobRow): GenerationJobDto {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    kind: row.kind,
    resultVersionId: row.result_version_id,
    error: row.error as Record<string, unknown> | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface QueueProducer {
  send(message: { jobId: string }): Promise<void>;
}

export class GenerationService {
  constructor(
    private jobRepo: GenerationJobRepository,
    private chatRepo: ChatRepository,
    private projectRepo: ProjectRepository,
    private env?: Env
  ) {}

  /**
   * Create a stub generation job after an approval card is approved.
   * Validates the project, the approval message, and its state before creating
   * a queued job row. No queue enqueue, no credit reservation, no AI calls.
   */
  async createStubGenerationJob(
    ctx: ServiceContext,
    input: CreateStubGenerationJobInput
  ): Promise<GenerationJobDto> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // 1. Verify the project exists in this workspace.
    const project = await this.projectRepo.findByIdForWorkspace({
      id: input.projectId,
      workspaceId,
    });
    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    // 2. Verify the approval message belongs to this project/workspace.
    const message = await this.chatRepo.findMessageByIdForProject({
      workspaceId,
      projectId: input.projectId,
      messageId: input.approvalMessageId,
    });
    if (!message) {
      throw new ApiError('NOT_FOUND', 'Approval message not found.');
    }

    // 3. Must be an assistant approval_summary message.
    if (message.role !== 'assistant' || message.kind !== 'approval_summary') {
      throw new ApiError('VALIDATION', 'Message is not an approval summary.');
    }

    // 4. Must be approved.
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const approvalState = metadata.approvalState as Record<string, unknown> | undefined;
    const currentStatus = (approvalState?.status as string) ?? 'pending';
    if (currentStatus !== 'approved') {
      throw new ApiError('CONFLICT', `Approval must be approved before creating a generation job. Current status: ${currentStatus}.`);
    }

    // 5. Create the stub job row.
    const approvalCard = metadata.approvalCard as Record<string, unknown> | undefined;
    const row = await this.jobRepo.createStubJob({
      workspaceId,
      projectId: input.projectId,
      kind: 'full_generate',
      status: 'queued',
      idempotencyKey: input.idempotencyKey ?? null,
      reservedCredits: 0,
      capturedCredits: 0,
      plan: {
        approvalMessageId: input.approvalMessageId,
        summaryLine: approvalCard?.summaryLine ?? null,
      } as unknown as import('@orra/db').Json,
    });

    // 6. Enqueue a small message to the generation queue.
    // Production safety: missing queue binding or send failure must not create
    // a dead queued job. In development, an explicit bypass flag allows
    // local testing without a bound queue.
    const queue = this.env?.GENERATION_QUEUE;
    const environment = this.env?.ENVIRONMENT ?? 'development';
    const devBypass = this.env?.DEV_GENERATION_QUEUE_DISABLED === 'true';

    if (!queue) {
      if (environment === 'development' && devBypass) {
        console.warn(
          'GENERATION_QUEUE not bound; DEV_GENERATION_QUEUE_DISABLED=true so continuing without enqueue. ' +
            'Job row remains queued but will not be processed by a consumer.'
        );
      } else {
        await this.jobRepo.markFailedGuarded(row.id, {
          code: 'QUEUE_UNAVAILABLE',
          message: 'Generation queue binding is missing. Job cannot be enqueued.',
        } as unknown as import('@orra/db').Json);
        throw new ApiError(
          'PROVIDER_FAILURE',
          'Generation queue is unavailable. The job has been marked failed.'
        );
      }
    } else {
      try {
        await queue.send({ jobId: row.id });
      } catch (enqueueErr) {
        const errMsg = enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
        await this.jobRepo.markFailedGuarded(row.id, {
          code: 'QUEUE_SEND_FAILED',
          message: `Failed to enqueue job: ${errMsg}`,
        } as unknown as import('@orra/db').Json);
        throw new ApiError(
          'PROVIDER_FAILURE',
          'Failed to enqueue generation job. The job has been marked failed.'
        );
      }
    }

    return mapJobRowToDto(row);
  }

  /**
   * Get a generation job by ID, scoped to the caller's workspace.
   */
  async getJob(ctx: ServiceContext, jobId: string): Promise<GenerationJobDto> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const row = await this.jobRepo.findByIdForWorkspace({
      id: jobId,
      workspaceId,
    });

    if (!row) {
      throw new ApiError('NOT_FOUND', 'Generation job not found.');
    }

    return mapJobRowToDto(row);
  }
}
