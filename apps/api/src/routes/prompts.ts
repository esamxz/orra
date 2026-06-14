import { Hono } from 'hono';
import type { Env } from '../env.js';
import { EnhancePromptRequestSchema } from '@orra/shared';
import { validateJson } from '../middleware/validate.js';
import { enhancePrompt } from '../services/promptEnhancerService.js';
import { success } from '../response.js';

// ---------------------------------------------------------------------------
// Prompts route — protected
// ---------------------------------------------------------------------------
// POST /v1/prompts/enhance  — deterministic prompt enhancement (P0)
// No DB mutations. No credit reservation. No AI calls.

const promptsRoute = new Hono<{ Bindings: Env }>();

promptsRoute.post('/enhance', validateJson(EnhancePromptRequestSchema), async (c) => {
  const body = c.req.valid('json');
  const result = enhancePrompt(body);
  return success(c, result);
});

export default promptsRoute;
