import { describe, it, expect } from 'vitest';
import { ChatService } from '../services/chatService.js';
import { ApiError } from '../errors.js';
import type { ChatRepository } from '../repositories/chatRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { ProjectRow, ChatThreadRow, ChatMessageRow } from '@orra/db';
import type { AIProvider } from '@orra/ai';
import { AIProviderError } from '@orra/ai';

// ---------------------------------------------------------------------------
// Fake project repository
// ---------------------------------------------------------------------------

function createFakeProjectRepository(initial: ProjectRow[] = []): ProjectRepository {
  const projects = [...initial];

  return {
    async create() {
      throw new Error('not used');
    },
    async listByWorkspace() {
      return [];
    },
    async findByIdForWorkspace(input) {
      return projects.find((p) => p.id === input.id && p.workspace_id === input.workspaceId) ?? null;
    },
    async updateForWorkspace() {
      return null;
    },
    async deleteForWorkspace() {},
  };
}

// ---------------------------------------------------------------------------
// Fake chat repository
// ---------------------------------------------------------------------------

function createFakeChatRepository(
  initialThreads: ChatThreadRow[] = [],
  initialMessages: ChatMessageRow[] = []
): ChatRepository {
  const threads = [...initialThreads];
  const messages = [...initialMessages];
  let nextThreadId = 1;
  let nextMessageId = 1;

  return {
    async ensureThreadForProject(input) {
      const existing = threads.find(
        (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
      );
      if (existing) return existing;

      const thread: ChatThreadRow = {
        id: `thread-${nextThreadId++}`,
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        title: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      threads.push(thread);
      return thread;
    },

    async findThreadByProjectId(input) {
      return (
        threads.find(
          (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
        ) ?? null
      );
    },

    async listMessagesByThread(input) {
      return messages
        .filter((m) => m.thread_id === input.threadId && m.workspace_id === input.workspaceId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(0, input.limit);
    },

    async listRecentMessagesForProject(input) {
      const thread = threads.find(
        (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
      );
      if (!thread) return [];
      return messages
        .filter((m) => m.thread_id === thread.id && m.workspace_id === input.workspaceId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(0, input.limit)
        .map((m) => ({ role: m.role, content: m.content, created_at: m.created_at }));
    },

    async appendMessage(input) {
      const message: ChatMessageRow = {
        id: `msg-${nextMessageId++}`,
        workspace_id: input.workspaceId,
        thread_id: input.threadId,
        role: input.role,
        kind: input.kind,
        content: input.content,
        metadata: input.metadata ?? {},
        seq: input.seq ?? null,
        created_at: new Date().toISOString(),
      };
      messages.push(message);
      return message;
    },

    async findMessageByIdForProject(input) {
      const thread = threads.find(
        (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
      );
      if (!thread) return null;
      return (
        messages.find((m) => m.id === input.messageId && m.thread_id === thread.id) ?? null
      );
    },

    async updateMessageMetadata(input) {
      const idx = messages.findIndex(
        (m) => m.id === input.messageId && m.workspace_id === input.workspaceId
      );
      if (idx === -1) throw new Error('Message not found');
      messages[idx] = { ...messages[idx], metadata: input.metadata };
      return messages[idx];
    },
  };
}

function fakeAuthContext(workspaceId: string) {
  return {
    env: {} as unknown as import('../env.js').Env,
    requestId: 'req-123',
    auth: {
      isAuthenticated: true,
      clerkUserId: 'usr_test',
      userId: 'user-1',
      workspaceId,
      role: 'owner' as const,
      authSource: 'clerk' as const,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatService', () => {
  it('appendUserMessage requires auth', async () => {
    const service = new ChatService(createFakeChatRepository(), createFakeProjectRepository());
    const ctx = {
      env: {} as unknown as import('../env.js').Env,
      requestId: 'req-123',
      auth: undefined,
    };

    await expect(
      service.appendUserMessage(ctx, 'proj-1', { content: 'Hello' })
    ).rejects.toThrow(ApiError);
  });

  it('appendUserMessage verifies project ownership', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ChatService(createFakeChatRepository(), projectRepo);
    const ctx = fakeAuthContext('ws-2');

    await expect(
      service.appendUserMessage(ctx, 'proj-1', { content: 'Hello' })
    ).rejects.toThrow('Project not found');
  });

  it('cross-workspace project returns NOT_FOUND', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ChatService(createFakeChatRepository(), projectRepo);
    const ctx = fakeAuthContext('ws-2');

    await expect(service.appendUserMessage(ctx, 'proj-1', { content: 'Hello' })).rejects.toThrow(
      ApiError
    );
    await expect(service.appendUserMessage(ctx, 'proj-1', { content: 'Hello' })).rejects.toThrow(
      'Project not found'
    );
  });

  it('appendUserMessage creates thread if missing', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', { content: 'Hello' });

    expect(result.message.projectId).toBe('proj-1');
    expect(result.message.role).toBe('user');
    expect(result.message.kind).toBe('text');
    expect(result.message.content).toBe('Hello');
    expect(result.message.threadId).toBeTruthy();
    expect(result.intent).toBeDefined();
    expect(result.intent.mode).toBe('conversation');
  });

  it('appendUserMessage returns frontend-safe DTO', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ChatService(createFakeChatRepository(), projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', { content: 'Test' });

    expect(result.message).toHaveProperty('id');
    expect(result.message).toHaveProperty('projectId');
    expect(result.message).toHaveProperty('threadId');
    expect(result.message).toHaveProperty('role');
    expect(result.message).toHaveProperty('kind');
    expect(result.message).toHaveProperty('content');
    expect(result.message).toHaveProperty('metadata');
    expect(result.message).toHaveProperty('seq');
    expect(result.message).toHaveProperty('createdAt');
    expect(result.message).not.toHaveProperty('workspace_id');
    expect(result.intent).toBeDefined();
    expect(result.intent).toHaveProperty('mode');
    expect(result.intent).toHaveProperty('confidence');
    expect(result.intent).toHaveProperty('reason');
  });

  it('listMessages returns ordered messages', async () => {
    const thread: ChatThreadRow = {
      id: 'thread-1',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      title: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const messages: ChatMessageRow[] = [
      {
        id: 'msg-1',
        workspace_id: 'ws-1',
        thread_id: 'thread-1',
        role: 'user',
        kind: 'text',
        content: 'First',
        metadata: {},
        seq: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'msg-2',
        workspace_id: 'ws-1',
        thread_id: 'thread-1',
        role: 'assistant',
        kind: 'text',
        content: 'Second',
        metadata: {},
        seq: null,
        created_at: '2026-01-01T00:01:00Z',
      },
    ];

    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository([thread], messages);
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.listMessages(ctx, 'proj-1', { limit: 50 });

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('First');
    expect(result[1].content).toBe('Second');
  });

  it('listMessages creates thread safely when empty', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.listMessages(ctx, 'proj-1', { limit: 50 });

    expect(result).toHaveLength(0);
  });

  it('appendAssistantMessage stores assistant role and kind', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const message = await service.appendAssistantMessage(ctx, 'proj-1', {
      content: 'Plan ready',
      kind: 'approval_summary',
      metadata: { planId: 'plan-1' },
    });

    expect(message.role).toBe('assistant');
    expect(message.kind).toBe('approval_summary');
    expect(message.content).toBe('Plan ready');
    expect(message.metadata).toEqual({ planId: 'plan-1' });
  });

  // ---------------------------------------------------------------------------
  // Director intent classification
  // ---------------------------------------------------------------------------

  it('appendUserMessage returns generation intent for creation prompt', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ChatService(createFakeChatRepository(), projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Create a 5-card carousel about self-improvement',
    });

    expect(result.intent.mode).toBe('generation');
    expect(result.intent.confidence).toBe('high');
    expect(result.intent.generationHint?.artifactType).toBe('carousel');
    expect(result.intent.generationHint?.requestedCardCount).toBe(5);
    expect(result.intent.generationHint?.rawTopic).toBeTruthy();
  });

  it('appendUserMessage returns conversation intent for discussion prompt', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ChatService(createFakeChatRepository(), projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'What do you think about this idea?',
    });

    expect(result.intent.mode).toBe('conversation');
    expect(result.intent.confidence).toBe('high');
    expect(result.intent.generationHint).toBeUndefined();
  });

  it('appendUserMessage returns generation intent with post hint', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ChatService(createFakeChatRepository(), projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Make a post about focus',
    });

    expect(result.intent.mode).toBe('generation');
    expect(result.intent.generationHint?.artifactType).toBe('post');
  });

  it('generation intent creates approval_summary assistant message', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', { content: 'Create a post' });

    expect(result.approvalMessage).toBeDefined();
    expect(result.approvalMessage!.role).toBe('assistant');
    expect(result.approvalMessage!.kind).toBe('approval_summary');
    expect(typeof result.approvalMessage!.content).toBe('string');

    const messages = await service.listMessages(ctx, 'proj-1', { limit: 50 });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].kind).toBe('approval_summary');
  });

  it('approval message metadata contains approvalCard', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Create a 5-card carousel about self-improvement',
    });

    expect(result.approvalMessage).toBeDefined();
    const meta = result.approvalMessage!.metadata as Record<string, unknown>;
    expect(meta).toHaveProperty('approvalCard');
    const card = meta.approvalCard as Record<string, unknown>;
    expect(card.summaryLine).toContain('5-card carousel');
    expect(card.actions).toContain('approve_and_create');
    expect(card.actions).toContain('cancel');
  });

  it('approval metadata includes sourceUserMessageId', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', { content: 'Create a post' });

    expect(result.approvalMessage).toBeDefined();
    const meta = result.approvalMessage!.metadata as Record<string, unknown>;
    expect(meta).toHaveProperty('sourceUserMessageId');
    expect(meta.sourceUserMessageId).toBe(result.message.id);
  });

  it('conversation intent does not create approval_summary', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'What do you think about this idea?',
    });

    expect(result.approvalMessage).toBeUndefined();

    const messages = await service.listMessages(ctx, 'proj-1', { limit: 50 });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });

  it('no generation job is created', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    await service.appendUserMessage(ctx, 'proj-1', { content: 'Create a post' });

    // If a generation job were created, it would be visible in some repository.
    // Since we only have chat and project repos, verify no extra messages
    // beyond the user + approval_summary appear.
    const messages = await service.listMessages(ctx, 'proj-1', { limit: 50 });
    expect(messages).toHaveLength(2);
    expect(messages.filter((m) => m.kind === 'job_ref')).toHaveLength(0);
  });

  it('no artifact mutation happens', async () => {
    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    await service.appendUserMessage(ctx, 'proj-1', { content: 'Create a post' });

    // There is no artifact repo in ChatService, and no artifact state to mutate.
    // This test serves as a structural guard: approval card creation must not
    // touch the artifact or its versions.
    const messages = await service.listMessages(ctx, 'proj-1', { limit: 50 });
    const kinds = messages.map((m) => m.kind);
    expect(kinds).toEqual(['text', 'approval_summary']);
  });
});

// ---------------------------------------------------------------------------
// Phase 14D: approval card direction hints
// ---------------------------------------------------------------------------

import { ProjectMemoryService } from '../services/projectMemoryService.js';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import type { ProjectMemoryRepository } from '../repositories/projectMemoryRepository.js';
import type { BrandSystemRow, ProjectContextMemoryRow } from '@orra/db';

function makeProject(overrides: Partial<import('@orra/db').ProjectRow> = {}): import('@orra/db').ProjectRow {
  return {
    id: 'proj-1',
    workspace_id: 'ws-1',
    name: 'Phase 14D Test',
    type: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    brand_system_id: null,
    source_template_id: null,
    autosave_state: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

function makeBrandSystemRow(overrides: Partial<BrandSystemRow> = {}): BrandSystemRow {
  return {
    id: 'brand-1',
    workspace_id: 'ws-1',
    name: 'Studio',
    description: null,
    tone_of_voice: null,
    visual_direction: null,
    rules: null,
    palette: [],
    typography: {},
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

function createFakeBrandRepo(row: BrandSystemRow | null): BrandSystemRepository {
  return {
    async create() { throw new Error('not used'); },
    async listByWorkspace() { return []; },
    async findByIdForWorkspace() { return row; },
    async updateForWorkspace() { return null; },
    async deleteForWorkspace() {},
  };
}

function makeMemoryRow(summary: string): ProjectContextMemoryRow {
  return {
    id: 'mem-1',
    workspace_id: 'ws-1',
    project_id: 'proj-1',
    summary,
    topic: null,
    audience: null,
    tone: null,
    platform: null,
    format: null,
    carousel_goal: null,
    slide_count: null,
    visual_direction: null,
    approved_direction: null,
    rejected_ideas: [],
    user_preferences: [],
    constraints: [],
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

function createFakeMemoryRepo(row: ProjectContextMemoryRow | null = null): ProjectMemoryRepository {
  return {
    async getByProjectIdForWorkspace() { return row; },
    async upsertForProject() { throw new Error('not used'); },
    async patchForProject() { throw new Error('not used'); },
    async ensureForProject() { throw new Error('not used'); },
  };
}

describe('Phase 14D: approval card direction hints', () => {
  it('approval card includes cardCount when intent has requestedCardCount', async () => {
    const projectRepo = createFakeProjectRepository([makeProject()]);
    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Create a 5-card carousel about sleep',
    });

    const card = (result.approvalMessage!.metadata as Record<string, unknown>).approvalCard as Record<string, unknown>;
    expect(card.cardCount).toBe(5);
  });

  it('approval card cardCount is absent when intent has no requestedCardCount', async () => {
    const projectRepo = createFakeProjectRepository([makeProject()]);
    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Create a post about focus',
    });

    const card = (result.approvalMessage!.metadata as Record<string, unknown>).approvalCard as Record<string, unknown>;
    expect(card.cardCount).toBeUndefined();
  });

  it('approval card includes visualDirection when brand has visual_direction', async () => {
    const brandRow = makeBrandSystemRow({ visual_direction: 'soft natural light, muted earth tones' });
    const projectRepo = createFakeProjectRepository([makeProject({ brand_system_id: 'brand-1' })]);
    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo, createFakeBrandRepo(brandRow));
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Create a post about wellness',
    });

    const card = (result.approvalMessage!.metadata as Record<string, unknown>).approvalCard as Record<string, unknown>;
    expect(card.visualDirection).toBe('soft natural light, muted earth tones');
  });

  it('approval card has no visualDirection when brand has no visual_direction', async () => {
    const brandRow = makeBrandSystemRow({ visual_direction: null });
    const projectRepo = createFakeProjectRepository([makeProject({ brand_system_id: 'brand-1' })]);
    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo, createFakeBrandRepo(brandRow));
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Create a post',
    });

    const card = (result.approvalMessage!.metadata as Record<string, unknown>).approvalCard as Record<string, unknown>;
    expect(card.visualDirection).toBeUndefined();
  });

  it('approval card includes memorySummary when memory service returns a summary', async () => {
    const memoryRow = makeMemoryRow('User focuses on wellness content for Instagram.');
    const memoryService = new ProjectMemoryService(createFakeMemoryRepo(memoryRow));
    const projectRepo = createFakeProjectRepository([makeProject()]);
    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo, undefined, memoryService);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Create a post about sleep',
    });

    const card = (result.approvalMessage!.metadata as Record<string, unknown>).approvalCard as Record<string, unknown>;
    expect(card.memorySummary).toBe('User focuses on wellness content for Instagram.');
  });

  it('approval card has no memorySummary when memory service returns null', async () => {
    const memoryService = new ProjectMemoryService(createFakeMemoryRepo(null));
    const projectRepo = createFakeProjectRepository([makeProject()]);
    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo, undefined, memoryService);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Create a post',
    });

    const card = (result.approvalMessage!.metadata as Record<string, unknown>).approvalCard as Record<string, unknown>;
    expect(card.memorySummary).toBeUndefined();
  });

  it('memorySummary is absent when no memory service is provided', async () => {
    const projectRepo = createFakeProjectRepository([makeProject()]);
    const chatRepo = createFakeChatRepository();
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.appendUserMessage(ctx, 'proj-1', {
      content: 'Create a post',
    });

    const card = (result.approvalMessage!.metadata as Record<string, unknown>).approvalCard as Record<string, unknown>;
    expect(card.memorySummary).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AI provider chat path (real provider injection)
// ---------------------------------------------------------------------------

function makeConversationProject(): ProjectRow {
  return makeProject({ id: 'proj-chat', workspace_id: 'ws-chat' });
}

function makeRealProvider(reply: string): AIProvider {
  return {
    name: 'gemini' as const,
    async planText() { throw new Error('not used'); },
    async generateImageOrDocument() { throw new Error('not used'); },
    async chat() { return { reply }; },
    async enhancePrompt() { throw new Error('not used'); },
  };
}

function makeFailingProvider(): AIProvider {
  return {
    name: 'gemini' as const,
    async planText() { throw new Error('not used'); },
    async generateImageOrDocument() { throw new Error('not used'); },
    async chat() {
      throw new AIProviderError({
        code: 'PROVIDER_HTTP_ERROR',
        provider: 'gemini',
        message: 'Gemini returned HTTP 502',
        retryable: true,
      });
    },
    async enhancePrompt() { throw new Error('not used'); },
  };
}

describe('ChatService — real AI provider chat path', () => {
  it('stores AI reply as assistant message when provider succeeds', async () => {
    const projectRepo = createFakeProjectRepository([makeConversationProject()]);
    const chatRepo = createFakeChatRepository();
    const provider = makeRealProvider('Great idea! Tell me more about the visual style you want.');
    const service = new ChatService(chatRepo, projectRepo, undefined, undefined, undefined, provider);
    const ctx = fakeAuthContext('ws-chat');

    const result = await service.appendUserMessage(ctx, 'proj-chat', { content: 'Hello, help me brainstorm' });

    // Conversation mode with provider returns an approvalMessage which is the assistant reply
    expect(result.approvalMessage).toBeTruthy();
    expect(result.approvalMessage!.role).toBe('assistant');
    expect(result.approvalMessage!.content).toBe('Great idea! Tell me more about the visual style you want.');
  });

  it('stores CHAT_UNAVAILABLE_MESSAGE when provider throws AIProviderError', async () => {
    const projectRepo = createFakeProjectRepository([makeConversationProject()]);
    const chatRepo = createFakeChatRepository();
    const provider = makeFailingProvider();
    const service = new ChatService(chatRepo, projectRepo, undefined, undefined, undefined, provider);
    const ctx = fakeAuthContext('ws-chat');

    const result = await service.appendUserMessage(ctx, 'proj-chat', { content: 'Hello' });

    expect(result.approvalMessage!.role).toBe('assistant');
    expect(result.approvalMessage!.content).toContain('temporarily unavailable');
  });

  it('does not create generation jobs when provider responds to conversation', async () => {
    const projectRepo = createFakeProjectRepository([makeConversationProject()]);
    const chatRepo = createFakeChatRepository();
    const provider = makeRealProvider('Sure, what would you like to create?');
    const service = new ChatService(chatRepo, projectRepo, undefined, undefined, undefined, provider);
    const ctx = fakeAuthContext('ws-chat');

    const result = await service.appendUserMessage(ctx, 'proj-chat', { content: 'Hello' });

    // No job was created — only user + assistant messages in conversation mode
    expect(result.intent.mode).toBe('conversation');
    // approvalMessage is the AI reply, not an approval card
    const metadata = result.approvalMessage?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.approvalCard).toBeUndefined();
  });

  it('does not attempt AI chat without provider injected', async () => {
    const projectRepo = createFakeProjectRepository([makeConversationProject()]);
    const chatRepo = createFakeChatRepository();
    // No provider — conversation mode returns without assistant message
    const service = new ChatService(chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-chat');

    const result = await service.appendUserMessage(ctx, 'proj-chat', { content: 'Hello' });

    expect(result.intent.mode).toBe('conversation');
    expect(result.approvalMessage).toBeUndefined();
  });
});
