import { Hono } from 'hono';
import type { Env } from '../env.js';
import { EnhancePromptRequestSchema } from '@orra/shared';
import type { AIProvider } from '@orra/ai';
import { createAIProviderRouter, isAIProviderError } from '@orra/ai';
import { validateJson } from '../middleware/validate.js';
import { enhancePrompt } from '../services/promptEnhancerService.js';
import { success } from '../response.js';
import { ApiError } from '../errors.js';

// ---------------------------------------------------------------------------
// Prompts route — protected
// ---------------------------------------------------------------------------
// POST /v1/prompts/enhance  — prompt enhancement (P0/P0.2)
// No DB mutations. No credit reservation.
// mode=deterministic (default): rule-based, no AI calls.
// mode=ai: routes through AIProviderRouter (GeminiTextProvider or FakeAIProvider).

export function createPromptsRoute(opts?: { testProvider?: AIProvider }): Hono<{ Bindings: Env }> {
  const route = new Hono<{ Bindings: Env }>();

  route.post('/enhance', validateJson(EnhancePromptRequestSchema), async (c) => {
    const body = c.req.valid('json');
    const mode = (c.env.PROMPT_ENHANCER_MODE ?? 'deterministic') as 'ai' | 'deterministic';

    let provider: AIProvider | undefined = opts?.testProvider;

    if (!provider && mode === 'ai') {
      try {
        const router = createAIProviderRouter({
          provider: c.env.AI_PROVIDER ?? 'fake',
          geminiApiKey: c.env.GEMINI_API_KEY,
          geminiModel: c.env.GEMINI_TEXT_MODEL,
          timeoutMs: c.env.AI_PROVIDER_TIMEOUT_MS,
          openaiApiKey: c.env.OPENAI_API_KEY,
          openaiModel: c.env.OPENAI_TEXT_MODEL,
        });
        provider = router.getProvider();
      } catch (err) {
        if (isAIProviderError(err)) {
          throw new ApiError('PROVIDER_FAILURE', 'AI enhancement provider is not available.');
        }
        throw err;
      }
    }

    const result = await enhancePrompt(body, { provider, mode });
    return success(c, result);
  });

  return route;
}

export default createPromptsRoute();
