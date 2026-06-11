/**
 * Full-queue staging smoke test for GeminiTextProvider through the real consumer path.
 *
 * Usage:
 *   ORRA_SMOKE_FULL_QUEUE=1 \
 *   AI_PROVIDER=gemini \
 *   GEMINI_API_KEY=your-key \
 *   SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=your-service-key \
 *   ENVIRONMENT=staging \
 *   pnpm --filter @orra/consumer smoke:gemini-job -- --jobId <id>
 *
 * Optional env vars:
 *   GEMINI_TEXT_MODEL        — defaults to gemini-2.0-flash-lite
 *   GEMINI_BASE_URL          — defaults to googleapis.com endpoint
 *   AI_PROVIDER_TIMEOUT_MS   — defaults to 30000
 *
 * This script:
 *   - Validates env and prints a safe config summary (key present: true/false, never the value)
 *   - Takes --jobId from argv (the job must already exist and be in 'queued' status)
 *   - Creates a real Supabase client and repository set from env
 *   - Instantiates MockGenerationConsumer with GeminiTextProvider router
 *   - Calls consumer.processMessage({ jobId }) — the exact same code path as production
 *   - Prints safe outcome: final status, resultVersionId, capturedCredits, durationMs
 *
 * This script does NOT:
 *   - Print the API key
 *   - Print raw provider response text or prompt text
 *   - Create new jobs (only processes an existing jobId)
 *   - Write to production (refused if ENVIRONMENT=production)
 *   - Run automatically or during tests
 *
 * See docs/ai-staging-smoke.md for the full staging runbook.
 */

import { createDbClient } from '@orra/api/src/db/client.js';
import { SupabaseGenerationJobRepository } from '@orra/api/src/repositories/generationJobRepository.js';
import { SupabaseArtifactRepository } from '@orra/api/src/repositories/artifactRepository.js';
import { SupabaseCreditRepository } from '@orra/api/src/repositories/creditRepository.js';
import { SupabaseProjectMemoryRepository } from '@orra/api/src/repositories/projectMemoryRepository.js';
import { MockGenerationConsumer } from '../services/mockGenerationConsumer.js';
import { createAIProviderRouter } from '@orra/ai';
import { basename } from 'node:path';

// ---------------------------------------------------------------------------
// Exported helpers (used by tests — pure functions, no process.exit)
// ---------------------------------------------------------------------------

export function validateSmokeConfig(env: NodeJS.ProcessEnv): void {
  if (env['ORRA_SMOKE_FULL_QUEUE'] !== '1') {
    throw new Error(
      'Set ORRA_SMOKE_FULL_QUEUE=1 to enable full-queue smoke mode.\n' +
        'WARNING: This script processes a REAL job against a REAL database. Staging only.',
    );
  }
  if (env['ENVIRONMENT'] === 'production') {
    throw new Error(
      'Smoke mode refused: ENVIRONMENT=production.\n' +
        'This script must not run against the production database.',
    );
  }
  if (env['AI_PROVIDER'] !== 'gemini') {
    throw new Error(
      `Smoke mode requires AI_PROVIDER=gemini.\n` +
        `Current: AI_PROVIDER=${env['AI_PROVIDER'] ?? '(not set)'}`,
    );
  }
  if (!env['GEMINI_API_KEY']) {
    throw new Error('Smoke mode requires GEMINI_API_KEY to be set.');
  }
  if (!env['SUPABASE_URL']) {
    throw new Error('Smoke mode requires SUPABASE_URL to be set.');
  }
  if (!env['SUPABASE_SERVICE_ROLE_KEY']) {
    throw new Error('Smoke mode requires SUPABASE_SERVICE_ROLE_KEY to be set.');
  }
}

export function buildSafeConfigSummary(env: NodeJS.ProcessEnv): string {
  const lines = [
    '[smoke] Config summary:',
    `  provider: ${env['AI_PROVIDER'] ?? 'fake'}`,
    `  model: ${env['GEMINI_TEXT_MODEL'] ?? 'gemini-2.0-flash-lite (default)'}`,
    `  environment: ${env['ENVIRONMENT'] ?? 'development'}`,
    `  timeout_ms: ${env['AI_PROVIDER_TIMEOUT_MS'] ?? '30000 (default)'}`,
    // Key presence only — never print the key value
    `  gemini_key_present: ${Boolean(env['GEMINI_API_KEY'])}`,
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Script internals
// ---------------------------------------------------------------------------

function parseJobId(argv: string[]): string {
  const idx = argv.indexOf('--jobId');
  if (idx === -1 || !argv[idx + 1]) {
    throw new Error(
      '--jobId <id> is required.\n' +
        'Usage: pnpm --filter @orra/consumer smoke:gemini-job -- --jobId <id>',
    );
  }
  const id = argv[idx + 1];
  if (!id || id.startsWith('--')) {
    throw new Error('--jobId requires a non-empty value that does not start with --');
  }
  return id;
}

async function main(): Promise<void> {
  // Safety guards
  try {
    validateSmokeConfig(process.env);
  } catch (err) {
    console.error('ERROR:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(buildSafeConfigSummary(process.env));
  console.log('');

  // Parse --jobId
  let jobId: string;
  try {
    jobId = parseJobId(process.argv);
  } catch (err) {
    console.error('ERROR:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`[smoke] Processing job: ${jobId}`);
  console.log(
    '[smoke] WARNING: This processes a real job in the real database. Press Ctrl+C to cancel.',
  );
  console.log('');

  const t0 = Date.now();

  // Create real Supabase client + repositories
  const db = createDbClient({
    SUPABASE_URL: process.env['SUPABASE_URL']!,
    SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  } as unknown as import('@orra/api/src/env.js').Env);

  const jobRepo = new SupabaseGenerationJobRepository(db);
  const artifactRepo = new SupabaseArtifactRepository(db);
  const creditRepo = new SupabaseCreditRepository(db);
  const projectMemoryRepo = new SupabaseProjectMemoryRepository(db);

  // Create real GeminiTextProvider router
  const aiRouter = createAIProviderRouter({
    provider: process.env['AI_PROVIDER'],
    geminiApiKey: process.env['GEMINI_API_KEY'],
    geminiModel: process.env['GEMINI_TEXT_MODEL'],
    geminiBaseUrl: process.env['GEMINI_BASE_URL'],
    timeoutMs: process.env['AI_PROVIDER_TIMEOUT_MS']
      ? Number(process.env['AI_PROVIDER_TIMEOUT_MS'])
      : undefined,
  });

  const consumer = new MockGenerationConsumer(
    jobRepo,
    artifactRepo,
    creditRepo,
    aiRouter,
    projectMemoryRepo,
  );

  // Process the job — same code path as production
  try {
    await consumer.processMessage({ jobId });
  } catch (err) {
    console.error(
      '[smoke] Consumer threw unexpectedly:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  // Read final job state
  const finalJob = await jobRepo.findById(jobId);
  const durationMs = Date.now() - t0;

  if (!finalJob) {
    console.error(`[smoke] Job ${jobId} not found in database after processing.`);
    process.exit(1);
  }

  if (finalJob.status === 'succeeded') {
    // Safe output: no artifact JSON, no prompt text, no API key
    console.log(
      `[smoke] Job succeeded. resultVersionId: ${finalJob.result_version_id}, ` +
        `capturedCredits: ${finalJob.captured_credits}, durationMs: ${durationMs}`,
    );
    console.log('[smoke] SUCCESS');
  } else if (finalJob.status === 'failed') {
    const errCode =
      (finalJob.error as Record<string, string> | null)?.['code'] ?? 'unknown';
    const errMsg =
      (finalJob.error as Record<string, string> | null)?.['message'] ?? 'unknown';
    console.error(
      `[smoke] Job FAILED. code: ${errCode}, message: ${errMsg}, durationMs: ${durationMs}`,
    );
    process.exit(1);
  } else {
    // Not queued at call time — consumer skipped it (duplicate delivery guard)
    console.log(
      `[smoke] Job status after processMessage: ${finalJob.status}. ` +
        `The job may not have been in 'queued' status (duplicate delivery or already processed).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Entry point guard — only call main() when executed directly, not when
// imported by tests or other modules.
// ---------------------------------------------------------------------------
const scriptName = basename(process.argv[1] ?? '').replace(/\.[jt]s$/, '');
if (scriptName === 'smokeFullQueueGemini') {
  main().catch((err: unknown) => {
    console.error(
      'Unexpected error:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  });
}
