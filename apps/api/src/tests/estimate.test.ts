import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import projectRoutes from '../routes/projects.js';
import type { Repositories } from '../repositories/types.js';
import type { ProjectRow, CreditBalanceRow, GenerationJobRow } from '@orra/db';
import type { CreditRepository, ReserveCreditsInput, GrantCreditsInput, CaptureCreditsInput, RefundCreditsInput } from '../repositories/creditRepository.js';
import type { FindProjectInput } from '../repositories/projectRepository.js';
import type { CreateStubJobInput } from '../repositories/generationJobRepository.js';

const fakeVerifier = createFakeVerifier();

interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; requestId: string; details?: unknown };
}

const POST_PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const CAROUSEL_PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_WS_PROJECT_ID = '33333333-3333-3333-3333-333333333333';

function createFakeRepositories(options: {
  subscriptionAvailable?: number;
  jobsSpy?: GenerationJobRow[];
} = {}): { repos: Repositories; reserveCalls: ReserveCreditsInput[]; jobs: GenerationJobRow[] } {
  const subscriptionAvailable = options.subscriptionAvailable ?? 100;
  const reserveCalls: ReserveCreditsInput[] = [];
  const jobs: GenerationJobRow[] = options.jobsSpy ?? [];

  const projects: ProjectRow[] = [
    {
      id: POST_PROJECT_ID,
      workspace_id: 'ws-fake-1',
      name: 'Post Project',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 } as ProjectRow['ratio'],
      brand_system_id: null,
      source_template_id: null,
      autosave_state: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: CAROUSEL_PROJECT_ID,
      workspace_id: 'ws-fake-1',
      name: 'Carousel Project',
      type: 'carousel',
      ratio: { name: '4:5', w: 1080, h: 1350 } as ProjectRow['ratio'],
      brand_system_id: null,
      source_template_id: null,
      autosave_state: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: OTHER_WS_PROJECT_ID,
      workspace_id: 'ws-other',
      name: 'Other Workspace Project',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 } as ProjectRow['ratio'],
      brand_system_id: null,
      source_template_id: null,
      autosave_state: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const creditBalance: CreditBalanceRow = {
    workspace_id: 'ws-fake-1',
    subscription_available: subscriptionAvailable,
    topup_available: 0,
    reserved: 0,
    updated_at: '2026-01-01T00:00:00Z',
  };

  const repos: Repositories = {
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
        role: 'owner' as const,
        isNew: false,
      }),
    },
    project: {
      async create() { throw new Error('not used'); },
      async listByWorkspace() { return []; },
      async findByIdForWorkspace(input: FindProjectInput) {
        return projects.find(
          (p) => p.id === input.id && p.workspace_id === input.workspaceId
        ) ?? null;
      },
      async updateForWorkspace() { return null; },
      async deleteForWorkspace() {},
    },
    artifact: {
      async createArtifactForProject() { throw new Error('not used'); },
      async createVersion() { throw new Error('not used'); },
      async setCurrentVersion() { throw new Error('not used'); },
      async setCurrentVersionGuarded() { return null; },
      async commitVersion() { return null; },
      async getArtifactByIdForWorkspace() { return null; },
      async getArtifactByProjectIdForWorkspace() { return null; },
      async getCurrentVersion() { return null; },
    },
    chat: {
      async ensureThreadForProject() { throw new Error('not used'); },
      async findThreadByProjectId() { return null; },
      async listMessagesByThread() { return []; },
      async appendMessage() { throw new Error('not used'); },
      async findMessageByIdForProject() { return null; },
      async updateMessageMetadata() { throw new Error('not used'); },
    },
    generationJob: {
      async createStubJob(input: CreateStubJobInput) {
        const job: GenerationJobRow = {
          id: `job-${Date.now()}`,
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
      async findByIdForWorkspace() { return null; },
      async listByProject() { return []; },
      async findById() { return null; },
      async markRunningGuarded() { return null; },
      async markSucceededWithResultGuarded() { return null; },
      async markSucceededGuarded() { return null; },
      async markFailedGuarded() { return null; },
    },
    credit: {
      async getBalanceForWorkspace(workspaceId: string) {
        if (workspaceId === 'ws-fake-1') return creditBalance;
        return null;
      },
      async listLedgerForWorkspace() { return []; },
      async grantCredits(input: GrantCreditsInput) {
        if (input.bucket === 'subscription') {
          creditBalance.subscription_available += input.amount;
        } else {
          creditBalance.topup_available += input.amount;
        }
        return { ledgerId: 'grant-1' };
      },
      async reserveCredits(input: ReserveCreditsInput) {
        reserveCalls.push(input);
        const available = creditBalance.subscription_available + creditBalance.topup_available;
        if (available < input.amount) {
          throw new Error('Insufficient credits');
        }
        creditBalance.reserved += input.amount;
        creditBalance.subscription_available -= input.amount;
        return { reservedAmount: input.amount };
      },
      async captureCredits(input: CaptureCreditsInput) {
        creditBalance.reserved = Math.max(0, creditBalance.reserved - input.actualAmount);
        return { captured: input.actualAmount, refunded: 0 };
      },
      async refundCredits(_input: RefundCreditsInput) {
        const refunded = creditBalance.reserved;
        creditBalance.subscription_available += refunded;
        creditBalance.reserved = 0;
        return { refunded };
      },
    } as unknown as CreditRepository,
    brandSystem: {
      async create() { throw new Error('not used'); },
      async listByWorkspace() { return []; },
      async findByIdForWorkspace() { return null; },
      async updateForWorkspace() { return null; },
      async deleteForWorkspace() {},
    },
    asset: {} as unknown as Repositories['asset'],
    projectMemory: {} as unknown as Repositories['projectMemory'],
  } as unknown as Repositories;

  return { repos, reserveCalls, jobs };
}

function buildApp(repos: Repositories) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(createAuthMiddleware(fakeVerifier, { repositories: repos }));
  app.route('/v1/projects', projectRoutes);
  app.onError(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// POST /v1/projects/:id/generation-estimate (W8)
// ---------------------------------------------------------------------------

describe('POST /v1/projects/:id/generation-estimate', () => {
  it('returns 401 without auth', async () => {
    const { repos } = createFakeRepositories();
    const app = buildApp(repos);
    const res = await app.request(
      `/v1/projects/${POST_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'full_artifact' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when project belongs to another workspace', async () => {
    const { repos } = createFakeRepositories();
    const app = buildApp(repos);
    const res = await app.request(
      `/v1/projects/${OTHER_WS_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'full_artifact' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.error?.code).toBe('NOT_FOUND');
  });

  it('returns 400 for selected_card scope without targetCardId', async () => {
    const { repos } = createFakeRepositories();
    const app = buildApp(repos);
    const res = await app.request(
      `/v1/projects/${POST_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'selected_card' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.error?.code).toBe('VALIDATION');
  });

  it('returns 10 credits for full_artifact on a post project', async () => {
    const { repos } = createFakeRepositories();
    const app = buildApp(repos);
    const res = await app.request(
      `/v1/projects/${POST_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'full_artifact' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<{ estimatedCredits: number; canAfford: boolean }>;
    expect(json.ok).toBe(true);
    expect(json.data.estimatedCredits).toBe(10);
    expect(json.data.canAfford).toBe(true);
  });

  it('returns 30 credits for full_artifact on a carousel project (default 3 cards)', async () => {
    const { repos } = createFakeRepositories();
    const app = buildApp(repos);
    const res = await app.request(
      `/v1/projects/${CAROUSEL_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'full_artifact' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<{ estimatedCredits: number }>;
    expect(json.data.estimatedCredits).toBe(30);
  });

  it('returns 10 credits for selected_card scope', async () => {
    const { repos } = createFakeRepositories();
    const app = buildApp(repos);
    const res = await app.request(
      `/v1/projects/${CAROUSEL_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationScope: 'selected_card',
          targetCardId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<{ estimatedCredits: number; targetCardId: string }>;
    expect(json.data.estimatedCredits).toBe(10);
    expect(json.data.targetCardId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });

  it('returns canAfford: true when balance is sufficient', async () => {
    const { repos } = createFakeRepositories({ subscriptionAvailable: 100 });
    const app = buildApp(repos);
    const res = await app.request(
      `/v1/projects/${POST_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'full_artifact' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<{ canAfford: boolean; reason?: string }>;
    expect(json.data.canAfford).toBe(true);
    expect(json.data.reason).toBeUndefined();
  });

  it('returns canAfford: false when balance is insufficient', async () => {
    const { repos } = createFakeRepositories({ subscriptionAvailable: 5 });
    const app = buildApp(repos);
    const res = await app.request(
      `/v1/projects/${POST_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'full_artifact' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<{ canAfford: boolean; reason: string }>;
    expect(json.data.canAfford).toBe(false);
    expect(json.data.reason).toMatch(/10 credits/);
  });

  it('does NOT create a generation job', async () => {
    const { repos, jobs } = createFakeRepositories();
    const app = buildApp(repos);
    await app.request(
      `/v1/projects/${POST_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'full_artifact' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(jobs).toHaveLength(0);
  });

  it('does NOT reserve credits', async () => {
    const { repos, reserveCalls } = createFakeRepositories();
    const app = buildApp(repos);
    await app.request(
      `/v1/projects/${POST_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'full_artifact' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    expect(reserveCalls).toHaveLength(0);
  });

  it('returns generationScope in response', async () => {
    const { repos } = createFakeRepositories();
    const app = buildApp(repos);
    const res = await app.request(
      `/v1/projects/${POST_PROJECT_ID}/generation-estimate`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationScope: 'full_artifact' }),
      },
      { ENVIRONMENT: 'test' } as unknown as Record<string, unknown>
    );
    const json = (await res.json()) as ApiResponse<{ generationScope: string }>;
    expect(json.data.generationScope).toBe('full_artifact');
  });
});
