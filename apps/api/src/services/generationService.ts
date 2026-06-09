import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { GenerationJobRepository } from '../repositories/generationJobRepository.js';
import type { ChatRepository } from '../repositories/chatRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { CreditService } from './creditService.js';
import type { GenerationJobRow } from '@orra/db';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// Credit estimation policy (Phase 10B)
// ---------------------------------------------------------------------------
// Deterministic stub costs. No model/provider pricing yet.
//   - post: 10 credits
//   - carousel: 10 credits per card, default 30 if card count unknown
//
function estimateCredits(
  projectType: string,
  approvalMetadata: Record<string, unknown>
): number {
  const intent = approvalMetadata.intent as Record<string, unknown> | undefined;
  const hint = intent?.generationHint as Record<string, unknown> | undefined;
  const artifactType = hint?.artifactType as string | undefined;
  const requestedCardCount = hint?.requestedCardCount as number | undefined;

  const isCarousel =
    projectType === 'carousel' || artifactType === 'carousel';

  if (isCarousel) {
    const cards =
      typeof requestedCardCount === 'number' && requestedCardCount > 0
        ? requestedCardCount
        : 3;
    return cards * 10;
  }

  return 10;
}

// ---------------------------------------------------------------------------
// Generation service
// ---------------------------------------------------------------------------
// Business logic for generation job operations.
// All methods enforce workspace scoping and verify project ownership.
// Phase 10B: reserves credits atomically before enqueueing to the queue.
// No AI, no R2, no payments, no consumer capture/refund yet.

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
  reservedCredits: number;
  capturedCredits: number;
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
    reservedCredits: row.reserved_credits ?? 0,
    capturedCredits: row.captured_credits ?? 0,
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
    private creditService: CreditService,
    private env?: Env
  ) {}

  /**
   * Create a stub generation job after an approval card is approved.
   * Validates the project, the approval message, and its state.
   * Estimates credits, creates a queued job row, reserves credits atomically,
   * then enqueues a small message to the generation queue.
   *
   * Failure ordering:
   *   - project invalid: no job, no credits, no queue
   *   - approval invalid: no job, no credits, no queue
   *   - insufficient credits: job created and marked failed, no queue
   *   - queue send failure after reserve: job marked failed, credits refunded
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
    const approvalState = metadata.approvalState as
      | Record<string, unknown>
      | undefined;
    const currentStatus = (approvalState?.status as string) ?? 'pending';
    if (currentStatus !== 'approved') {
      throw new ApiError(
        'CONFLICT',
        `Approval must be approved before creating a generation job. Current status: ${currentStatus}.`
      );
    }

    // 5. Estimate credit cost.
    const approvalCard = metadata.approvalCard as
      | Record<string, unknown>
      | undefined;
    const estimatedCredits = estimateCredits(project.type, metadata);

    // 6. Create the stub job row with reservation metadata.
    const row = await this.jobRepo.createStubJob({
      workspaceId,
      projectId: input.projectId,
      kind: 'full_generate',
      status: 'queued',
      idempotencyKey: input.idempotencyKey ?? null,
      reservedCredits: estimatedCredits,
      capturedCredits: 0,
      plan: {
        approvalMessageId: input.approvalMessageId,
        estimatedCredits,
        summaryLine: approvalCard?.summaryLine ?? null,
      } as unknown as import('@orra/db').Json,
    });

    // 7. Reserve credits atomically for the workspace/job.
    try {
      await this.creditService.reserveCreditsInternal(ctx, {
        amount: estimatedCredits,
        jobId: row.id,
        metadata: { plan: row.plan } as unknown as import('@orra/db').Json,
      });
    } catch (reserveErr) {
      // Mark job failed so it is not a dead queued job.
      await this.jobRepo.markFailedGuarded(row.id, {
        code: 'INSUFFICIENT_CREDITS',
        message:
          reserveErr instanceof ApiError
            ? reserveErr.message
            : 'Not enough credits for this generation.',
      } as unknown as import('@orra/db').Json);

      if (
        reserveErr instanceof ApiError &&
        reserveErr.code === 'INSUFFICIENT_CREDITS'
      ) {
        throw new ApiError(
          'INSUFFICIENT_CREDITS',
          'Not enough credits for this generation.'
        );
      }
      throw reserveErr;
    }

    // 8. Enqueue a small message to the generation queue.
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
        // Refund the reservation before marking failed so credits are not stuck.
        try {
          await this.creditService.refundCreditsInternal(ctx, { jobId: row.id });
        } catch (refundErr) {
          console.error('Failed to refund credits after queue unavailability:', refundErr);
        }
        await this.jobRepo.markFailedGuarded(row.id, {
          code: 'QUEUE_UNAVAILABLE',
          message: 'Generation queue binding is missing. Job cannot be enqueued.',
        } as unknown as import('@orra/db').Json);
        throw new ApiError(
          'PROVIDER_FAILURE',
          'Generation queue is unavailable. The job has been marked failed and credits refunded.'
        );
      }
    } else {
      try {
        await queue.send({ jobId: row.id });
      } catch (enqueueErr) {
        const errMsg =
          enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
        // Refund the reservation immediately so credits are not stuck.
        try {
          await this.creditService.refundCreditsInternal(ctx, { jobId: row.id });
        } catch (refundErr) {
          console.error('Failed to refund credits after queue send failure:', refundErr);
        }
        await this.jobRepo.markFailedGuarded(row.id, {
          code: 'QUEUE_SEND_FAILED',
          message: `Failed to enqueue job: ${errMsg}`,
        } as unknown as import('@orra/db').Json);
        throw new ApiError(
          'PROVIDER_FAILURE',
          'Failed to enqueue generation job. The job has been marked failed and credits refunded.'
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
