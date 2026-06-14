import type { GenerationJobRepository } from '@orra/api/src/repositories/generationJobRepository.js';
import type { ArtifactRepository } from '@orra/api/src/repositories/artifactRepository.js';
import type { CreditRepository } from '@orra/api/src/repositories/creditRepository.js';
import type { ProjectMemoryRepository } from '@orra/api/src/repositories/projectMemoryRepository.js';
import type { ChatRepository } from '@orra/api/src/repositories/chatRepository.js';
import type { ArtifactDocument, ProjectContextMemory } from '@orra/shared';
import { ArtifactDocumentSchema } from '@orra/shared';
import { generateMockArtifactDocument, generateMockSingleCard } from './mockArtifactGenerator.js';
import { createAIProviderRouter, buildArtifactSummary, AIProviderError } from '@orra/ai';
import type { AIProviderRouter, RecentChatMessage, TextPlanResult } from '@orra/ai';

// ---------------------------------------------------------------------------
// Mock generation consumer
// ---------------------------------------------------------------------------
// Phase 10C: processes queue messages, writes a deterministic mock artifact
// version, then captures or refunds credits based on outcome.
//
// Lifecycle:
//   1. Validate message { jobId }
//   2. Fetch job (unscoped, consumer-only)
//   3. Guard: only process if status === queued
//   4. markRunningGuarded(jobId)
//   5. Load project artifact + current version
//   6. Validate current document against shared schema
//   7. Generate mock updated ArtifactDocument
//   8. Commit new artifact version atomically
//   9. Capture reserved credits (if any)
//  10. Mark job succeeded with result_version_id and captured_credits
//
// Failure handling:
//   - Missing artifact / invalid document: refund + markFailedGuarded
//   - Commit conflict: refund + markFailedGuarded
//   - Capture failure: refund + markFailedGuarded
//   - Any unexpected error: refund + markFailedGuarded (safe fallback)
//
// Idempotency rules:
//   - Fetch job by id
//   - Guard transition queued -> running (skip if not queued)
//   - Perform work (load, generate, commit, capture)
//   - Guard transition running -> succeeded with result (skip if not running)
//   - If any guard fails, the message is acked silently (duplicate delivery)
//   - Credit capture/refund are idempotent at the RPC layer:
//     - capture: safe to retry because it keys off reserve ledger entries
//     - refund: safe to retry because it keys off reserve ledger entries
//     - Both throw "No reservation found" if already consumed, which we
//       swallow safely in the failure path.

export interface QueueMessage {
  jobId: string;
}

export class MockGenerationConsumer {
  constructor(
    private jobRepo: GenerationJobRepository,
    private artifactRepo: ArtifactRepository,
    private creditRepo?: CreditRepository,
    private aiRouter: AIProviderRouter = createAIProviderRouter(),
    private projectMemoryRepo?: ProjectMemoryRepository,
    private chatRepo?: ChatRepository
  ) {}

  /**
   * Process a single queue message. Returns true when the message was handled
   * (including skipped duplicates), false only for truly unrecoverable cases.
   */
  async processMessage(message: QueueMessage): Promise<void> {
    // 1. Validate message shape
    if (!message.jobId || typeof message.jobId !== 'string') {
      console.warn('Skipping invalid queue message: missing jobId');
      return;
    }

    // 2. Fetch job row
    const job = await this.jobRepo.findById(message.jobId);
    if (!job) {
      console.warn(`Job not found for id ${message.jobId}; skipping.`);
      return;
    }

    // 3. Guard: only process if status is queued
    if (job.status !== 'queued') {
      console.info(
        `Job ${message.jobId} status is ${job.status}, not queued. Treating as duplicate delivery.`
      );
      return;
    }

    // 4. Transition queued -> running (guarded)
    const running = await this.jobRepo.markRunningGuarded(message.jobId);
    if (!running) {
      console.info(`Job ${message.jobId} already transitioned from queued; skipping.`);
      return;
    }

    try {
      // 5. Load project artifact and current version
      const artifact = await this.artifactRepo.getArtifactByProjectIdForWorkspace({
        projectId: job.project_id,
        workspaceId: job.workspace_id,
      });

      if (!artifact) {
        throw new Error('Artifact not found for project');
      }

      const current = await this.artifactRepo.getCurrentVersion({
        artifactId: artifact.id,
        workspaceId: job.workspace_id,
      });

      if (!current) {
        throw new Error('Current artifact version not found');
      }

      // 6. Validate the persisted document before mutating
      const docValidation = ArtifactDocumentSchema.safeParse(current.version.document);
      if (!docValidation.success) {
        throw new Error('Stored artifact document failed schema validation');
      }
      const currentDocument = docValidation.data;

      // 7. Call AI provider to plan the generation, then generate the document
      const plan = (job.plan ?? {}) as Record<string, unknown>;
      const approvalCard = plan.approvalCard as import('@orra/shared').ApprovalCardDto | undefined;
      const summaryLine = (approvalCard?.summaryLine as string) ?? '';

      // Read brand context from job plan (stored by GenerationService in Phase 11C)
      const brandContext = plan.brandContext as import('@orra/shared').BrandContextDto | undefined ?? null;

      // Load project memory — non-blocking; missing memory is not an error.
      let projectMemory: ProjectContextMemory | null = null;
      if (this.projectMemoryRepo) {
        try {
          const memRow = await this.projectMemoryRepo.getByProjectIdForWorkspace({
            workspaceId: job.workspace_id,
            projectId: job.project_id,
          });
          if (memRow) {
            projectMemory = {
              projectId: memRow.project_id,
              workspaceId: memRow.workspace_id,
              topic: memRow.topic ?? undefined,
              audience: memRow.audience ?? undefined,
              tone: memRow.tone ?? undefined,
              platform: memRow.platform ?? undefined,
              format: memRow.format ?? undefined,
              carouselGoal: memRow.carousel_goal ?? undefined,
              slideCount: memRow.slide_count ?? undefined,
              visualDirection: memRow.visual_direction ?? undefined,
              approvedDirection: memRow.approved_direction ?? undefined,
              rejectedIdeas: Array.isArray(memRow.rejected_ideas) ? (memRow.rejected_ideas as string[]) : [],
              userPreferences: Array.isArray(memRow.user_preferences) ? (memRow.user_preferences as string[]) : [],
              constraints: Array.isArray(memRow.constraints) ? (memRow.constraints as string[]) : [],
              summary: memRow.summary,
              updatedAt: memRow.updated_at,
            };
          }
        } catch (memErr) {
          console.warn(`Job ${message.jobId}: memory load failed, continuing without memory:`, memErr);
        }
      }

      // Phase 13E: Load recent chat messages for planning context — non-blocking.
      let recentChatMessages: RecentChatMessage[] = [];
      if (this.chatRepo) {
        try {
          const rows = await this.chatRepo.listRecentMessagesForProject({
            workspaceId: job.workspace_id,
            projectId: job.project_id,
            limit: 6,
          });
          recentChatMessages = rows
            .filter((r) => r.role === 'user' || r.role === 'assistant')
            .map((r) => ({
              role: r.role as 'user' | 'assistant',
              content: (r.content ?? '').slice(0, 500),
            }));
        } catch (chatErr) {
          console.warn(`Job ${message.jobId}: chat context load failed, continuing:`, chatErr);
        }
      }

      // Phase 13E: Build compact artifact summary — no asset IDs or URLs.
      const currentArtifactSummary = buildArtifactSummary(currentDocument);

      const provider = this.aiRouter.getProvider();
      const t0 = Date.now();
      console.info('[provider_plan]', { jobId: message.jobId, provider: provider.name, status: 'started' });
      let aiPlan: TextPlanResult;
      try {
        aiPlan = await provider.planText({
          projectId: job.project_id,
          prompt: summaryLine,
          projectType: currentDocument.type,
          ratio: currentDocument.ratio,
          brandContext,
          approvalCard,
          projectMemory,
          recentChatMessages,
          currentArtifactSummary,
        });
      } catch (providerErr) {
        const errorCode = providerErr instanceof AIProviderError ? providerErr.code : 'PROVIDER_UNKNOWN';
        console.error('[provider_plan]', {
          jobId: message.jobId,
          provider: provider.name,
          status: 'failed',
          durationMs: Date.now() - t0,
          errorCode,
        });
        throw providerErr;
      }
      console.info('[provider_plan]', {
        jobId: message.jobId,
        provider: provider.name,
        status: 'succeeded',
        durationMs: Date.now() - t0,
        cardCount: aiPlan.cardCount,
      });

      // 8. Generate plan-driven document from AI plan result
      const generationScope = plan.generationScope as string | undefined;
      const targetCardId = plan.targetCardId as string | undefined;
      let mockDocument: ArtifactDocument;

      if (generationScope === 'selected_card' && targetCardId) {
        const targetIdx = currentDocument.cards.findIndex((c) => c.id === targetCardId);
        if (targetIdx === -1) {
          throw new Error(`selected_card generation failed: targetCardId ${targetCardId} not found in current artifact`);
        }
        const updatedCard = generateMockSingleCard({
          cardIndex: targetIdx,
          total: currentDocument.cards.length,
          plan: aiPlan,
          brandContext,
          currentDocument,
        });
        const updatedCards = currentDocument.cards.map((c, i) =>
          i === targetIdx ? { ...updatedCard, id: c.id } : c
        );
        mockDocument = {
          ...currentDocument,
          cards: updatedCards,
          version: currentDocument.version + 1,
        };
      } else {
        mockDocument = generateMockArtifactDocument({
          plan: aiPlan,
          brandContext,
          currentDocument,
        });
      }

      // 8b. Belt-and-suspenders: validate generated document before committing.
      // The generator already self-validates; this guards against future bugs.
      const generatedValidation = ArtifactDocumentSchema.safeParse(mockDocument);
      if (!generatedValidation.success) {
        const issues = generatedValidation.error.issues
          .map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        throw new Error(`Generated artifact document failed schema validation: ${issues}`);
      }

      // 9. Commit new artifact version atomically
      const nextVersionNumber = current.version.version + 1;
      const committedVersion = await this.artifactRepo.commitVersion({
        workspaceId: job.workspace_id,
        artifactId: artifact.id,
        expectedCurrentVersionId: current.version.id,
        version: nextVersionNumber,
        document: mockDocument,
        reason: 'generation',
        createdBy: 'ai',
      });

      if (!committedVersion) {
        throw new Error('Artifact version commit conflict');
      }

      // 10. Capture reserved credits for mock generation.
      // For mock generation, actual cost equals reserved cost.
      const reservedCredits = job.reserved_credits ?? 0;
      let capturedCredits = 0;
      if (reservedCredits > 0 && this.creditRepo) {
        try {
          const result = await this.creditRepo.captureCredits({
            workspaceId: job.workspace_id,
            jobId: job.id,
            actualAmount: reservedCredits,
          });
          capturedCredits = result.captured;
        } catch (captureErr) {
          const captureMsg = captureErr instanceof Error ? captureErr.message : String(captureErr);
          // If the reservation was already consumed (e.g., prior partial delivery),
          // treat it as captured and continue so the job can finish.
          if (captureMsg.includes('No reservation found')) {
            capturedCredits = reservedCredits;
          } else {
            // Genuine capture failure: refund what we can and fail the job.
            try {
              await this.creditRepo.refundCredits({
                workspaceId: job.workspace_id,
                jobId: job.id,
              });
            } catch (refundErr) {
              console.error(`Job ${message.jobId}: refund after capture failure also failed:`, refundErr);
            }
            throw new Error(`Credit capture failed: ${captureMsg}`);
          }
        }
      }

      // 11. Transition running -> succeeded with result_version_id and capturedCredits
      const succeeded = await this.jobRepo.markSucceededWithResultGuarded(
        message.jobId,
        committedVersion.id,
        capturedCredits
      );

      if (!succeeded) {
        console.warn(
          `Job ${message.jobId} could not transition to succeeded after artifact commit; may have been handled concurrently.`
        );
        return;
      }

      console.info(`Job ${message.jobId} completed successfully. Result version ${committedVersion.id}, captured ${capturedCredits} credits.`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error during mock generation';
      console.error(`Job ${message.jobId} failed during processing: ${errMsg}`);

      // Safe fallback: refund reserved credits if the job is still running
      // and has a reservation that has not been captured yet.
      // The refund RPC is safe against duplicate calls (throws "No reservation found"
      // if already captured or refunded), so we attempt it unconditionally and
      // swallow the expected duplicate-case error.
      try {
        const currentJob = await this.jobRepo.findById(message.jobId);
        if (currentJob && this.creditRepo) {
          const reservedCredits = currentJob.reserved_credits ?? 0;
          const alreadyCaptured = (currentJob.captured_credits ?? 0) > 0;
          if (reservedCredits > 0 && !alreadyCaptured) {
            await this.creditRepo.refundCredits({
              workspaceId: currentJob.workspace_id,
              jobId: currentJob.id,
            });
          }
        }
      } catch (refundErr) {
        const refundMsg = refundErr instanceof Error ? refundErr.message : String(refundErr);
        // Swallow "No reservation found" safely; log everything else.
        if (!refundMsg.includes('No reservation found')) {
          console.error(`Job ${message.jobId}: refund attempt failed:`, refundErr);
        }
      }

      // Mark job failed so it does not stay running forever
      await this.jobRepo.markFailedGuarded(message.jobId, {
        code: 'MOCK_GENERATION_FAILED',
        message: errMsg,
      });
    }
  }
}
