import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import artifactRoutes from '../routes/artifacts.js';
import type { Repositories } from '../repositories/types.js';
import type { ArtifactRow, ArtifactVersionRow } from '@orra/db';

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
  initial: { artifacts?: ArtifactRow[]; versions?: ArtifactVersionRow[] } = {}
): Repositories {
  const artifacts = [...(initial.artifacts ?? [])];
  const versions = [...(initial.versions ?? [])];

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
      async create() {
        throw new Error('not used');
      },
      async listByWorkspace() {
        return [];
      },
      async findByIdForWorkspace() {
        return null;
      },
      async updateForWorkspace() {
        return null;
      },
      async deleteForWorkspace() {},
    },
    artifact: {
      async createArtifactForProject() {
        throw new Error('not used');
      },
      async createVersion(input: {
        workspaceId: string;
        artifactId: string;
        version: number;
        document: unknown;
        reason: string;
        createdBy: string;
      }) {
        const version: ArtifactVersionRow = {
          id: `ver-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          workspace_id: input.workspaceId,
          artifact_id: input.artifactId,
          version: input.version,
          document: input.document as import('@orra/db').Json,
          reason: input.reason as ArtifactVersionRow['reason'],
          created_by: input.createdBy as ArtifactVersionRow['created_by'],
          brand_context_snapshot: null,
          created_at: new Date().toISOString(),
        };
        versions.push(version);
        return version;
      },
      async setCurrentVersion() {
        throw new Error('not used');
      },
      async setCurrentVersionGuarded(input: {
        workspaceId: string;
        artifactId: string;
        versionId: string;
        expectedCurrentVersionId: string;
      }) {
        const idx = artifacts.findIndex(
          (a) =>
            a.id === input.artifactId &&
            a.workspace_id === input.workspaceId &&
            a.current_version_id === input.expectedCurrentVersionId
        );
        if (idx === -1) return null;
        artifacts[idx] = { ...artifacts[idx], current_version_id: input.versionId };
        return artifacts[idx];
      },
      async getArtifactByIdForWorkspace(input: { id: string; workspaceId: string }) {
        return (
          artifacts.find(
            (a) => a.id === input.id && a.workspace_id === input.workspaceId
          ) ?? null
        );
      },
      async getArtifactByProjectIdForWorkspace(_input: { projectId: string; workspaceId: string }) {
        return null;
      },
      async getCurrentVersion(input: { artifactId: string; workspaceId: string }) {
        const artifact = artifacts.find(
          (a) => a.id === input.artifactId && a.workspace_id === input.workspaceId
        );
        if (!artifact || !artifact.current_version_id) return null;
        const version = versions.find((v) => v.id === artifact.current_version_id);
        if (!version) return null;
        return { artifact, version };
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
  app.route('/v1/artifacts', artifactRoutes);
  app.onError(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/artifacts/:id
// ---------------------------------------------------------------------------

describe('GET /v1/artifacts/:id', () => {
  it('returns artifact with document for same workspace', async () => {
    const repos = createFakeRepositories({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-fake-1',
          artifact_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          document: {
            schemaVersion: 1,
            artifactId: '11111111-1111-1111-1111-111111111111',
            type: 'post',
            ratio: { name: '4:5', w: 1080, h: 1350 },
            cards: [
              {
                id: '11111111-1111-1111-1111-111111111112',
                index: 0,
                baseColor: '#1d2a30',
                layers: [],
              },
            ],
            version: 1,
          },
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    expect((json.data as { artifactId: string }).artifactId).toBe('11111111-1111-1111-1111-111111111111');
    expect((json.data as { version: number }).version).toBe(1);
    expect((json.data as { document: { type: string } }).document.type).toBe('post');
  });

  it('requires authentication', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111',
      { method: 'GET' },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });

  it('returns NOT_FOUND for artifact in another workspace', async () => {
    const repos = createFakeRepositories({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-other',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-other',
          artifact_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          document: {},
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });

  it('returns VALIDATION for malformed artifact id', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/artifacts/not-a-uuid',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns NOT_FOUND when artifact has no current version', async () => {
    const repos = createFakeRepositories({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          project_id: 'proj-1',
          current_version_id: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111',
      { method: 'GET', headers: { Authorization: 'Bearer test_valid' } },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/artifacts/:id/actions
// ---------------------------------------------------------------------------

function makeValidDocument(artifactId: string, version: number) {
  return {
    schemaVersion: 1,
    artifactId,
    type: 'post' as const,
    ratio: { name: '4:5' as const, w: 1080, h: 1350 },
    cards: [
      {
        id: '11111111-1111-1111-1111-111111111112',
        index: 0,
        baseColor: '#1d2a30',
        layers: [
          {
            id: '11111111-1111-1111-1111-111111111113',
            type: 'text',
            z: 0,
            x: 100,
            y: 100,
            w: 400,
            h: 200,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            content: 'Hello',
            fontFamily: 'Inter',
            fontSize: 32,
            fontWeight: 400,
            lineHeight: 1.2,
            letterSpacing: 0,
            color: '#ffffff',
            align: 'center',
          },
        ],
      },
    ],
    version,
  };
}

describe('POST /v1/artifacts/:id/actions', () => {
  it('applies a valid action and returns updated document', async () => {
    const repos = createFakeRepositories({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-fake-1',
          artifact_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          document: makeValidDocument('11111111-1111-1111-1111-111111111111', 1),
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111/actions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseVersion: 1,
          action: {
            type: 'setTextContent',
            cardId: '11111111-1111-1111-1111-111111111112',
            layerId: '11111111-1111-1111-1111-111111111113',
            content: 'Updated from route',
          },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as { document: { cards: { layers: { content: string }[] }[] }; version: number };
    expect(data.document.cards[0].layers[0].content).toBe('Updated from route');
    expect(data.version).toBe(2);
  });

  it('requires authentication', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111/actions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseVersion: 1, action: { type: 'setTextContent', cardId: '11111111-1111-1111-1111-111111111112', layerId: '11111111-1111-1111-1111-111111111113', content: 'X' } }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('UNAUTHENTICATED');
  });

  it('returns VALIDATION for malformed artifact id', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/artifacts/not-a-uuid/actions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ baseVersion: 1, action: { type: 'setTextContent', cardId: '11111111-1111-1111-1111-111111111112', layerId: '11111111-1111-1111-1111-111111111113', content: 'X' } }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns VALIDATION for invalid body', async () => {
    const app = buildApp(createFakeRepositories());
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111/actions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ baseVersion: -1, action: 'not-an-action' }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VALIDATION');
  });

  it('returns 409 for stale baseVersion', async () => {
    const repos = createFakeRepositories({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-fake-1',
          artifact_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          document: makeValidDocument('11111111-1111-1111-1111-111111111111', 3),
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111/actions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseVersion: 2,
          action: {
            type: 'setTextContent',
            cardId: '11111111-1111-1111-1111-111111111112',
            layerId: '11111111-1111-1111-1111-111111111113',
            content: 'X',
          },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(409);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error!.code).toBe('VERSION_CONFLICT');
  });

  it('response includes updated document', async () => {
    const repos = createFakeRepositories({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-fake-1',
          artifact_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          document: makeValidDocument('11111111-1111-1111-1111-111111111111', 1),
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111/actions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseVersion: 1,
          action: {
            type: 'setTextContent',
            cardId: '11111111-1111-1111-1111-111111111112',
            layerId: '11111111-1111-1111-1111-111111111113',
            content: 'New content',
          },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(true);
    const data = json.data as { document: unknown };
    expect(data.document).toBeDefined();
  });

  it('requestId appears in errors', async () => {
    const repos = createFakeRepositories({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-fake-1',
          artifact_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          document: makeValidDocument('11111111-1111-1111-1111-111111111111', 3),
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111/actions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseVersion: 2,
          action: {
            type: 'setTextContent',
            cardId: '11111111-1111-1111-1111-111111111112',
            layerId: '11111111-1111-1111-1111-111111111113',
            content: 'X',
          },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    const json = (await res.json()) as ApiResponse;
    expect(json.error!.requestId).toBeDefined();
    expect(typeof json.error!.requestId).toBe('string');
  });

  it('does not leak stack traces in errors', async () => {
    const repos = createFakeRepositories({
      artifacts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspace_id: 'ws-fake-1',
          project_id: 'proj-1',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-fake-1',
          artifact_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          document: makeValidDocument('11111111-1111-1111-1111-111111111111', 3),
          reason: 'manual_checkpoint',
          created_by: 'user',
          brand_context_snapshot: null,
          created_at: '2026-01-01',
        },
      ],
    });

    const app = buildApp(repos);
    const res = await app.request(
      '/v1/artifacts/11111111-1111-1111-1111-111111111111/actions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_valid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseVersion: 2,
          action: {
            type: 'setTextContent',
            cardId: '11111111-1111-1111-1111-111111111112',
            layerId: '11111111-1111-1111-1111-111111111113',
            content: 'X',
          },
        }),
      },
      { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>
    );

    const text = await res.text();
    expect(text).not.toContain('at ');
    expect(text).not.toContain('Error:');
    expect(text).not.toContain('stack');
  });
});
