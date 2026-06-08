import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { Context } from 'hono';
import { ProjectIdParamSchema } from '../schemas/project.js';
import { ListMessagesQuerySchema, AppendMessageBodySchema } from '../schemas/chat.js';
import { validateParam, validateQuery, validateJson } from '../middleware/validate.js';
import { ChatService } from '../services/chatService.js';
import { createServiceContext, getRepositories } from '../services/service-context.js';
import { getAuth } from '../middleware/auth.js';
import { getRequestId } from '../middleware/request-id.js';
import type { Repositories } from '../repositories/types.js';

// ---------------------------------------------------------------------------
// Chat routes — protected
// ---------------------------------------------------------------------------
// Mounted under /v1/projects so the full paths are:
//   GET  /v1/projects/:id/messages
//   POST /v1/projects/:id/messages
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
    const service = new ChatService(repos.chat, repos.project);
    const messages = await service.listMessages(ctx, id, { limit: query.limit });
    return c.json({ ok: true, data: messages });
  }
);

// POST /v1/projects/:id/messages — append a user text message
chatRoutes.post(
  '/:id/messages',
  validateParam(ProjectIdParamSchema),
  validateJson(AppendMessageBodySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const ctx = buildServiceContext(c);
    const repos = getRepositories(ctx);
    const service = new ChatService(repos.chat, repos.project);
    const message = await service.appendUserMessage(ctx, id, { content: body.content });
    return c.json({ ok: true, data: message }, 201);
  }
);

export default chatRoutes;
