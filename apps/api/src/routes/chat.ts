import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { Context } from 'hono';
import { ProjectIdParamSchema } from '../schemas/project.js';
import { ListMessagesQuerySchema, AppendMessageBodySchema, MessageIdParamSchema, ApprovalActionBodySchema } from '../schemas/chat.js';
import { validateParam, validateQuery, validateJson } from '../middleware/validate.js';
import { ChatService } from '../services/chatService.js';
import { ProjectMemoryService } from '../services/projectMemoryService.js';
import { createServiceContext, getRepositories } from '../services/service-context.js';
import { getAuth } from '../middleware/auth.js';
import { getRequestId } from '../middleware/request-id.js';
import type { Repositories } from '../repositories/types.js';
import { createAIProviderRouter } from '@orra/ai';
import type { AIProvider } from '@orra/ai';

// ---------------------------------------------------------------------------
// Chat routes — protected
// ---------------------------------------------------------------------------
// Mounted under /v1/projects so the full paths are:
//   GET  /v1/projects/:id/messages  -> { ok: true, data: ChatMessageDto[] }
//   POST /v1/projects/:id/messages  -> { ok: true, data: { message, intent } }
//
// POST response includes a deterministic Director intent classification:
//   - mode: 'conversation' | 'generation'
//   - confidence: 'low' | 'medium' | 'high'
//   - reason: human-readable explanation
//   - generationHint: { artifactType, requestedCardCount, rawTopic } (optional)
//
// This is a rule-based skeleton. No AI provider calls. No approval cards.
// No generation jobs. No credit reservation. Those come in later phases.
//
// All routes require authentication. Workspace scoping is enforced by the
// service layer; routes are thin and never touch Supabase directly.

const chatRoutes = new Hono<{ Bindings: Env }>();

function buildServiceContext(c: Context<{ Bindings: Env }>): ReturnType<typeof createServiceContext> {
  const auth = getAuth(c);
  const requestId = getRequestId(c) ?? 'unknown';
  const repositories = c.get('repositories' as never) as Repositories | undefined;
  return createServiceContext(c.env, requestId, auth ?? undefined, repositories ? { repositories } : undefined);
}

function buildAIProvider(c: Context<{ Bindings: Env }>): AIProvider {
  const router = createAIProviderRouter({
    provider: c.env.AI_PROVIDER ?? 'fake',
    geminiApiKey: c.env.GEMINI_API_KEY,
    geminiModel: c.env.GEMINI_TEXT_MODEL,
    openaiApiKey: c.env.OPENAI_API_KEY,
    openaiModel: c.env.OPENAI_TEXT_MODEL,
    timeoutMs: c.env.AI_PROVIDER_TIMEOUT_MS,
  });
  return router.getProvider();
}

// GET /v1/projects/:id/messages — list messages for a project thread
chatRoutes.get(
  '/:id/messages',
  validateParam(ProjectIdParamSchema),
  validateQuery(ListMessagesQuerySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const query = c.req.valid('query');
    const ctx = buildServiceContext(c);
    const repos = getRepositories(ctx);
    const memoryService = repos.projectMemory ? new ProjectMemoryService(repos.projectMemory) : undefined;
    const service = new ChatService(repos.chat, repos.project, repos.brandSystem, memoryService);
    const messages = await service.listMessages(ctx, id, { limit: query.limit });
    return c.json({ ok: true, data: messages });
  }
);

// POST /v1/projects/:id/messages — append a user text message
//
// When the message classifies as generation intent, the service also creates
// an assistant approval_summary message. The response then includes:
//   { message, intent, approvalMessage? }
//
// No AI calls, no credit reservation, no generation jobs in this phase.
chatRoutes.post(
  '/:id/messages',
  validateParam(ProjectIdParamSchema),
  validateJson(AppendMessageBodySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const ctx = buildServiceContext(c);
    const repos = getRepositories(ctx);
    const memoryService = repos.projectMemory ? new ProjectMemoryService(repos.projectMemory) : undefined;
    const aiProvider = buildAIProvider(c);
    const service = new ChatService(repos.chat, repos.project, repos.brandSystem, memoryService, repos.artifact, aiProvider);
    const result = await service.appendUserMessage(ctx, id, {
      content: body.content,
      selectedCardIndex: body.selectedCardIndex,
    });
    return c.json({ ok: true, data: result }, 201);
  }
);

// POST /v1/projects/:id/messages/:messageId/approval-action
//
// Handle an action on an approval_summary message. Transitions the approval
// state without starting generation or moving credits.
//
// Actions:
//   approve_and_create  -> status: approved
//   cancel              -> status: cancelled
//   add_cta             -> status: needs_cta (optionally updates CTA text)
//   edit_direction      -> status: editing_direction (stores direction text)
chatRoutes.post(
  '/:id/messages/:messageId/approval-action',
  validateParam(MessageIdParamSchema),
  validateJson(ApprovalActionBodySchema),
  async (c) => {
    const { id, messageId } = c.req.valid('param');
    const body = c.req.valid('json');
    const ctx = buildServiceContext(c);
    const repos = getRepositories(ctx);
    const memoryService = repos.projectMemory ? new ProjectMemoryService(repos.projectMemory) : undefined;
    const service = new ChatService(repos.chat, repos.project, repos.brandSystem, memoryService);
    const updatedMessage = await service.handleApprovalAction(ctx, id, messageId, {
      action: body.action,
      value: body.value,
    });
    return c.json({ ok: true, data: updatedMessage }, 200);
  }
);

// POST /v1/projects/:id/messages/:messageId/prepare
//
// Runs director/planning logic on an existing user message without duplicating it.
// Idempotent — calling twice returns the existing assistant response.
// No generation job, no credit reservation.
chatRoutes.post(
  '/:id/messages/:messageId/prepare',
  validateParam(MessageIdParamSchema),
  async (c) => {
    const { id, messageId } = c.req.valid('param');
    const ctx = buildServiceContext(c);
    const repos = getRepositories(ctx);
    const memoryService = repos.projectMemory ? new ProjectMemoryService(repos.projectMemory) : undefined;
    const aiProvider = buildAIProvider(c);
    const service = new ChatService(repos.chat, repos.project, repos.brandSystem, memoryService, undefined, aiProvider);
    const result = await service.prepareMessage(ctx, id, messageId);
    return c.json({ ok: true, data: result }, 201);
  }
);

export default chatRoutes;
