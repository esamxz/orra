import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { ProjectService } from '../services/projectService.js';
import { ApiError } from '../errors.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { ArtifactRepository } from '../repositories/artifactRepository.js';
import type { ProjectRow, ArtifactRow, ArtifactVersionRow, BrandSystemRow } from '@orra/db';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';

// ---------------------------------------------------------------------------
// Fake project repository
// ---------------------------------------------------------------------------

function createFakeProjectRepository(initial: ProjectRow[] = []): ProjectRepository {
  const projects = [...initial];
  let nextId = 1;

  return {
    async create(input) {
      const project: ProjectRow = {
        id: `proj-${nextId++}`,
        workspace_id: input.workspaceId,
        name: input.name,
        type: input.type,
        ratio: input.ratio as ProjectRow['ratio'],
        brand_system_id: input.brandSystemId ?? null,
        source_template_id: null,
        autosave_state: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      projects.push(project);
      return project;
    },

    async listByWorkspace(input) {
      return projects
        .filter((p) => p.workspace_id === input.workspaceId)
        .slice(0, input.limit);
    },

    async findByIdForWorkspace(input) {
      return projects.find((p) => p.id === input.id && p.workspace_id === input.workspaceId) ?? null;
    },

    async updateForWorkspace(input) {
      const idx = projects.findIndex(
        (p) => p.id === input.id && p.workspace_id === input.workspaceId
      );
      if (idx === -1) return null;
      projects[idx] = { ...projects[idx], ...input.updates };
      return projects[idx];
    },

    async deleteForWorkspace(input) {
      const idx = projects.findIndex(
        (p) => p.id === input.id && p.workspace_id === input.workspaceId
      );
      if (idx !== -1) projects.splice(idx, 1);
    },
  };
}

// ---------------------------------------------------------------------------
// Fake artifact repository
// ---------------------------------------------------------------------------

function createFakeArtifactRepository(initial: { artifacts?: ArtifactRow[]; versions?: ArtifactVersionRow[] } = {}): ArtifactRepository {
  const artifacts = [...(initial.artifacts ?? [])];
  const versions = [...(initial.versions ?? [])];

  return {
    async createArtifactForProject(input) {
      const artifact: ArtifactRow = {
        id: randomUUID(),
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        current_version_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      artifacts.push(artifact);
      return artifact;
    },

    async createVersion(input) {
      const version: ArtifactVersionRow = {
        id: randomUUID(),
        workspace_id: input.workspaceId,
        artifact_id: input.artifactId,
        version: input.version,
        document: input.document,
        reason: input.reason,
        created_by: input.createdBy,
        brand_context_snapshot: null,
        created_at: new Date().toISOString(),
      };
      versions.push(version);
      return version;
    },

    async setCurrentVersion(input) {
      const idx = artifacts.findIndex(
        (a) => a.id === input.artifactId && a.workspace_id === input.workspaceId
      );
      if (idx === -1) {
        throw new Error('Artifact not found');
      }
      artifacts[idx] = { ...artifacts[idx], current_version_id: input.versionId };
      return artifacts[idx];
    },

    async setCurrentVersionGuarded(input) {
      const idx = artifacts.findIndex(
        (a) =>
          a.id === input.artifactId &&
          a.workspace_id === input.workspaceId &&
          a.current_version_id === input.expectedCurrentVersionId
      );
      if (idx === -1) {
        return null;
      }
      artifacts[idx] = { ...artifacts[idx], current_version_id: input.versionId };
      return artifacts[idx];
    },

    async getArtifactByIdForWorkspace(input) {
      return (
        artifacts.find(
          (a) => a.id === input.id && a.workspace_id === input.workspaceId
        ) ?? null
      );
    },

    async getArtifactByProjectIdForWorkspace(input) {
      return (
        artifacts.find(
          (a) => a.project_id === input.projectId && a.workspace_id === input.workspaceId
        ) ?? null
      );
    },

    async getCurrentVersion(input) {
      const artifact = artifacts.find(
        (a) => a.id === input.artifactId && a.workspace_id === input.workspaceId
      );
      if (!artifact || !artifact.current_version_id) return null;
      const version = versions.find((v) => v.id === artifact.current_version_id);
      if (!version) return null;
      return { artifact, version };
    },

    async commitVersion(input) {
      const idx = artifacts.findIndex(
        (a) =>
          a.id === input.artifactId &&
          a.workspace_id === input.workspaceId &&
          a.current_version_id === input.expectedCurrentVersionId
      );
      if (idx === -1) {
        return null;
      }
      const version: ArtifactVersionRow = {
        id: randomUUID(),
        workspace_id: input.workspaceId,
        artifact_id: input.artifactId,
        version: input.version,
        document: input.document,
        reason: input.reason,
        created_by: input.createdBy,
        brand_context_snapshot: null,
        created_at: new Date().toISOString(),
      };
      versions.push(version);
      artifacts[idx] = { ...artifacts[idx], current_version_id: version.id, updated_at: version.created_at };
      return version;
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

describe('ProjectService', () => {
  it('createProject stores in authenticated workspace and creates artifact', async () => {
    const repo = createFakeProjectRepository();
    const artifactRepo = createFakeArtifactRepository();
    const service = new ProjectService(repo, artifactRepo);
    const ctx = fakeAuthContext('ws-1');

    const project = await service.createProject(ctx, {
      name: 'My Post',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
    });

    expect(project.workspaceId).toBe('ws-1');
    expect(project.name).toBe('My Post');
    expect(project.type).toBe('post');
    expect(project.currentArtifactId).toBeTruthy();
  });

  it('createProject response includes currentArtifactId', async () => {
    const repo = createFakeProjectRepository();
    const artifactRepo = createFakeArtifactRepository();
    const service = new ProjectService(repo, artifactRepo);
    const ctx = fakeAuthContext('ws-1');

    const project = await service.createProject(ctx, {
      name: 'My Carousel',
      type: 'carousel',
      ratio: { name: '1:1', w: 1080, h: 1080 },
    });

    expect(project.currentArtifactId).toBeDefined();
    expect(typeof project.currentArtifactId).toBe('string');
  });

  it('listProjects only returns projects for the authenticated workspace', async () => {
    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
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
      {
        id: '22222222-2222-2222-2222-222222222222',
        workspace_id: 'ws-2',
        name: 'Project Two',
        type: 'carousel',
        ratio: { name: '1:1', w: 1080, h: 1080 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ProjectService(repo, createFakeArtifactRepository());
    const ctx = fakeAuthContext('ws-1');
    const projects = await service.listProjects(ctx, { limit: 10 });

    expect(projects).toHaveLength(1);
    expect(projects[0].workspaceId).toBe('ws-1');
  });

  it('getProject returns project in same workspace with currentArtifactId', async () => {
    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
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

    const artifactRepo = createFakeArtifactRepository({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: '11111111-1111-1111-1111-111111111111',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: 'art-1',
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

    const service = new ProjectService(repo, artifactRepo);
    const ctx = fakeAuthContext('ws-1');
    const project = await service.getProject(ctx, '11111111-1111-1111-1111-111111111111');

    expect(project.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(project.workspaceId).toBe('ws-1');
    expect(project.currentArtifactId).toBe('art-1');
  });

  it('getProject throws NOT_FOUND for project in another workspace', async () => {
    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
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

    const service = new ProjectService(repo, createFakeArtifactRepository());
    const ctx = fakeAuthContext('ws-2');

    await expect(service.getProject(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow(ApiError);
    await expect(service.getProject(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow('Project not found');
  });

  it('updateProject updates project in same workspace and resolves currentArtifactId', async () => {
    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
        name: 'Old Name',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const artifactRepo = createFakeArtifactRepository({
      artifacts: [
        {
          id: 'art-1',
          workspace_id: 'ws-1',
          project_id: '11111111-1111-1111-1111-111111111111',
          current_version_id: 'ver-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      versions: [
        {
          id: 'ver-1',
          workspace_id: 'ws-1',
          artifact_id: 'art-1',
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

    const service = new ProjectService(repo, artifactRepo);
    const ctx = fakeAuthContext('ws-1');
    const project = await service.updateProject(ctx, '11111111-1111-1111-1111-111111111111', { name: 'New Name' });

    expect(project.name).toBe('New Name');
    expect(project.currentArtifactId).toBe('art-1');
  });

  it('updateProject throws NOT_FOUND for project in another workspace', async () => {
    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
        name: 'Old Name',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ProjectService(repo, createFakeArtifactRepository());
    const ctx = fakeAuthContext('ws-2');

    await expect(service.updateProject(ctx, '11111111-1111-1111-1111-111111111111', { name: 'New Name' })).rejects.toThrow(ApiError);
  });

  it('deleteProject removes project in same workspace', async () => {
    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
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

    const service = new ProjectService(repo, createFakeArtifactRepository());
    const ctx = fakeAuthContext('ws-1');
    await service.deleteProject(ctx, '11111111-1111-1111-1111-111111111111');

    await expect(service.getProject(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow(ApiError);
  });

  it('deleteProject throws NOT_FOUND for project in another workspace', async () => {
    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
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

    const service = new ProjectService(repo, createFakeArtifactRepository());
    const ctx = fakeAuthContext('ws-2');

    await expect(service.deleteProject(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow(ApiError);
  });

  it('createProject without auth throws UNAUTHENTICATED', async () => {
    const repo = createFakeProjectRepository();
    const service = new ProjectService(repo, createFakeArtifactRepository());
    const ctx = {
      env: {} as unknown as import('../env.js').Env,
      requestId: 'req-123',
      auth: undefined,
    };

    await expect(
      service.createProject(ctx, {
        name: 'Test',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
      })
    ).rejects.toThrow(ApiError);
  });
});

// ---------------------------------------------------------------------------
// Brand system validation
// ---------------------------------------------------------------------------

function createFakeBrandSystemRepository(initial: BrandSystemRow[] = []): BrandSystemRepository {
  const brands = [...initial];
  let nextId = 1;

  return {
    async create(input) {
      const brand: BrandSystemRow = {
        id: `brand-${nextId++}`,
        workspace_id: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
        tone_of_voice: input.toneOfVoice ?? null,
        visual_direction: input.visualDirection ?? null,
        rules: input.rules ?? null,
        palette: input.palette as unknown as BrandSystemRow['palette'],
        typography: input.typography as unknown as BrandSystemRow['typography'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      brands.push(brand);
      return brand;
    },
    async listByWorkspace(input) {
      return brands.filter((b) => b.workspace_id === input.workspaceId).slice(0, input.limit);
    },
    async findByIdForWorkspace(input) {
      return brands.find((b) => b.id === input.id && b.workspace_id === input.workspaceId) ?? null;
    },
    async updateForWorkspace(input) {
      const idx = brands.findIndex((b) => b.id === input.id && b.workspace_id === input.workspaceId);
      if (idx === -1) return null;
      brands[idx] = { ...brands[idx], ...input.updates };
      return brands[idx];
    },
    async deleteForWorkspace(input) {
      const idx = brands.findIndex((b) => b.id === input.id && b.workspace_id === input.workspaceId);
      if (idx !== -1) brands.splice(idx, 1);
    },
  };
}

describe('ProjectService brand validation', () => {
  it('createProject without brandSystemId succeeds', async () => {
    const repo = createFakeProjectRepository();
    const service = new ProjectService(repo, createFakeArtifactRepository());
    const ctx = fakeAuthContext('ws-1');

    const project = await service.createProject(ctx, {
      name: 'No Brand Post',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
    });

    expect(project.brandSystemId).toBeNull();
  });

  it('createProject with valid brandSystemId in same workspace succeeds', async () => {
    const brandRepo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
        name: 'My Brand',
        description: null,
        tone_of_voice: null,
        visual_direction: null,
        rules: null,
        palette: [],
        typography: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const repo = createFakeProjectRepository();
    const service = new ProjectService(repo, createFakeArtifactRepository(), brandRepo);
    const ctx = fakeAuthContext('ws-1');

    const project = await service.createProject(ctx, {
      name: 'Branded Post',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
      brandSystemId: '11111111-1111-1111-1111-111111111111',
    });

    expect(project.brandSystemId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('createProject with invalid brandSystemId throws NOT_FOUND', async () => {
    const brandRepo = createFakeBrandSystemRepository();
    const repo = createFakeProjectRepository();
    const service = new ProjectService(repo, createFakeArtifactRepository(), brandRepo);
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createProject(ctx, {
        name: 'Bad Brand Post',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brandSystemId: '00000000-0000-0000-0000-000000000000',
      })
    ).rejects.toThrow(ApiError);
    await expect(
      service.createProject(ctx, {
        name: 'Bad Brand Post',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brandSystemId: '00000000-0000-0000-0000-000000000000',
      })
    ).rejects.toThrow('Brand system not found');
  });

  it('createProject with brandSystemId from another workspace throws NOT_FOUND', async () => {
    const brandRepo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-other',
        name: 'Other Brand',
        description: null,
        tone_of_voice: null,
        visual_direction: null,
        rules: null,
        palette: [],
        typography: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const repo = createFakeProjectRepository();
    const service = new ProjectService(repo, createFakeArtifactRepository(), brandRepo);
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.createProject(ctx, {
        name: 'Wrong Workspace Brand',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brandSystemId: '11111111-1111-1111-1111-111111111111',
      })
    ).rejects.toThrow(ApiError);
  });

  it('updateProject with valid brandSystemId succeeds', async () => {
    const brandRepo = createFakeBrandSystemRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
        name: 'My Brand',
        description: null,
        tone_of_voice: null,
        visual_direction: null,
        rules: null,
        palette: [],
        typography: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
        name: 'Old Name',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ProjectService(repo, createFakeArtifactRepository(), brandRepo);
    const ctx = fakeAuthContext('ws-1');

    const project = await service.updateProject(ctx, '11111111-1111-1111-1111-111111111111', {
      brandSystemId: '11111111-1111-1111-1111-111111111111',
    });

    expect(project.brandSystemId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('updateProject with invalid brandSystemId throws NOT_FOUND', async () => {
    const brandRepo = createFakeBrandSystemRepository();
    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
        name: 'Old Name',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: null,
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ProjectService(repo, createFakeArtifactRepository(), brandRepo);
    const ctx = fakeAuthContext('ws-1');

    await expect(
      service.updateProject(ctx, '11111111-1111-1111-1111-111111111111', {
        brandSystemId: '00000000-0000-0000-0000-000000000000',
      })
    ).rejects.toThrow(ApiError);
  });

  it('updateProject to remove brand by passing null succeeds', async () => {
    const brandRepo = createFakeBrandSystemRepository();
    const repo = createFakeProjectRepository([
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: 'ws-1',
        name: 'Old Name',
        type: 'post',
        ratio: { name: '4:5', w: 1080, h: 1350 },
        brand_system_id: 'brand-was-here',
        source_template_id: null,
        autosave_state: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);

    const service = new ProjectService(repo, createFakeArtifactRepository(), brandRepo);
    const ctx = fakeAuthContext('ws-1');

    const project = await service.updateProject(ctx, '11111111-1111-1111-1111-111111111111', {
      brandSystemId: null,
    });

    expect(project.brandSystemId).toBeNull();
  });
});
