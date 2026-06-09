import type { GenerationJobRepository } from '@orra/api/src/repositories/generationJobRepository.js';
import type { ArtifactRepository } from '@orra/api/src/repositories/artifactRepository.js';
import type { ArtifactDocument } from '@orra/shared';
import { ArtifactDocumentSchema } from '@orra/shared';
import { generateMockArtifactDocument } from './mockArtifactGenerator.js';

// ---------------------------------------------------------------------------
// Mock generation consumer
// ---------------------------------------------------------------------------
// Phase 9H: processes queue messages and writes a deterministic mock artifact
// version before marking the job succeeded.
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
//   9. Mark job succeeded with result_version_id
//
// Failure handling:
//   - Missing artifact / invalid document: markFailedGuarded
//   - Commit conflict: markFailedGuarded
//   - Any unexpected error: markFailedGuarded (safe fallback)
//
// Idempotency rule:
//   - Fetch job by id
//   - Guard transition queued -> running (skip if not queued)
//   - Perform work (load, generate, commit)
//   - Guard transition running -> succeeded with result (skip if not running)
//   - If any guard fails, the message is acked silently (duplicate delivery)

export interface QueueMessage {
  jobId: string;
}

export class MockGenerationConsumer {
  constructor(
    private jobRepo: GenerationJobRepository,
    private artifactRepo: ArtifactRepository
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

      // 7. Determine target card count from job plan if available
      const plan = (job.plan ?? {}) as Record<string, unknown>;
      const approvalCard = plan.approvalCard as Record<string, unknown> | undefined;
      const summaryLine = (approvalCard?.summaryLine as string) ?? '';
      // Extract a simple topic from the summary line for mock copy
      const topic = summaryLine.replace(/^Ready to create\s*(a\s*)?/i, '').trim() || null;

      let targetCardCount: number | undefined;
      if (currentDocument.type === 'carousel') {
        // If the plan or generation hint included a card count, use it.
        // Otherwise keep the current count (minimum 3 if only 1 empty card).
        targetCardCount = Math.max(currentDocument.cards.length, 3);
      } else {
        targetCardCount = 1;
      }

      // 8. Generate mock updated document
      const mockDocument = generateMockArtifactDocument({
        currentDocument,
        targetCardCount,
        topic,
      });

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

      // 10. Transition running -> succeeded with result_version_id (guarded)
      const succeeded = await this.jobRepo.markSucceededWithResultGuarded(
        message.jobId,
        committedVersion.id
      );

      if (!succeeded) {
        console.warn(
          `Job ${message.jobId} could not transition to succeeded after artifact commit; may have been handled concurrently.`
        );
        return;
      }

      console.info(`Job ${message.jobId} completed successfully. Result version ${committedVersion.id}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error during mock generation';
      console.error(`Job ${message.jobId} failed during processing: ${errMsg}`);

      // Safe fallback: mark job failed so it does not stay running forever
      await this.jobRepo.markFailedGuarded(message.jobId, {
        code: 'MOCK_GENERATION_FAILED',
        message: errMsg,
      });
    }
  }
}
