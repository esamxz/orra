import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import generationRoutes from '../routes/generation.js';
import type { Repositories } from '../repositories/types.js';
import type { ProjectRow, ChatThreadRow, ChatMessageRow, GenerationJobRow } from '@orra/db';
import type { CreateProjectInput, FindProjectInput, UpdateProjectInput, DeleteProjectInput } from '../repositories/projectRepository.js';

const fakeVerifier = createFakeVerifier();

interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

function createFakeRepositories(
  initialProjects: ProjectRow[] = [],
  initialThreads: ChatThreadRow[] = [],
  initialMessages: ChatMessageRow[] = [],
  initialJobs: GenerationJobRow[] = []
): Repositories {
  const projects = [...initialProjects];
  const threads = [...initialThreads];
  const messages = [...initialMessages];
  const jobs = [...initialJobs];
  let nextThreadId = 1;
  let nextMessageId = 1;
  let nextJobId = 1;

  return {
    user: {
      findByClerkId: async () => null,
      createFromClerkIdentity: async () => ({
        id: 'user-fake-1',
        clerk_id: 'usr_test_fake',
        email: 'test@orra.local',
        display_name: 'Test User',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
    },
    workspace: {
      findPersonalWorkspaceForUser: async () => null,
      createPersonalWorkspace: async () => ({
        id: 'ws-fake-1',
        name: "Test User's Workspace",
        type: 'personal',
        owner_user_id: 'user-fake-1',
        plan: 'free',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
      ensurePersonalWorkspaceForUser: async () => ({
        workspaceId: 'ws-fake-1',
        role: 'owner',
      }),
    },
    project: {
      async create(input: CreateProjectInput) {
        const project: ProjectRow = {
          id: `proj-${Date.now()}`,
          workspace_id: input.workspaceId,
          name: input.name,
          type: input.type,
          ratio: input.ratio as ProjectRow['ratio'],
          brand_system_id: input.brandSystemId ?? null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
        projects.push(project);
        return project;
      },
      async listByWorkspace() {
        return [];
      },
      async findByIdForWorkspace(input: FindProjectInput) {
        return (
          projects.find((p) => p.id === input.id && p.workspace_id === input.workspaceId) ?? null
        );
      },
      async updateForWorkspace(input: UpdateProjectInput) {
        const idx = projects.findIndex(
          (p) => p.id === input.id && p.workspace_id === input.workspaceId
        );
        if (idx === -1) return null;
        projects[idx] = { ...projects[idx], ...input.updates };
        return projects[idx];
      },
      async deleteForWorkspace(input: DeleteProjectInput) {
        const idx = projects.findIndex(
          (p) => p.id === input.id && p.workspace_id === input.workspaceId
        );
        if (idx !== -1) projects.splice(idx, 1);
      },
    },
    artifact: {
      async createArtifactForProject() {
        throw new Error('not used');
      },
      async createVersion() {
        throw new Error('not used');
      },
      async setCurrentVersion() {
        throw new Error('not used');
      },
      async setCurrentVersionGuarded() {
        return null;
      },
      async commitVersion() {
        return null;
      },
      async getArtifactByIdForWorkspace() {
        return null;
      },
      async getArtifactByProjectIdForWorkspace() {
        return null;
      },
      async getCurrentVersion() {
        return null;
      },
    },
    chat: {
      async ensureThreadForProject(input: { workspaceId: string; projectId: string }) {
        const existing = threads.find(
          (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
        );
        if (existing) return existing;

        const thread: ChatThreadRow = {
          id: `thread-${nextThreadId++}`,
          workspace_id: input.workspaceId,
          project_id: input.projectId,
          title: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
        threads.push(thread);
        return thread;
      },
      async findThreadByProjectId(input: { workspaceId: string; projectId: string }) {
        return (
          threads.find(
            (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
          ) ?? null
        );
      },
      async listMessagesByThread(input: { workspaceId: string; threadId: string; limit: number }) {
        return messages
          .filter((m) => m.thread_id === input.threadId && m.workspace_id === input.workspaceId)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .slice(0, input.limit);
      },
      async appendMessage(input: {
        workspaceId: string;
        threadId: string;
        role: ChatMessageRow['role'];
        kind: ChatMessageRow['kind'];
        content: string;
        metadata?: import('@orra/db').Json;
        seq?: number;
      }) {
        const message: ChatMessageRow = {
          id: `msg-${nextMessageId++}`,
          workspace_id: input.workspaceId,
          thread_id: input.threadId,
          role: input.role,
          kind: input.kind,
          content: input.content,
          metadata: input.metadata ?? ({} as import('@orra/db').Json),
          seq: input.seq ?? null,
          created_at: new Date().toISOString(),
        };
        messages.push(message);
        return message;
      },

      async findMessageByIdForProject(input: { workspaceId: string; projectId: string; messageId: string }) {
        const thread = threads.find(
          (t) => t.project_id === input.projectId && t.workspace_id === input.workspaceId
        );
        if (!thread) return null;
        return messages.find((m) => m.id === input.messageId && m.thread_id === thread.id) ?? null;
      },

      async updateMessageMetadata(input: { workspaceId: string; messageId: string; metadata: import('@orra/db').Json }) {
        const idx = messages.findIndex(
          (m) => m.id === input.messageId && m.workspace_id === input.workspaceId
        );
        if (idx === -1) throw new Error('Message not found');
        messages[idx] = { ...messages[idx], metadata: input.metadata };
        return messages[idx];
      },
    },
    generationJob: {
      async createStubJob(input: { workspaceId: string; projectId: string; kind: GenerationJobRow['kind']; status: GenerationJobRow['status']; idempotencyKey?: string | null; reservedCredits?: number; capturedCredits?: number; plan?: import('@orra/db').Json }) {
        const job: GenerationJobRow = {
          id: `job-${nextJobId++}`,
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
      async findByIdForWorkspace(input: { id: string; workspaceId: string }) {
        return jobs.find((j) => j.id === input.id && j.workspace_id === input.workspaceId) ?? null;
      },
      async listByProject() {
        return [];
      },
      async findById(id: string) {
        return jobs.find((j) => j.id === id) ?? null;
      },
      async markRunningGuarded(id: string) {
        const job = jobs.find((j) => j.id === id && j.status === 'queued');
        if (!job) return null;
        job.status = 'running';
        job.updated_at = new Date().toISOString();
        return job;
      },
      async markSucceededGuarded(id: string) {
        const job = jobs.find((j) => j.id === id && j.status === 'running');
        if (!job) return null;
        job.status = 'succeeded';
        job.updated_at = new Date().toISOString();
        return job;
      },
      async markFailedGuarded(id: string, errorPayload: import('@orra/db').Json) {
        const job = jobs.find((j) => j.id === id && (j.status === 'queued' || j.status === 'running'));
        if (!job) return null;
        job.status = 'failed';
        job.error = errorPayload as GenerationJobRow['error'];
        job.updated_at = new Date().toISOString();
        return job;
      },
    },
  } as unknown as Repositories;
}

function buildApp(repositories?: Repositories) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(
    createAuthMiddleware(fakeVerifier, repositories ? { repositories } : undefined)
  );
  app.route('/v1', generationRoutes);
  app.onError(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// POST /v1/generate
// ---------------------------------------------------------------------------

describe('POST /v1/generate', () => {
  async function setupWithApprovedMessage() {
    const repos = createFakeRepositories(
      [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          name: 'Project One',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      [
        {
          id: 'thread-1',
          workspace_id: 'ws-fake-1',
          project_id: '11111111-1111-1111-1111-111111111111',
          title: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      [
        {
          id: '22222222-2222-2222-2222-222222222222',
          workspace_id: 'ws-fake-1',
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
        },
      ]
    );

    const app = buildApp(repos);
    return { app, repos };
  }

  it('requires authentication', async () => {
    const app = (await setupWithApprovedMessage()).app;
    const res = await app.request(
      '/v1/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: '11111111-1111-1111-1111-111111111111',
          approvalMessageId: '22222222-2222-2222-2222-222222222222',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });

  it('creates a queued stub job', async () => {
    const { app } = await setupWithApprovedMessage();
    const fakeQueue = {
      async send(_msg: { jobId: string }) {
        /* noop */
      },
    };
    const res = await app.request(
      '/v1/generate',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: '11111111-1111-1111-1111-111111111111',
          approvalMessageId: '22222222-2222-2222-2222-222222222222',
        }),
      },
      { ENVIRONMENT: 'production', GENERATION_QUEUE: fakeQueue } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as { id: string; status: string; kind: string; projectId: string };
    expect(data.status).toBe('queued');
    expect(data.kind).toBe('full_generate');
    expect(data.projectId).toBe('11111111-1111-1111-1111-111111111111');
    expect(data.id).toBeTruthy();
  });

  it('rejects invalid body', async () => {
    const { app } = await setupWithApprovedMessage();
    const res = await app.request(
      '/v1/generate',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: 'not-a-uuid',
          approvalMessageId: '22222222-2222-2222-2222-222222222222',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('rejects pending approval', async () => {
    const repos = createFakeRepositories(
      [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          name: 'Project One',
          type: 'post',
          ratio: { name: '4:5', w: 1080, h: 1350 },
          brand_system_id: null,
          source_template_id: null,
          autosave_state: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      [
        {
          id: 'thread-1',
          workspace_id: 'ws-fake-1',
          project_id: '11111111-1111-1111-1111-111111111111',
          title: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      [
        {
          id: '22222222-2222-2222-2222-222222222222',
          workspace_id: 'ws-fake-1',
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
        },
      ]
    );

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/generate',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: '11111111-1111-1111-1111-111111111111',
          approvalMessageId: '22222222-2222-2222-2222-222222222222',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(409);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('CONFLICT');
  });

  it('enqueues { jobId } when GENERATION_QUEUE is bound', async () => {
    const { app } = await setupWithApprovedMessage();
    const sent: Array<{ jobId: string }> = [];
    const fakeQueue = {
      async send(msg: { jobId: string }) {
        sent.push(msg);
      },
    };
    const res = await app.request(
      '/v1/generate',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: '11111111-1111-1111-1111-111111111111',
          approvalMessageId: '22222222-2222-2222-2222-222222222222',
        }),
      },
      { ENVIRONMENT: 'production', GENERATION_QUEUE: fakeQueue } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    expect(sent).toHaveLength(1);
    const json = (await res.json()) as ApiResponse;
    expect(sent[0].jobId).toBe((json.data as { id: string }).id);
  });

  it('returns PROVIDER_FAILURE when GENERATION_QUEUE is missing in production', async () => {
    const { app } = await setupWithApprovedMessage();
    const res = await app.request(
      '/v1/generate',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: '11111111-1111-1111-1111-111111111111',
          approvalMessageId: '22222222-2222-2222-2222-222222222222',
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(502);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('PROVIDER_FAILURE');
  });

  it('returns PROVIDER_FAILURE when queue send fails', async () => {
    const { app } = await setupWithApprovedMessage();
    const failingQueue = {
      async send() {
        throw new Error('Queue overloaded');
      },
    };
    const res = await app.request(
      '/v1/generate',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: '11111111-1111-1111-1111-111111111111',
          approvalMessageId: '22222222-2222-2222-2222-222222222222',
        }),
      },
      { ENVIRONMENT: 'production', GENERATION_QUEUE: failingQueue } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(502);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('PROVIDER_FAILURE');
  });

  it('allows missing queue in development when DEV_GENERATION_QUEUE_DISABLED=true', async () => {
    const { app } = await setupWithApprovedMessage();
    const res = await app.request(
      '/v1/generate',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: '11111111-1111-1111-1111-111111111111',
          approvalMessageId: '22222222-2222-2222-2222-222222222222',
        }),
      },
      {
        ENVIRONMENT: 'development',
        DEV_GENERATION_QUEUE_DISABLED: 'true',
      } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { status: string }).status).toBe('queued');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/jobs/:id
// ---------------------------------------------------------------------------

describe('GET /v1/jobs/:id', () => {
  it('requires authentication', async () => {
    const app = buildApp();
    const res = await app.request(
      '/v1/jobs/11111111-1111-1111-1111-111111111111',
      { method: 'GET' },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });

  it('returns a job scoped to workspace', async () => {
    const repos = createFakeRepositories(
      [], [], [],
      [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          project_id: 'proj-1',
          kind: 'full_generate',
          status: 'queued',
          idempotency_key: null,
          reserved_credits: 0,
          captured_credits: 0,
          plan: null,
          error: null,
          result_version_id: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]
    );

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/jobs/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as { id: string; status: string };
    expect(data.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(data.status).toBe('queued');
  });

  it('returns NOT_FOUND for job in another workspace', async () => {
    const repos = createFakeRepositories(
      [], [], [],
      [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-other',
          project_id: 'proj-1',
          kind: 'full_generate',
          status: 'queued',
          idempotency_key: null,
          reserved_credits: 0,
          captured_credits: 0,
          plan: null,
          error: null,
          result_version_id: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]
    );

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/jobs/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });
});
