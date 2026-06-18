import type { GenerationJobRepository } from '@orra/api/src/repositories/generationJobRepository.js';
import type { ArtifactRepository } from '@orra/api/src/repositories/artifactRepository.js';
import type { CreditRepository } from '@orra/api/src/repositories/creditRepository.js';
import type { ProjectMemoryRepository } from '@orra/api/src/repositories/projectMemoryRepository.js';
import type { ChatRepository } from '@orra/api/src/repositories/chatRepository.js';
import type { AssetRepository } from '@orra/api/src/repositories/assetRepository.js';
import type { ArtifactDocument, BackgroundLayer, ImageLayer, BrandContextDto, ProjectContextMemory, Ratio } from '@orra/shared';
import type { GenerationJobRow } from '@orra/db';
import { ArtifactDocumentSchema } from '@orra/shared';
import { generateArtifactDocument, generateSingleCard } from './artifactDocumentBuilder.js';
import { storeGeneratedImage, storeEditedImage } from './generatedImageStorage.js';
import { createAIProviderRouter, buildArtifactSummary, AIProviderError } from '@orra/ai';
import type { AIProviderRouter, ImageProviderRouter, RecentChatMessage, TextPlanResult } from '@orra/ai';

// ---------------------------------------------------------------------------
// Generation consumer
// ---------------------------------------------------------------------------
// Processes queue messages, writes a plan-driven artifact version, then
// captures or refunds credits based on outcome.
//
// Lifecycle:
//   1. Validate message { jobId }
//   2. Fetch job (unscoped, consumer-only)
//   3. Guard: only process if status === queued
//   4. markRunningGuarded(jobId)
//   5. Load project artifact + current version
//   6. Validate current document against shared schema
//   7. Call AI provider to plan generation, build artifact document
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

export class GenerationConsumerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = 'GenerationConsumerError';
  }
}

export class GenerationConsumer {
  constructor(
    private jobRepo: GenerationJobRepository,
    private artifactRepo: ArtifactRepository,
    private creditRepo?: CreditRepository,
    private aiRouter: AIProviderRouter = createAIProviderRouter(),
    private projectMemoryRepo?: ProjectMemoryRepository,
    private chatRepo?: ChatRepository,
    private imageRouter?: ImageProviderRouter,
    private assetRepo?: AssetRepository,
    private r2Bucket?: R2Bucket
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

    // stepCode tracks which phase failed so the job error is actionable.
    // Updated immediately before each major step; used in the catch block.
    let stepCode: string = 'GENERATION_FAILED';

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

      // 7. Load generation plan metadata and branch by mode.
      const plan = (job.plan ?? {}) as Record<string, unknown>;
      const generationMode = plan.generationMode as string | undefined;
      let artifactDocument: ArtifactDocument;
      let imageAttached = false;

      if (generationMode === 'edit_uploaded_image') {
        // Edit an uploaded project asset and attach the result as an editable
        // image layer. This branch skips text planning and background
        // generation because the user's instruction drives the image edit.
        stepCode = 'GENERATION_FAILED';
        artifactDocument = await this.processEditUploadedImage(message.jobId, job, currentDocument, plan);

        // Validate the edited artifact before committing.
        const editedValidation = ArtifactDocumentSchema.safeParse(artifactDocument);
        if (!editedValidation.success) {
          const issues = editedValidation.error.issues
            .map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ');
          throw new Error(`Edited artifact document failed schema validation: ${issues}`);
        }
        artifactDocument = editedValidation.data;
        imageAttached = true;
      } else {
        // Standard generation: plan text, build document, optionally generate
        // a background image for each target card.
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
        stepCode = 'PROVIDER_TEXT_FAILED';
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
        stepCode = 'GENERATION_FAILED';
        const generationScope = plan.generationScope as string | undefined;
        const targetCardId = plan.targetCardId as string | undefined;

        if (generationScope === 'selected_card' && targetCardId) {
          const targetIdx = currentDocument.cards.findIndex((c) => c.id === targetCardId);
          if (targetIdx === -1) {
            throw new Error(`selected_card generation failed: targetCardId ${targetCardId} not found in current artifact`);
          }
          const updatedCard = generateSingleCard({
            cardIndex: targetIdx,
            total: currentDocument.cards.length,
            plan: aiPlan,
            brandContext,
            currentDocument,
          });
          const updatedCards = currentDocument.cards.map((c, i) =>
            i === targetIdx ? { ...updatedCard, id: c.id } : c
          );
          artifactDocument = {
            ...currentDocument,
            cards: updatedCards,
            version: currentDocument.version + 1,
          };
        } else {
          artifactDocument = generateArtifactDocument({
            plan: aiPlan,
            brandContext,
            currentDocument,
          });
        }

        // 8b. Belt-and-suspenders: validate generated document before committing.
        // The generator already self-validates; this guards against future bugs.
        const generatedValidation = ArtifactDocumentSchema.safeParse(artifactDocument);
        if (!generatedValidation.success) {
          const issues = generatedValidation.error.issues
            .map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ');
          throw new Error(`Generated artifact document failed schema validation: ${issues}`);
        }
        artifactDocument = generatedValidation.data;

        // 8c. Image generation — required when IMAGE_PROVIDER is a real provider.
        // Failure throws and propagates to the outer catch → job fails + credits refunded.
        // When IMAGE_PROVIDER=fake or imageRouter is absent: skip, text-only artifact is valid.
        const imageProvider = this.imageRouter?.getProvider();
        const isRealImageProvider = imageProvider && imageProvider.id !== 'fake';

        if (isRealImageProvider && this.assetRepo && this.r2Bucket) {
          const imagePrompt = buildImagePrompt(aiPlan, brandContext);
          const t0img = Date.now();
          console.info('[provider_image]', { jobId: message.jobId, provider: imageProvider.id, status: 'started' });

          stepCode = 'PROVIDER_IMAGE_FAILED';
          const imageResult = await imageProvider.generateFromText({
            prompt: imagePrompt,
            width: currentDocument.ratio.w,
            height: currentDocument.ratio.h,
            kind: 'background',
            format: 'png',
          });

          console.info('[provider_image]', {
            jobId: message.jobId,
            provider: imageProvider.id,
            status: 'succeeded',
            durationMs: Date.now() - t0img,
            mimeType: imageResult.mimeType,
          });

          // Determine target card indices based on generation scope
          const targetCardIndices =
            generationScope === 'selected_card' && targetCardId
              ? [artifactDocument.cards.findIndex((c) => c.id === targetCardId)]
              : artifactDocument.cards.map((_, i) => i);

          // Store image (one shared image for all target cards)
          stepCode = 'STORAGE_FAILED';
          const primaryCardIndex = targetCardIndices[0] ?? 0;
          const assetId = await storeGeneratedImage({
            workspaceId: job.workspace_id,
            projectId: job.project_id,
            imageBytes: imageResult.data,
            mimeType: imageResult.mimeType,
            cardIndex: primaryCardIndex,
            r2Bucket: this.r2Bucket,
            assetRepo: this.assetRepo,
            sourcePrompt: imagePrompt,
          });

          // Attach background layer to each target card
          artifactDocument = attachBackgroundLayer(
            artifactDocument,
            targetCardIndices,
            assetId,
            imagePrompt,
            currentDocument.ratio,
          );

          // Re-validate with background layer attached
          stepCode = 'GENERATION_FAILED';
          const reValidation = ArtifactDocumentSchema.safeParse(artifactDocument);
          if (!reValidation.success) {
            const issues = reValidation.error.issues
              .map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ');
            throw new Error(`Artifact with background layer failed schema validation: ${issues}`);
          }
          artifactDocument = reValidation.data;
          imageAttached = true;
        }
      }

      // 9. Commit new artifact version atomically
      stepCode = 'ARTIFACT_COMMIT_FAILED';
      const nextVersionNumber = current.version.version + 1;
      const committedVersion = await this.artifactRepo.commitVersion({
        workspaceId: job.workspace_id,
        artifactId: artifact.id,
        expectedCurrentVersionId: current.version.id,
        version: nextVersionNumber,
        document: artifactDocument,
        reason: 'generation',
        createdBy: 'ai',
      });

      if (!committedVersion) {
        throw new Error('Artifact version commit conflict');
      }

      // 10. Capture reserved credits.
      // NOTE(B0): if captureCredits fails after a successful commitVersion, the
      // artifact version exists in DB but the job is marked failed. The frontend
      // must not render artifacts from failed jobs. No rollback mechanism in B0.
      stepCode = 'CREDIT_CAPTURE_FAILED';
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

      console.info(`Job ${message.jobId} completed successfully. Result version ${committedVersion.id}, captured ${capturedCredits} credits. imageAttached=${imageAttached}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error during generation';
      if (err instanceof GenerationConsumerError) {
        stepCode = err.code;
      }
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
        code: stepCode,
        message: errMsg,
      });
    }
  }

  /**
   * Edit an uploaded project asset using the configured image provider and
   * return an artifact document with the edited result attached as an editable
   * image layer. The original uploaded asset is never modified; a new
   * `generated_edit` project asset is created for the output.
   */
  private async processEditUploadedImage(
    jobId: string,
    job: GenerationJobRow,
    currentDocument: ArtifactDocument,
    plan: Record<string, unknown>
  ): Promise<ArtifactDocument> {
    const primarySourceAssetId = plan.primarySourceAssetId as string | undefined;
    if (!primarySourceAssetId) {
      throw new Error('edit_uploaded_image mode missing primarySourceAssetId in job plan');
    }
    if (!this.assetRepo || !this.r2Bucket) {
      throw new Error('Asset repository and R2 bucket required for image edits');
    }

    const imageProvider = this.imageRouter?.getProvider();
    if (!imageProvider) {
      throw new Error('Image provider required for edit_uploaded_image jobs');
    }

    // Load the source asset and verify it still belongs to this project.
    const sourceAsset = await this.assetRepo.findProjectAssetForWorkspace({
      id: primarySourceAssetId,
      projectId: job.project_id,
      workspaceId: job.workspace_id,
    });
    if (!sourceAsset) {
      throw new GenerationConsumerError(
        `Source asset ${primarySourceAssetId} not found for project`,
        'SOURCE_ASSET_NOT_FOUND',
        false,
      );
    }

    // Load original image bytes from R2.
    const r2Object = await this.r2Bucket.get(sourceAsset.r2_key);
    if (!r2Object) {
      throw new GenerationConsumerError(
        `Source image bytes missing from R2 for asset ${primarySourceAssetId}`,
        'SOURCE_OBJECT_NOT_FOUND',
        false,
      );
    }
    const sourceBytes = new Uint8Array(await r2Object.arrayBuffer());

    // Resolve the edit prompt from the original user message. The approval card
    // summary line is a fallback; the raw user instruction is the strongest
    // signal for an image-to-image edit.
    const userInstruction = await this.resolveEditPrompt(job, plan);
    const editPrompt = buildImageEditPrompt(userInstruction);

    const t0img = Date.now();
    console.info('[provider_image_edit]', { jobId, provider: imageProvider.id, status: 'started' });

    let imageResult;
    try {
      imageResult = await imageProvider.editImage({
        prompt: editPrompt,
        sourceImages: [{
          bytes: sourceBytes,
          contentType: sourceAsset.content_type ?? 'image/png',
          assetId: sourceAsset.id,
        }],
        width: currentDocument.ratio.w,
        height: currentDocument.ratio.h,
        format: 'png',
      });
    } catch (err) {
      if (err instanceof AIProviderError && err.code === 'PROVIDER_EDIT_UNSUPPORTED') {
        throw new GenerationConsumerError(
          'The configured image provider does not support image-to-image edits',
          'PROVIDER_EDIT_UNSUPPORTED',
          false,
        );
      }
      throw err;
    }

    if (!imageResult.data || imageResult.data.length === 0) {
      throw new GenerationConsumerError(
        'Image provider returned no image data for the edit request',
        'PROVIDER_RETURNED_TEXT_INSTEAD_OF_IMAGE',
        false,
      );
    }

    console.info('[provider_image_edit]', {
      jobId,
      provider: imageProvider.id,
      status: 'succeeded',
      durationMs: Date.now() - t0img,
      mimeType: imageResult.mimeType,
    });

    // Determine target card (selected card or first card).
    const generationScope = plan.generationScope as string | undefined;
    const targetCardId = plan.targetCardId as string | undefined;
    const targetCardIndex =
      generationScope === 'selected_card' && targetCardId
        ? currentDocument.cards.findIndex((c) => c.id === targetCardId)
        : 0;
    if (targetCardIndex < 0) {
      throw new Error(`edit_uploaded_image target card ${targetCardId} not found`);
    }

    // Store edited output as a new project asset and attach it as an image layer.
    let assetId: string;
    try {
      assetId = await storeEditedImage({
        workspaceId: job.workspace_id,
        projectId: job.project_id,
        imageBytes: imageResult.data,
        mimeType: imageResult.mimeType,
        cardIndex: targetCardIndex,
        r2Bucket: this.r2Bucket,
        assetRepo: this.assetRepo,
        sourceAssetId: primarySourceAssetId,
        sourcePrompt: editPrompt,
      });
    } catch (storageErr) {
      throw new GenerationConsumerError(
        `Failed to upload edited image result: ${storageErr instanceof Error ? storageErr.message : String(storageErr)}`,
        'RESULT_UPLOAD_FAILED',
        false,
      );
    }

    return attachImageLayer(currentDocument, targetCardIndex, assetId, editPrompt, currentDocument.ratio);
  }

  /**
   * Resolve the raw user instruction that triggered an image edit. Walks from
   * the approval message back to the source user message when the chat repo
   * is available, falling back to the plan summary line.
   */
  private async resolveEditPrompt(
    job: GenerationJobRow,
    plan: Record<string, unknown>
  ): Promise<string> {
    const fallback = (plan.summaryLine as string) ?? '';
    const approvalMessageId = plan.approvalMessageId as string | undefined;
    if (!approvalMessageId || !this.chatRepo) {
      return fallback;
    }
    try {
      const approvalRow = await this.chatRepo.findMessageByIdForProject({
        workspaceId: job.workspace_id,
        projectId: job.project_id,
        messageId: approvalMessageId,
      });
      if (!approvalRow) {
        return fallback;
      }
      const metadata = approvalRow.metadata as Record<string, unknown> | undefined;
      const sourceUserMessageId = metadata?.sourceUserMessageId as string | undefined;
      if (!sourceUserMessageId) {
        return fallback;
      }
      const userRow = await this.chatRepo.findMessageByIdForProject({
        workspaceId: job.workspace_id,
        projectId: job.project_id,
        messageId: sourceUserMessageId,
      });
      return userRow?.content ?? fallback;
    } catch {
      return fallback;
    }
  }
}

// ---------------------------------------------------------------------------
// Image generation helpers
// ---------------------------------------------------------------------------

// Phase 11B TODO: logo assets must eventually become pinned project_assets
// and LogoLayer references. BrandSystemRow has no logo_asset_id column yet.
function buildImagePrompt(plan: TextPlanResult, brandContext?: BrandContextDto | null): string {
  const parts: string[] = [];
  if (plan.title) parts.push(plan.title);
  if (plan.visualDirection) parts.push(`Visual style: ${plan.visualDirection}`);
  // Brand visual direction always anchors even when AI plan has its own direction.
  if (brandContext?.visualDirection) parts.push(`Brand visual direction: ${brandContext.visualDirection}`);
  if (plan.styleNotes.length > 0) parts.push(plan.styleNotes.slice(0, 3).join(', '));
  if (brandContext?.colors) {
    const colorRoles = ['primary', 'secondary', 'accent', 'background', 'text'] as const;
    const palette = colorRoles
      .filter((r) => brandContext.colors![r])
      .map((r) => `${r} ${brandContext.colors![r]}`)
      .join(', ');
    if (palette) parts.push(`Brand palette: ${palette}`);
  }
  parts.push('No text, logos, watermarks, or written words in the image. Leave clean negative space for app-rendered editable text.');
  return parts.join('. ');
}

function attachBackgroundLayer(
  doc: ArtifactDocument,
  cardIndices: number[],
  assetId: string,
  sourcePrompt: string,
  ratio: Ratio,
): ArtifactDocument {
  const updatedCards = doc.cards.map((card, idx) => {
    if (!cardIndices.includes(idx)) return card;

    const bgLayer: BackgroundLayer = {
      id: crypto.randomUUID(),
      type: 'background',
      z: -1,
      x: 0,
      y: 0,
      w: ratio.w,
      h: ratio.h,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      assetId,
      fit: 'cover',
      sourcePrompt,
    };

    // Shift existing layers up by 1 so background sits at z=-1
    const shiftedLayers = card.layers.map((l) => ({ ...l, z: l.z + 1 }));

    return { ...card, layers: [bgLayer, ...shiftedLayers] };
  });

  return { ...doc, cards: updatedCards };
}

function attachImageLayer(
  doc: ArtifactDocument,
  cardIndex: number,
  assetId: string,
  sourcePrompt: string,
  ratio: Ratio,
): ArtifactDocument {
  const updatedCards = doc.cards.map((card, idx) => {
    if (idx !== cardIndex) return card;

    const topZ = card.layers.reduce((max, layer) => Math.max(max, layer.z), -1) + 1;

    const imageLayer: ImageLayer = {
      id: crypto.randomUUID(),
      type: 'image',
      z: topZ,
      x: 0,
      y: 0,
      w: ratio.w,
      h: ratio.h,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      assetId,
      fit: 'contain',
      sourcePrompt,
    };

    return { ...card, layers: [...card.layers, imageLayer] };
  });

  return { ...doc, cards: updatedCards };
}

function buildImageEditPrompt(userInstruction: string): string {
  const instruction = userInstruction.trim();
  if (!instruction) {
    return 'Transform the source image while preserving its subject and composition. Do not add text, logos, watermarks, or signatures.';
  }
  return [
    'Transform the source image according to the following instruction.',
    'Preserve the original subject, composition, and important details.',
    'Do not add text, logos, watermarks, or signatures.',
    'Instruction:',
    instruction,
  ].join(' ');
}
