import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { ProjectRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Project service
// ---------------------------------------------------------------------------
// Business logic for project CRUD. All methods enforce workspace scoping
// via the repository layer; the service never trusts client-provided workspace IDs.

export interface CreateProjectRequest {
  name: string;
  type: 'post' | 'carousel' | 'from_assets';
  ratio: { name: string; w: number; h: number };
  brandSystemId?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  ratio?: { name: string; w: number; h: number };
  brandSystemId?: string | null;
}

export interface ListProjectsRequest {
  tab?: 'recent' | 'all';
  limit: number;
}

export interface ProjectResponse {
  id: string;
  workspaceId: string;
  name: string;
  type: 'post' | 'carousel' | 'from_assets';
  ratio: { name: string; w: number; h: number };
  brandSystemId: string | null;
  sourceTemplateId: string | null;
  currentArtifactId: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapProjectRow(row: ProjectRow): ProjectResponse {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: row.type,
    ratio: row.ratio as { name: string; w: number; h: number },
    brandSystemId: row.brand_system_id,
    sourceTemplateId: row.source_template_id,
    currentArtifactId: null, // Phase 8A: artifacts not implemented yet
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectService {
  constructor(private projectRepo: ProjectRepository) {}

  async createProject(
    ctx: ServiceContext,
    input: CreateProjectRequest
  ): Promise<ProjectResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // TODO(Phase 8A): Verify brandSystemId belongs to the same workspace.
    // BrandRepository does not exist yet; deferring to prevent FK violations
    // from mis-scoped brand_system_id values. When Brand CRUD is implemented,
    // add a workspace-scoped existence check here.

    const row = await this.projectRepo.create({
      workspaceId,
      name: input.name,
      type: input.type,
      ratio: input.ratio,
      brandSystemId: input.brandSystemId,
    });

    return mapProjectRow(row);
  }

  async listProjects(
    ctx: ServiceContext,
    input: ListProjectsRequest
  ): Promise<ProjectResponse[]> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const rows = await this.projectRepo.listByWorkspace({
      workspaceId,
      tab: input.tab,
      limit: input.limit,
    });

    return rows.map(mapProjectRow);
  }

  async getProject(ctx: ServiceContext, projectId: string): Promise<ProjectResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const row = await this.projectRepo.findByIdForWorkspace({
      id: projectId,
      workspaceId,
    });

    if (!row) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    return mapProjectRow(row);
  }

  async updateProject(
    ctx: ServiceContext,
    projectId: string,
    input: UpdateProjectRequest
  ): Promise<ProjectResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the project exists in this workspace before updating.
    const existing = await this.projectRepo.findByIdForWorkspace({
      id: projectId,
      workspaceId,
    });

    if (!existing) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    const updates: Partial<Pick<ProjectRow, 'name' | 'ratio' | 'brand_system_id'>> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.ratio !== undefined) updates.ratio = input.ratio as ProjectRow['ratio'];
    if (input.brandSystemId !== undefined) updates.brand_system_id = input.brandSystemId;

    const row = await this.projectRepo.updateForWorkspace({
      id: projectId,
      workspaceId,
      updates,
    });

    if (!row) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    return mapProjectRow(row);
  }

  async deleteProject(ctx: ServiceContext, projectId: string): Promise<void> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the project exists in this workspace before deleting.
    const existing = await this.projectRepo.findByIdForWorkspace({
      id: projectId,
      workspaceId,
    });

    if (!existing) {
      throw new ApiError('NOT_FOUND', 'Project not found.');
    }

    await this.projectRepo.deleteForWorkspace({
      id: projectId,
      workspaceId,
    });
  }
}
