import type { GenerationJobRepository } from '@orra/api/src/repositories/generationJobRepository.js';

// ---------------------------------------------------------------------------
// Mock generation consumer
// ---------------------------------------------------------------------------
// Phase 9G: processes queue messages and transitions job lifecycle without
// invoking AI, writing artifacts, or touching credits.
//
// Idempotency rule:
//   - Fetch job by id
//   - Guard transition queued -> running (skip if not queued)
//   - Perform mock work (no external calls)
//   - Guard transition running -> succeeded
//   - If any guard fails, the message is acked silently (duplicate delivery)

export interface QueueMessage {
  jobId: string;
}

export class MockGenerationConsumer {
  constructor(private jobRepo: GenerationJobRepository) {}

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
      // Another consumer already transitioned this job; safe to skip.
      console.info(`Job ${message.jobId} already transitioned from queued; skipping.`);
      return;
    }

    // 5. Mock work: no AI, no external calls, instant.
    // In a real generation this would be the content/planner/image pipeline.
    console.info(`Mock processing job ${message.jobId} ...`);

    // 6. Transition running -> succeeded (guarded)
    const succeeded = await this.jobRepo.markSucceededGuarded(message.jobId);
    if (!succeeded) {
      // The job may have been cancelled or failed concurrently.
      console.warn(`Job ${message.jobId} could not transition to succeeded; may have been handled.`);
      return;
    }

    console.info(`Job ${message.jobId} completed successfully.`);
  }
}
