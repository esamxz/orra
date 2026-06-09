import { describe, it, expect } from 'vitest';
import { GenerationService } from '../services/generationService.js';
import { CreditService } from '../services/creditService.js';
import { ApiError } from '../errors.js';
import type { GenerationJobRepository } from '../repositories/generationJobRepository.js';
import type { ChatRepository } from '../repositories/chatRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { CreditRepository } from '../repositories/creditRepository.js';
import type { GenerationJobRow, ChatMessageRow, ChatThreadRow, ProjectRow, CreditBalanceRow, CreditLedgerRow, Json } from '@orra/db';

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
    async markSucceededWithResultGuarded(id, resultVersionId, capturedCredits = 0) {
      const job = jobs.find((j) => j.id === id && j.status === 'running');
      if (!job) return null;
      job.status = 'succeeded';
      job.result_version_id = resultVersionId;
      job.captured_credits = capturedCredits;
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

function createFakeCreditRepository(
  initialBalances: CreditBalanceRow[] = [],
  initialLedger: CreditLedgerRow[] = []
): CreditRepository & { balances: CreditBalanceRow[]; ledger: CreditLedgerRow[] } {
  let nextId = 1;
  const balances = [...initialBalances];
  const ledger = [...initialLedger];

  return {
    balances,
    ledger,
    async getBalanceForWorkspace(workspaceId: string) {
      return balances.find((b) => b.workspace_id === workspaceId) ?? null;
    },

    async listLedgerForWorkspace(input) {
      const rows = ledger.filter((l) => l.workspace_id === input.workspaceId);
      const limit = input.limit ?? 50;
      return rows.slice(-limit).reverse();
    },

    async grantCredits(input) {
      const id = `grant-${nextId++}`;
      ledger.push({
        id,
        workspace_id: input.workspaceId,
        entry_type: 'grant',
        bucket: input.bucket,
        amount: input.amount,
        job_id: null,
        expires_at: null,
        metadata: (input.metadata ?? {}) as Json,
        created_at: new Date().toISOString(),
      });

      let bal = balances.find((b) => b.workspace_id === input.workspaceId);
      if (!bal) {
        bal = {
          workspace_id: input.workspaceId,
          subscription_available: 0,
          topup_available: 0,
          reserved: 0,
          updated_at: new Date().toISOString(),
        };
        balances.push(bal);
      }
      if (input.bucket === 'subscription') {
        bal.subscription_available += input.amount;
      } else {
        bal.topup_available += input.amount;
      }
      bal.updated_at = new Date().toISOString();
      return { ledgerId: id };
    },

    async reserveCredits(input) {
      const bal = balances.find((b) => b.workspace_id === input.workspaceId);
      const available = (bal?.subscription_available ?? 0) + (bal?.topup_available ?? 0);
      if (!bal || available < input.amount) {
        throw new Error('Insufficient credits');
      }
      const subNeeded = Math.min(bal.subscription_available, input.amount);
      const topupNeeded = input.amount - subNeeded;
      if (subNeeded > 0) {
        ledger.push({
          id: `res-${nextId++}`,
          workspace_id: input.workspaceId,
          entry_type: 'reserve',
          bucket: 'subscription',
          amount: -subNeeded,
          job_id: input.jobId,
          expires_at: null,
          metadata: (input.metadata ?? {}) as Json,
          created_at: new Date().toISOString(),
        });
      }
      if (topupNeeded > 0) {
        ledger.push({
          id: `res-${nextId++}`,
          workspace_id: input.workspaceId,
          entry_type: 'reserve',
          bucket: 'topup',
          amount: -topupNeeded,
          job_id: input.jobId,
          expires_at: null,
          metadata: (input.metadata ?? {}) as Json,
          created_at: new Date().toISOString(),
        });
      }
      bal.subscription_available -= subNeeded;
      bal.topup_available -= topupNeeded;
      bal.reserved += input.amount;
      bal.updated_at = new Date().toISOString();
      return { reservedAmount: input.amount };
    },

    async captureCredits(input) {
      const bal = balances.find((b) => b.workspace_id === input.workspaceId);
      const reserves = ledger.filter(
        (l) =>
          l.workspace_id === input.workspaceId &&
          l.job_id === input.jobId &&
          l.entry_type === 'reserve'
      );
      const totalReserved = reserves.reduce((s, r) => s + Math.abs(r.amount), 0);
      if (totalReserved === 0) {
        throw new Error('No reservation found for job');
      }
      const refund = totalReserved - input.actualAmount;
      ledger.push({
        id: `cap-${nextId++}`,
        workspace_id: input.workspaceId,
        entry_type: 'capture',
        bucket: 'subscription',
        amount: -input.actualAmount,
        job_id: input.jobId,
        expires_at: null,
        metadata: (input.metadata ?? {}) as Json,
        created_at: new Date().toISOString(),
      });
      if (refund > 0) {
        ledger.push({
          id: `ref-${nextId++}`,
          workspace_id: input.workspaceId,
          entry_type: 'refund',
          bucket: 'subscription',
          amount: refund,
          job_id: input.jobId,
          expires_at: null,
          metadata: (input.metadata ?? {}) as Json,
          created_at: new Date().toISOString(),
        });
      }
      if (bal) {
        bal.reserved = Math.max(0, bal.reserved - totalReserved);
        bal.subscription_available += refund;
        bal.updated_at = new Date().toISOString();
      }
      return { captured: input.actualAmount, refunded: refund };
    },

    async refundCredits(input) {
      const bal = balances.find((b) => b.workspace_id === input.workspaceId);
      const reserves = ledger.filter(
        (l) =>
          l.workspace_id === input.workspaceId &&
          l.job_id === input.jobId &&
          l.entry_type === 'reserve'
      );
      const totalReserved = reserves.reduce((s, r) => s + Math.abs(r.amount), 0);
      if (totalReserved === 0) {
        throw new Error('No reservation found for job');
      }
      ledger.push({
        id: `ref-${nextId++}`,
        workspace_id: input.workspaceId,
        entry_type: 'refund',
        bucket: 'subscription',
        amount: totalReserved,
        job_id: input.jobId,
        expires_at: null,
        metadata: (input.metadata ?? {}) as Json,
        created_at: new Date().toISOString(),
      });
      if (bal) {
        bal.reserved = Math.max(0, bal.reserved - totalReserved);
        bal.subscription_available += totalReserved;
        bal.updated_at = new Date().toISOString();
      }
      return { refunded: totalReserved };
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
      createFakeProjectRepository(),
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]))
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
      projectRepo,
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]))
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
      projectRepo,
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]))
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow(ApiError);
    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow('approved');
  });

  it('rejects cancelled approval', async () => {
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
        approvalState: { status: 'cancelled', updatedAt: '2026-01-01T00:00:00Z' },
      } as unknown as import('@orra/db').Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      createFakeGenerationJobRepository(),
      chatRepo,
      projectRepo,
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]))
    );
    const ctx = fakeAuthContext('ws-1');

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
      projectRepo,
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]))
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

    const fakeQueue = {
      async send(_msg: { jobId: string }) {
        /* noop */
      },
    };

    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ])),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
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

  it('stores estimated reserved credits and captured credits as 0', async () => {
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

    const fakeQueue = {
      async send(_msg: { jobId: string }) {
        /* noop */
      },
    };

    const creditRepo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 20,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]);
    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(creditRepo),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });

    const row = await jobRepo.findByIdForWorkspace({ id: result.id, workspaceId: 'ws-1' });
    expect(row).not.toBeNull();
    expect(row!.reserved_credits).toBe(10);
    expect(row!.captured_credits).toBe(0);
    expect(creditRepo.balances[0].reserved).toBe(10);
    expect(creditRepo.balances[0].subscription_available).toBe(10);
    expect(creditRepo.ledger.some((l) => l.entry_type === 'reserve')).toBe(true);
  });

  it('getJob returns scoped job', async () => {
    const jobRepo = createFakeGenerationJobRepository();
    const row = await jobRepo.createStubJob({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      kind: 'full_generate',
      status: 'queued',
    });

    const service = new GenerationService(jobRepo, createFakeChatRepository(), createFakeProjectRepository(), new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ])));
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

    const service = new GenerationService(jobRepo, createFakeChatRepository(), createFakeProjectRepository(), new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ])));
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

    const fakeQueue = {
      async send(_msg: { jobId: string }) {
        /* noop */
      },
    };

    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ])),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
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
    const service = new GenerationService(jobRepo, chatRepo, projectRepo, new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ])), {
      GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
    } as unknown as import('../env.js').Env);
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toEqual({ jobId: result.id });
  });

  it('fails safely when GENERATION_QUEUE is missing in production', async () => {
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
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ])),
      { ENVIRONMENT: 'production' } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof ApiError)) return false;
      return err.code === 'PROVIDER_FAILURE' && err.message.includes('unavailable');
    });

    const jobs = await jobRepo.listByProject({ workspaceId: 'ws-1', projectId: 'proj-1' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('failed');
  });

  it('fails safely when GENERATION_QUEUE is missing in development without bypass', async () => {
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
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ])),
      { ENVIRONMENT: 'development' } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow(ApiError);

    const jobs = await jobRepo.listByProject({ workspaceId: 'ws-1', projectId: 'proj-1' });
    expect(jobs[0].status).toBe('failed');
  });

  it('allows missing GENERATION_QUEUE in development when DEV_GENERATION_QUEUE_DISABLED=true', async () => {
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
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ])),
      {
        ENVIRONMENT: 'development',
        DEV_GENERATION_QUEUE_DISABLED: 'true',
      } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });
    expect(result.status).toBe('queued');

    const jobs = await jobRepo.listByProject({ workspaceId: 'ws-1', projectId: 'proj-1' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('queued');
  });

  it('marks job failed and throws when queue send fails', async () => {
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

    const failingQueue = {
      async send() {
        throw new Error('Queue service unreachable');
      },
    };

    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const creditRepo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(creditRepo),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: failingQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow(ApiError);
    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow('marked failed');

    const jobs = await jobRepo.listByProject({ workspaceId: 'ws-1', projectId: 'proj-1' });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.status === 'failed')).toBe(true);
    expect(jobs.every((j) => (j.error as Record<string, unknown> | null)?.code === 'QUEUE_SEND_FAILED')).toBe(true);

    expect(creditRepo.balances[0].reserved).toBe(0);
    expect(creditRepo.balances[0].subscription_available).toBe(50);
    expect(creditRepo.ledger.filter((l) => l.entry_type === 'reserve')).toHaveLength(2);
    expect(creditRepo.ledger.filter((l) => l.entry_type === 'refund')).toHaveLength(2);
  });

  it('reserves credits before enqueue for approved post', async () => {
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

    const creditRepo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]);
    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(creditRepo),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });

    expect(result.reservedCredits).toBe(10);
    expect(result.capturedCredits).toBe(0);
    expect(sentMessages).toHaveLength(1);
    expect(creditRepo.balances[0].reserved).toBe(10);
    expect(creditRepo.ledger.filter((l) => l.entry_type === 'reserve')).toHaveLength(1);
  });

  it('does not enqueue when credit reservation fails', async () => {
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

    const creditRepo = createFakeCreditRepository(); // no balance
    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(creditRepo),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow(ApiError);
    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow('credits');

    expect(sentMessages).toHaveLength(0);
    const jobs = await jobRepo.listByProject({ workspaceId: 'ws-1', projectId: 'proj-1' });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.status === 'failed')).toBe(true);
    expect(jobs.every((j) => (j.error as Record<string, unknown> | null)?.code === 'INSUFFICIENT_CREDITS')).toBe(true);
  });

  it('returns INSUFFICIENT_CREDITS when balance too low', async () => {
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

    const creditRepo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 5,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]);
    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(creditRepo),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: { async send() {} } as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof ApiError)) return false;
      return err.code === 'INSUFFICIENT_CREDITS';
    });

    const jobs = await jobRepo.listByProject({ workspaceId: 'ws-1', projectId: 'proj-1' });
    expect(jobs[0].error).toEqual({
      code: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits to reserve for this job.',
    });
  });

  it('does not reserve credits for pending approval', async () => {
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
        approvalState: { status: 'pending', updatedAt: '2026-01-01T00:00:00Z' },
      } as unknown as import('@orra/db').Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const creditRepo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 50,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]);
    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(creditRepo),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: { async send() {} } as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' })
    ).rejects.toThrow('approved');

    expect(creditRepo.balances[0].reserved).toBe(0);
    expect(creditRepo.ledger).toHaveLength(0);
    const jobs = await jobRepo.listByProject({ workspaceId: 'ws-1', projectId: 'proj-1' });
    expect(jobs).toHaveLength(0);
  });

  it('no-brand project can reserve and enqueue', async () => {
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

    const fakeQueue = {
      async send(_msg: { jobId: string }) {
        /* noop */
      },
    };

    const creditRepo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 20,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]);
    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(creditRepo),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });

    expect(result.reservedCredits).toBe(10);
    expect(result.capturedCredits).toBe(0);
    expect(creditRepo.balances[0].reserved).toBe(10);
  });

  it('does not call capture on createStubGenerationJob', async () => {
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

    const fakeQueue = {
      async send(_msg: { jobId: string }) {
        /* noop */
      },
    };

    const creditRepo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 20,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]);
    const jobRepo = createFakeGenerationJobRepository();
    const chatRepo = createFakeChatRepository([thread], [message]);
    const service = new GenerationService(
      jobRepo,
      chatRepo,
      projectRepo,
      new CreditService(creditRepo),
      {
        ENVIRONMENT: 'production',
        GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
      } as unknown as import('../env.js').Env
    );
    const ctx = fakeAuthContext('ws-1');

    await service.createStubGenerationJob(ctx, { projectId: 'proj-1', approvalMessageId: 'msg-1' });

    expect(creditRepo.ledger.some((l) => l.entry_type === 'capture')).toBe(false);
  });
});
