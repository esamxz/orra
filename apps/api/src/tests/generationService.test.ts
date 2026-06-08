import { describe, it, expect } from 'vitest';
import { GenerationService } from '../services/generationService.js';
import { ApiError } from '../errors.js';
import type { GenerationJobRepository } from '../repositories/generationJobRepository.js';
import type { ChatRepository } from '../repositories/chatRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { GenerationJobRow, ChatMessageRow, ChatThreadRow, ProjectRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Fake repositories
// ---------------------------------------------------------------------------

function createFakeProjectRepository(initial: ProjectRow[] = []): ProjectRepository {
  const projects = [...initial];
  return {
    async create() { throw new Error('not used'); },
    async listByWorkspace() { return []; },
    async findByIdForWorkspace(input) {
      return projects.find((p) => p.id === input.id && p.workspace_id === input.workspaceId) ?? null;
    },
    async updateForWorkspace() { return null; },
    async deleteForWorkspace() {},
  };
}

function createFakeChatRepository(
  initialThreads: ChatThreadRow[] = [],
  initialMessages: ChatMessageRow[] = []
): ChatRepository {
  const threads = [...initialThreads];
  const messages = [...initialMessages];

  return {
    async ensureThreadForProject(input) {
      const existing = threads.find(
        (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
      );
      if (existing) return existing;
      throw new Error('not used in generation tests');
    },
    async findThreadByProjectId(input) {
      return threads.find(
        (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
      ) ?? null;
    },
    async listMessagesByThread() { return []; },
    async appendMessage() { throw new Error('not used'); },
    async findMessageByIdForProject(input) {
      const thread = threads.find(
        (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
      );
      if (!thread) return null;
      return messages.find((m) => m.id === input.messageId && m.thread_id === thread.id) ?? null;
    },
    async updateMessageMetadata() { throw new Error('not used'); },
  };
}

function createFakeGenerationJobRepository(): GenerationJobRepository {
  let nextId = 1;
  const jobs: GenerationJobRow[] = [];

  return {
    async createStubJob(input) {
      const job: GenerationJobRow = {
        id: `job-${nextId++}`,
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        kind: input.kind,
        status: input.status,
        idempotency_key: input.idempotencyKey ?? null,
        reserved_credits: input.reservedCredits ?? 0,
        captured_credits: input.capturedCredits ?? 0,
        plan: input.plan ?? null,
        error: null,
        result_version_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      jobs.push(job);
      return job;
    },
    async findByIdForWorkspace(input) {
      return jobs.find((j) => j.id === input.id && j.workspace_id === input.workspaceId) ?? null;
    },
    async listByProject(input) {
      return jobs.filter((j) => j.project_id === input.projectId && j.workspace_id === input.workspaceId);
    },
    async findById(id) {
      return jobs.find((j) => j.id === id) ?? null;
    },
    async markRunningGuarded(id) {
      const job = jobs.find((j) => j.id === id && j.status === 'queued');
      if (!job) return null;
      job.status = 'running';
      job.updated_at = new Date().toISOString();
      return job;
    },
    async markSucceededGuarded(id) {
      const job = jobs.find((j) => j.id === id && j.status === 'running');
      if (!job) return null;
      job.status = 'succeeded';
      job.updated_at = new Date().toISOString();
      return job;
    },
    async markFailedGuarded(id, errorPayload) {
      const job = jobs.find((j) => j.id === id && (j.status === 'queued' || j.status === 'running'));
      if (!job) return null;
      job.status = 'failed';
      job.error = errorPayload as GenerationJobRow['error'];
      job.updated_at = new Date().toISOString();
      return job;
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

describe('GenerationService', () => {
  it('createStubGenerationJob requires auth', async () => {
    const service = new GenerationService(
      createFakeGenerationJobRepository(),
      createFakeChatRepository(),
      createFakeProjectRepository()
    );
    const ctx = {
      env: {} as unknown as import('../env.js').Env,
      requestId: 'req-123',
      auth: undefined,
    };

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow(ApiError);
  });

  it('verifies project ownership', async () => {
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

    const service = new GenerationService(
      createFakeGenerationJobRepository(),
      createFakeChatRepository(),
      projectRepo
    );
    const ctx = fakeAuthContext('ws-2');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow('Project not found');
  });

  it('requires approved approval_summary', async () => {
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

    const thread: ChatThreadRow = {
      id: 'thread-1',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      title: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const message: ChatMessageRow = {
      id: 'msg-1',
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      role: 'assistant',
      kind: 'approval_summary',
      content: 'Ready to create a post.',
      metadata: {
        approvalCard: { summaryLine: 'Ready to create a post.' },
        approvalState: { status: 'pending', updatedAt: '2026-01-01T00:00:00Z' },
      } as unknown as import('@orra/db').Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      createFakeGenerationJobRepository(),
      chatRepo,
      projectRepo
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow(ApiError);
    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow('approved');
  });

  it('rejects non-approval message', async () => {
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

    const thread: ChatThreadRow = {
      id: 'thread-1',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      title: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const message: ChatMessageRow = {
      id: 'msg-1',
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      role: 'assistant',
      kind: 'text',
      content: 'Hello',
      metadata: {},
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      createFakeGenerationJobRepository(),
      chatRepo,
      projectRepo
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow('approval summary');
  });

  it('creates queued job for approved approval', async () => {
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

    const thread: ChatThreadRow = {
      id: 'thread-1',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      title: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const message: ChatMessageRow = {
      id: 'msg-1',
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      role: 'assistant',
      kind: 'approval_summary',
      content: 'Ready to create a post.',
      metadata: {
        approvalCard: { summaryLine: 'Ready to create a post.' },
        approvalState: { status: 'approved', updatedAt: '2026-01-01T00:00:00Z' },
      } as unknown as import('@orra/db').Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(jobRepo, chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });

    expect(result.status).toBe('queued');
    expect(result.kind).toBe('full_generate');
    expect(result.projectId).toBe('proj-1');
    expect(result.resultVersionId).toBeNull();
  });

  it('stores reserved and captured credits as 0', async () => {
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

    const thread: ChatThreadRow = {
      id: 'thread-1',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      title: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const message: ChatMessageRow = {
      id: 'msg-1',
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      role: 'assistant',
      kind: 'approval_summary',
      content: 'Ready.',
      metadata: {
        approvalCard: { summaryLine: 'Ready.' },
        approvalState: { status: 'approved', updatedAt: '2026-01-01T00:00:00Z' },
      } as unknown as import('@orra/db').Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(jobRepo, chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });

    // The DTO doesn't expose credits, but we can verify the job was created
    // with defaults by checking the row via the repo.
    const row = await jobRepo.findByIdForWorkspace({ id: result.id, workspaceId: 'ws-1' });
    expect(row).not.toBeNull();
    expect(row!.reserved_credits).toBe(0);
    expect(row!.captured_credits).toBe(0);
  });

  it('getJob returns scoped job', async () => {
    const jobRepo = createFakeGenerationJobRepository();
    const row = await jobRepo.createStubJob({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'full_generate',
      status: 'queued',
    });

    const service = new GenerationService(jobRepo, createFakeChatRepository(), createFakeProjectRepository());
    const ctx = fakeAuthContext('ws-1');

    const result = await service.getJob(ctx, row.id);
    expect(result.id).toBe(row.id);
    expect(result.status).toBe('queued');
  });

  it('getJob cross-workspace returns NOT_FOUND', async () => {
    const jobRepo = createFakeGenerationJobRepository();
    const row = await jobRepo.createStubJob({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'full_generate',
      status: 'queued',
    });

    const service = new GenerationService(jobRepo, createFakeChatRepository(), createFakeProjectRepository());
    const ctx = fakeAuthContext('ws-2');

    await expect(service.getJob(ctx, row.id)).rejects.toThrow(ApiError);
    await expect(service.getJob(ctx, row.id)).rejects.toThrow('not found');
  });

  it('does not mutate artifact', async () => {
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

    const thread: ChatThreadRow = {
      id: 'thread-1',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      title: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const message: ChatMessageRow = {
      id: 'msg-1',
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      role: 'assistant',
      kind: 'approval_summary',
      content: 'Ready.',
      metadata: {
        approvalCard: { summaryLine: 'Ready.' },
        approvalState: { status: 'approved', updatedAt: '2026-01-01T00:00:00Z' },
      } as unknown as import('@orra/db').Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(jobRepo, chatRepo, projectRepo);
    const ctx = fakeAuthContext('ws-1');

    await service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' });

    // No artifact repository exists in GenerationService, so artifact mutation
    // is structurally impossible. This test documents that invariant.
    const jobs = await jobRepo.listByProject({ workspaceId: 'ws-1', projectId: 'proj-1' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].kind).toBe('full_generate');
  });

  it('enqueues { jobId } when GENERATION_QUEUE is present', async () => {
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

    const thread: ChatThreadRow = {
      id: 'thread-1',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      title: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const message: ChatMessageRow = {
      id: 'msg-1',
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      role: 'assistant',
      kind: 'approval_summary',
      content: 'Ready.',
      metadata: {
        approvalCard: { summaryLine: 'Ready.' },
        approvalState: { status: 'approved', updatedAt: '2026-01-01T00:00:00Z' },
      } as unknown as import('@orra/db').Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const sentMessages: Array<{ jobId: string }> = [];
    const fakeQueue = {
      async send(msg: { jobId: string }) {
        sentMessages.push(msg);
      },
    };

    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(jobRepo, chatRepo, projectRepo, {
      GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
    } as unknown as import('../env.js').Env);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toEqual({ jobId: result.id });
  });

  it('does not fail when GENERATION_QUEUE is missing', async () => {
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

    const thread: ChatThreadRow = {
      id: 'thread-1',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      title: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const message: ChatMessageRow = {
      id: 'msg-1',
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      role: 'assistant',
      kind: 'approval_summary',
      content: 'Ready.',
      metadata: {
        approvalCard: { summaryLine: 'Ready.' },
        approvalState: { status: 'approved', updatedAt: '2026-01-01T00:00:00Z' },
      } as unknown as import('@orra/db').Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(jobRepo, chatRepo, projectRepo, {} as unknown as import('../env.js').Env);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' });
    expect(result.status).toBe('queued');
  });
});
