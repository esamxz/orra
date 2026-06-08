import { describe, it, expect } from 'vitest';
import { ProjectService } from '../services/projectService.js';
import { ApiError } from '../errors.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { ProjectRow } from '@orra/db';

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
  it('createProject stores in authenticated workspace', async () => {
    const repo = createFakeProjectRepository();
    const service = new ProjectService(repo);
    const ctx = fakeAuthContext('ws-1');

    const project = await service.createProject(ctx, {
      name: 'My Post',
      type: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
    });

    expect(project.workspaceId).toBe('ws-1');
    expect(project.name).toBe('My Post');
    expect(project.type).toBe('post');
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
        id: 'proj-2',
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

    const service = new ProjectService(repo);
    const ctx = fakeAuthContext('ws-1');
    const projects = await service.listProjects(ctx, { limit: 10 });

    expect(projects).toHaveLength(1);
    expect(projects[0].workspaceId).toBe('ws-1');
  });

  it('getProject returns project in same workspace', async () => {
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

    const service = new ProjectService(repo);
    const ctx = fakeAuthContext('ws-1');
    const project = await service.getProject(ctx, '11111111-1111-1111-1111-111111111111');

    expect(project.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(project.workspaceId).toBe('ws-1');
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

    const service = new ProjectService(repo);
    const ctx = fakeAuthContext('ws-2');

    await expect(service.getProject(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow(ApiError);
    await expect(service.getProject(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow('Project not found');
  });

  it('updateProject updates project in same workspace', async () => {
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

    const service = new ProjectService(repo);
    const ctx = fakeAuthContext('ws-1');
    const project = await service.updateProject(ctx, '11111111-1111-1111-1111-111111111111', { name: 'New Name' });

    expect(project.name).toBe('New Name');
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

    const service = new ProjectService(repo);
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

    const service = new ProjectService(repo);
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

    const service = new ProjectService(repo);
    const ctx = fakeAuthContext('ws-2');

    await expect(service.deleteProject(ctx, '11111111-1111-1111-1111-111111111111')).rejects.toThrow(ApiError);
  });

  it('createProject without auth throws UNAUTHENTICATED', async () => {
    const repo = createFakeProjectRepository();
    const service = new ProjectService(repo);
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
