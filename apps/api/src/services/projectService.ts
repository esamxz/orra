import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import type { ArtifactRepository } from '../repositories/artifactRepository.js';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import { ArtifactService } from './artifactService.js';
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

function mapProjectRow(
  row: ProjectRow,
  currentArtifactId?: string | null
): ProjectResponse {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: row.type,
    ratio: row.ratio as { name: string; w: number; h: number },
    brandSystemId: row.brand_system_id,
    sourceTemplateId: row.source_template_id,
    currentArtifactId: currentArtifactId ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectService {
  private artifactService: ArtifactService;

  constructor(
    private projectRepo: ProjectRepository,
    artifactRepo: ArtifactRepository,
    private brandSystemRepo?: BrandSystemRepository
  ) {
    this.artifactService = new ArtifactService(artifactRepo);
  }

  async createProject(
    ctx: ServiceContext,
    input: CreateProjectRequest
  ): Promise<ProjectResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Phase 11A: Validate brandSystemId belongs to the same workspace when provided.
    if (input.brandSystemId && this.brandSystemRepo) {
      const brand = await this.brandSystemRepo.findByIdForWorkspace({
        id: input.brandSystemId,
        workspaceId,
      });
      if (!brand) {
        throw new ApiError('NOT_FOUND', 'Brand system not found.');
      }
    }

    const row = await this.projectRepo.create({
      workspaceId,
      name: input.name,
      type: input.type,
      ratio: input.ratio,
      brandSystemId: input.brandSystemId,
    });

    // Phase 8B: create the artifact spine (artifact row + initial version).
    // Note: these are three separate DB calls without a wrapping transaction.
    // In v1, a partial failure can leave a project without an artifact.
    // A future phase should wrap this in a server-side RPC or transaction.
    const artifact = await this.artifactService.createInitialArtifactForProject(
      workspaceId,
      row.id,
      input.type,
      input.ratio
    );

    return mapProjectRow(row, artifact.id);
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

    // Phase 8B: listing does not eagerly resolve currentArtifactId to avoid N+1.
    // Consumers that need the artifact ID per project can fetch individually.
    return rows.map((row) => mapProjectRow(row));
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

    // Phase 8B: resolve currentArtifactId for the single-project view.
    // Projects created before Phase 8B may not have an artifact yet.
    let currentArtifactId: string | null = null;
    try {
      const artifact = await this.artifactService.getProjectArtifact(ctx, projectId);
      currentArtifactId = artifact.artifactId;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        currentArtifactId = null;
      } else {
        throw err;
      }
    }
    return mapProjectRow(row, currentArtifactId);
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

    // Phase 11A: Validate brandSystemId belongs to the same workspace when provided.
    if (input.brandSystemId && this.brandSystemRepo) {
      const brand = await this.brandSystemRepo.findByIdForWorkspace({
        id: input.brandSystemId,
        workspaceId,
      });
      if (!brand) {
        throw new ApiError('NOT_FOUND', 'Brand system not found.');
      }
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

    // Resolve currentArtifactId so the response is consistent with getProject.
    // Projects created before Phase 8B may not have an artifact yet.
    let currentArtifactId: string | null = null;
    try {
      const artifact = await this.artifactService.getProjectArtifact(ctx, projectId);
      currentArtifactId = artifact.artifactId;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        currentArtifactId = null;
      } else {
        throw err;
      }
    }
    return mapProjectRow(row, currentArtifactId);
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
