import { describe, it, expect } from 'vitest';
import { GenerationService } from '../services/generationService.js';
import { CreditService } from '../services/creditService.js';
import { ApiError } from '../errors.js';
import type { GenerationJobRepository } from '../repositories/generationJobRepository.js';
import type { ChatRepository } from '../repositories/chatRepository.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { CreditRepository } from '../repositories/creditRepository.js';
import type { AssetRepository } from '../repositories/assetRepository.js';
import type {
  GenerationJobRow,
  ChatMessageRow,
  ChatThreadRow,
  ProjectRow,
  ProjectAssetRow,
  CreditBalanceRow,
  CreditLedgerRow,
  Json,
} from '@orra/db';

import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import type { BrandContextDto } from '@orra/shared';

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
    async listRecentMessagesForProject() { return []; },
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

function createFakeBrandSystemRepository(
  initialBrands: Array<{
    id: string;
    workspace_id: string;
    name: string;
    description?: string | null;
    tone_of_voice: string | null;
    visual_direction: string | null;
    rules: string | null;
    palette: Array<{ hex: string; role: string }>;
    typography: Record<string, unknown>;
  }> = []
): BrandSystemRepository {
  const brands: import('@orra/db').BrandSystemRow[] = initialBrands.map((b) => ({
    ...b,
    description: b.description ?? null,
    palette: b.palette as unknown as import('@orra/db').Json,
    typography: b.typography as unknown as import('@orra/db').Json,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }));

  return {
    async create(input) {
      const brand: import('@orra/db').BrandSystemRow = {
        id: `brand-${Date.now()}`,
        workspace_id: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
        tone_of_voice: input.toneOfVoice ?? null,
        visual_direction: input.visualDirection ?? null,
        rules: input.rules ?? null,
        palette: input.palette as unknown as import('@orra/db').Json,
        typography: input.typography as unknown as import('@orra/db').Json,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };
      brands.push(brand);
      return brand;
    },
    async listByWorkspace() {
      return [];
    },
    async findByIdForWorkspace(input) {
      return (
        brands.find((b) => b.id === input.id && b.workspace_id === input.workspaceId) ?? null
      ) as import('@orra/db').BrandSystemRow | null;
    },
    async updateForWorkspace() {
      return null;
    },
    async deleteForWorkspace() {},
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

function createFakeAssetRepository(initial: ProjectAssetRow[] = []): AssetRepository {
  const assets = [...initial];
  return {
    async createProjectAsset() {
      throw new Error('not used');
    },
    async createBrandAsset() {
      throw new Error('not used');
    },
    async listProjectAssets() {
      return [];
    },
    async listBrandAssets() {
      return [];
    },
    async findProjectAssetForWorkspace(input) {
      return (
        assets.find(
          (a) =>
            a.id === input.id && a.project_id === input.projectId && a.workspace_id === input.workspaceId
        ) ?? null
      );
    },
    async findBrandAssetForWorkspace() {
      return null;
    },
    async markProjectAssetUploaded() {
      return null;
    },
    async markBrandAssetUploaded() {
      return null;
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


  it('stores primarySourceAssetId and generationMode in job plan when approval references a source asset', async () => {
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
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
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
        intent: {
          mode: 'generation',
          generationHint: { artifactType: 'post', generationMode: 'edit_uploaded_image' },
        },
        primarySourceAssetId: 'asset-1',
        sourceAssetIds: ['asset-1'],
      } as unknown as Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const assetRepo = createFakeAssetRepository([
      {
        id: 'asset-1',
        workspace_id: 'ws-1',
        project_id: 'proj-1',
        kind: 'upload',
        r2_key: 'ws/ws-1/projects/proj-1/assets/asset-1/photo.png',
        content_hash: null,
        content_type: 'image/png',
        width: null,
        height: null,
        size_bytes: 1000,
        source_prompt: null,
        analysis: null,
        status: 'uploaded',
        created_at: '2026-01-01T00:00:00Z',
      } as unknown as ProjectAssetRow,
    ]);

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
      } as unknown as import('../env.js').Env,
      undefined,
      assetRepo
    );
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });

    const row = await jobRepo.findByIdForWorkspace({ id: result.id, workspaceId: 'ws-1' });
    expect(row).not.toBeNull();
    const plan = row!.plan as Record<string, unknown>;
    expect(plan.primarySourceAssetId).toBe('asset-1');
    expect(plan.sourceAssetIds).toEqual(['asset-1']);
    expect(plan.generationMode).toBe('edit_uploaded_image');
  });

  it('rejects generation job when primary source asset is missing', async () => {
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
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
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
        intent: {
          mode: 'generation',
          generationHint: { artifactType: 'post', generationMode: 'edit_uploaded_image' },
        },
        primarySourceAssetId: 'asset-missing',
      } as unknown as Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const assetRepo = createFakeAssetRepository([]);
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
      undefined,
      undefined,
      assetRepo
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, {
        projectId: 'proj-1',
        approvalMessageId: 'msg-1',
      })
    ).rejects.toThrow(ApiError);
  });

  it('rejects generation job when source asset belongs to another project', async () => {
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
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
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
        intent: {
          mode: 'generation',
          generationHint: { artifactType: 'post', generationMode: 'edit_uploaded_image' },
        },
        primarySourceAssetId: 'asset-2',
      } as unknown as Json,
      seq: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const assetRepo = createFakeAssetRepository([
      {
        id: 'asset-2',
        workspace_id: 'ws-1',
        project_id: 'proj-2',
        kind: 'upload',
        r2_key: 'ws/ws-1/projects/proj-2/assets/asset-2/photo.png',
        content_hash: null,
        content_type: 'image/png',
        width: null,
        height: null,
        size_bytes: 1000,
        source_prompt: null,
        analysis: null,
        status: 'uploaded',
        created_at: '2026-01-01T00:00:00Z',
      } as unknown as ProjectAssetRow,
    ]);

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
      undefined,
      undefined,
      assetRepo
    );
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createStubGenerationJob(ctx, {
        projectId: 'proj-1',
        approvalMessageId: 'msg-1',
      })
    ).rejects.toThrow(ApiError);
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

  it('includes brandContext in job plan when project has a brand', async () => {
    const brandRepo = createFakeBrandSystemRepository([
      {
        id: 'brand-fake-1',
        workspace_id: 'ws-1',
        name: 'Test Brand',
        description: 'A productivity brand',
        tone_of_voice: 'calm, premium',
        visual_direction: 'minimal',
        rules: null,
        palette: [
          { hex: '#ff0000', role: 'primary' },
          { hex: '#00ff00', role: 'secondary' },
        ],
        typography: { headingFont: 'Newsreader', bodyFont: 'Inter' },
      },
    ]);

    const projectRepo = createFakeProjectRepository([
      {
        id: 'proj-1',
        workspace_id: 'ws-1',
        name: 'Project One',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: 'brand-fake-1',
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
      } as unknown as import('../env.js').Env,
      brandRepo
    );
    const ctx = fakeAuthContext('ws-1');

    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });

    const row = await jobRepo.findByIdForWorkspace({ id: result.id, workspaceId: 'ws-1' });
    expect(row).not.toBeNull();
    const plan = row!.plan as Record<string, unknown> | null;
    expect(plan).not.toBeNull();
    expect(plan!.brandContext).toBeDefined();
    const brandCtx = plan!.brandContext as BrandContextDto;
    expect(brandCtx.name).toBe('Test Brand');
    expect(brandCtx.description).toBe('A productivity brand');
    expect(brandCtx.tone).toBe('calm, premium');
    expect(brandCtx.colors).toMatchObject({ primary: '#ff0000', secondary: '#00ff00' });
    expect(brandCtx.typography).toMatchObject({ headingFont: 'Newsreader', bodyFont: 'Inter' });
  });

  it('includes brandContext: null in job plan when project has no brand', async () => {
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

    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });

    const row = await jobRepo.findByIdForWorkspace({ id: result.id, workspaceId: 'ws-1' });
    expect(row).not.toBeNull();
    const plan = row!.plan as Record<string, unknown> | null;
    expect(plan).not.toBeNull();
    expect(plan!.brandContext).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// W5: generationScope / targetCardId seam
// ---------------------------------------------------------------------------

describe('createStubGenerationJob — W5 generation scope', () => {
  function makeApprovedMessage(id: string, threadId: string, _projectId?: string) {
    return {
      id,
      thread_id: threadId,
      workspace_id: 'ws-1',
      role: 'assistant' as const,
      kind: 'approval_summary' as const,
      content: 'Plan ready.',
      metadata: {
        approvalState: { status: 'approved', selectedAction: 'approve_and_create', updatedAt: '2026-01-01' },
        approvalCard: { summaryLine: 'Ready to create a 5-card carousel about wellness.' },
      } as unknown as Json,
      seq: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
  }

  function makeProject(type: string) {
    return {
      id: 'proj-1',
      workspace_id: 'ws-1',
      name: 'Test Project',
      type,
      status: 'active' as const,
      brand_system_id: null,
      metadata: {} as Json,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
  }

  function buildService(projectType: string) {
    const jobRepo = createFakeGenerationJobRepository();
    const thread = {
      id: 'thread-1',
      workspace_id: 'ws-1',
      project_id: 'proj-1',
      title: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    const message = makeApprovedMessage('msg-1', 'thread-1');
    const chatRepo = createFakeChatRepository([thread], [message]);
    const project = makeProject(projectType);
    const projectRepo = createFakeProjectRepository([project as unknown as ProjectRow]);
    const creditRepo = createFakeCreditRepository([
      {
        workspace_id: 'ws-1',
        subscription_available: 200,
        topup_available: 0,
        reserved: 0,
        updated_at: '2026-01-01',
      },
    ]);
    const creditService = new CreditService(creditRepo);
    const fakeQueue = { async send() {} };
    const env = {
      ENVIRONMENT: 'production',
      GENERATION_QUEUE: fakeQueue as unknown as import('../env.js').Env['GENERATION_QUEUE'],
    } as unknown as import('../env.js').Env;
    const service = new GenerationService(jobRepo, chatRepo, projectRepo, creditService, env);
    return { service, jobRepo };
  }

  it('selected_card scope estimates 10 credits regardless of carousel card count', async () => {
    const { service } = buildService('carousel');
    const ctx = fakeAuthContext('ws-1');
    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
      generationScope: 'selected_card',
      targetCardId: 'aaaaaaaa-0000-0000-0000-000000000001',
    });
    expect(result.reservedCredits).toBe(10);
  });

  it('selected_card scope stores generationScope and targetCardId in plan', async () => {
    const { service, jobRepo } = buildService('carousel');
    const ctx = fakeAuthContext('ws-1');
    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
      generationScope: 'selected_card',
      targetCardId: 'aaaaaaaa-0000-0000-0000-000000000001',
    });
    const row = await jobRepo.findByIdForWorkspace({ id: result.id, workspaceId: 'ws-1' });
    const plan = row!.plan as Record<string, unknown>;
    expect(plan.generationScope).toBe('selected_card');
    expect(plan.targetCardId).toBe('aaaaaaaa-0000-0000-0000-000000000001');
  });

  it('full_artifact scope does not store targetCardId in plan', async () => {
    const { service, jobRepo } = buildService('carousel');
    const ctx = fakeAuthContext('ws-1');
    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
      generationScope: 'full_artifact',
    });
    const row = await jobRepo.findByIdForWorkspace({ id: result.id, workspaceId: 'ws-1' });
    const plan = row!.plan as Record<string, unknown>;
    expect(plan.generationScope).toBe('full_artifact');
    expect(plan.targetCardId).toBeUndefined();
  });

  it('default (no generationScope) stores full_artifact in plan', async () => {
    const { service, jobRepo } = buildService('post');
    const ctx = fakeAuthContext('ws-1');
    const result = await service.createStubGenerationJob(ctx, {
      projectId: 'proj-1',
      approvalMessageId: 'msg-1',
    });
    const row = await jobRepo.findByIdForWorkspace({ id: result.id, workspaceId: 'ws-1' });
    const plan = row!.plan as Record<string, unknown>;
    expect(plan.generationScope).toBe('full_artifact');
  });
});
