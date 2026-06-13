import { createDbClient } from '@orra/api/src/db/client.js';
import { SupabaseGenerationJobRepository } from '@orra/api/src/repositories/generationJobRepository.js';
import { SupabaseArtifactRepository } from '@orra/api/src/repositories/artifactRepository.js';
import { SupabaseCreditRepository } from '@orra/api/src/repositories/creditRepository.js';
import { SupabaseProjectMemoryRepository } from '@orra/api/src/repositories/projectMemoryRepository.js';
import { MockGenerationConsumer } from './services/mockGenerationConsumer.js';
import { createAIProviderRouter } from '@orra/ai';
import type { ConsumerEnv } from './env.js';
import { validateConsumerEnv } from './env.js';

// ---------------------------------------------------------------------------
// Queue consumer Worker entry point
// ---------------------------------------------------------------------------
// Phase 9H: receives { jobId } messages from GENERATION_QUEUE and drives
// the mock lifecycle:
//   queued -> running -> generate mock artifact version -> succeeded.

export interface QueueMessage {
  jobId: string;
}

const handler: ExportedHandler<ConsumerEnv, QueueMessage> = {
  async queue(batch, env, _ctx) {
    // Validate env before creating any service so misconfiguration fails fast
    // with a clear message rather than throwing inside the first job.
    validateConsumerEnv(env);

    // Log provider mode so it's visible in Cloudflare observability — no secret values.
    console.log('[startup] provider_mode', JSON.stringify({
      environment: env.ENVIRONMENT ?? 'development',
      aiProvider: env.AI_PROVIDER ?? 'fake',
      imageProvider: env.IMAGE_PROVIDER ?? 'fake',
    }));

    const db = createDbClient(env as unknown as import('@orra/api/src/env.js').Env);
    const jobRepo = new SupabaseGenerationJobRepository(db);
    const artifactRepo = new SupabaseArtifactRepository(db);
    const creditRepo = new SupabaseCreditRepository(db);
    const projectMemoryRepo = new SupabaseProjectMemoryRepository(db);
    const consumer = new MockGenerationConsumer(
      jobRepo,
      artifactRepo,
      creditRepo,
      createAIProviderRouter({
        provider: env.AI_PROVIDER,
        geminiApiKey: env.GEMINI_API_KEY,
        geminiModel: env.GEMINI_TEXT_MODEL,
        geminiBaseUrl: env.GEMINI_BASE_URL,
        timeoutMs: env.AI_PROVIDER_TIMEOUT_MS,
      }),
      projectMemoryRepo,
    );

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
