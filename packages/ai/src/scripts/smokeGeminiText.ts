/**
 * Manual smoke test for GeminiTextProvider.
 *
 * Usage:
 *   GEMINI_API_KEY=your-key pnpm --filter @orra/ai smoke:gemini
 *
 * Optional env vars:
 *   GEMINI_TEXT_MODEL  — defaults to gemini-2.0-flash-lite
 *   GEMINI_BASE_URL    — defaults to googleapis.com endpoint
 *
 * This script:
 *   - Reads GEMINI_API_KEY from env (exits if missing)
 *   - Calls GeminiTextProvider.planText with a small hardcoded request
 *   - Prints a safe summary: title, cardCount, directions, card count
 *   - Prints observer events (char counts and status only — no prompt/response text)
 *
 * This script does NOT:
 *   - Print the API key
 *   - Print raw provider response text
 *   - Write files
 *   - Touch the database
 *   - Enqueue jobs
 *   - Reserve or capture credits
 *
 * Never runs in automated tests. Never called from production worker code.
 */

import { GeminiTextProvider } from '../providers/geminiTextProvider.js';
import type { AIProviderObservation } from '../observability.js';
import { buildSmokeRequest } from '../smoke.js';

async function main(): Promise<void> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY environment variable is required.');
    console.error('Usage: GEMINI_API_KEY=your-key pnpm --filter @orra/ai smoke:gemini');
    process.exit(1);
  }

  const model = process.env['GEMINI_TEXT_MODEL'] ?? 'gemini-2.0-flash-lite';
  const baseUrl = process.env['GEMINI_BASE_URL'];

  const events: AIProviderObservation[] = [];
  const observer = {
    observe(event: AIProviderObservation): void {
      events.push(event);
    },
  };

  const provider = new GeminiTextProvider({ apiKey, model, baseUrl, observer });
  const request = buildSmokeRequest();

  console.log('--- Gemini Smoke Test ---');
  console.log(`model: ${model}`);
  console.log(`prompt chars: ${request.prompt.length}`);
  console.log('');

  let result;
  try {
    result = await provider.planText(request);
  } catch (err: unknown) {
    console.error('planText FAILED:', err instanceof Error ? err.message : String(err));
    if (err && typeof err === 'object' && 'code' in err) {
      console.error('  code:', (err as { code: string }).code);
    }
    if (err && typeof err === 'object' && 'retryable' in err) {
      console.error('  retryable:', (err as { retryable: boolean }).retryable);
    }
    console.log('');
    printEvents(events);
    process.exit(1);
  }

  console.log('Result:');
  console.log(`  title: ${result.title}`);
  console.log(`  cardCount: ${result.cardCount}`);
  console.log(`  layoutDirection: ${result.layoutDirection ?? '(not set)'}`);
  console.log(`  visualDirection: ${result.visualDirection ?? '(not set)'}`);
  console.log(`  cards: ${result.cards?.length ?? 0} planned`);
  console.log('');
  printEvents(events);
  console.log('SUCCESS');
}

function printEvents(events: AIProviderObservation[]): void {
  console.log('Observer events:');
  for (const evt of events) {
    // Safe print: no apiKey, no prompt text, no raw response text
    console.log(
      JSON.stringify({
        status: evt.status,
        durationMs: evt.durationMs,
        model: evt.model,
        promptChars: evt.promptChars,
        responseChars: evt.responseChars,
        normalizedCardCount: evt.normalizedCardCount,
        layoutDirection: evt.layoutDirection,
        visualDirection: evt.visualDirection,
        errorCode: evt.errorCode,
        retryable: evt.retryable,
      }),
    );
  }
  console.log('');
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
