import { createDbClient } from '@orra/api/src/db/client.js';
import { SupabaseGenerationJobRepository } from '@orra/api/src/repositories/generationJobRepository.js';
import { MockGenerationConsumer } from './services/mockGenerationConsumer.js';
import type { ConsumerEnv } from './env.js';

// ---------------------------------------------------------------------------
// Queue consumer Worker entry point
// ---------------------------------------------------------------------------
// Phase 9G: receives { jobId } messages from GENERATION_QUEUE and drives
// the mock lifecycle: queued -> running -> succeeded.

export interface QueueMessage {
  jobId: string;
}

const handler: ExportedHandler<ConsumerEnv, QueueMessage> = {
  async queue(batch, env, _ctx) {
    const db = createDbClient(env as unknown as import('@orra/api/src/env.js').Env);
    const jobRepo = new SupabaseGenerationJobRepository(db);
    const consumer = new MockGenerationConsumer(jobRepo);

    for (const message of batch.messages) {
      try {
        await consumer.processMessage(message.body);
        message.ack();
      } catch (err) {
        console.error('Failed to process queue message:', err);
        // Retry on transient failures; dead-letter after max retries.
        message.retry();
      }
    }
  },
};

export default handler;
