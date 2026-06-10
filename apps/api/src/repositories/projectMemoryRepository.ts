import type { DbClient } from '../db/client.js';
import type { ProjectContextMemoryRow } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// Project memory repository (Phase 13D)
// ---------------------------------------------------------------------------
// Workspace-scoped access to project_context_memories.
// One row per project. Every query scopes by workspace_id AND project_id.
// Cross-workspace access returns null — never throws.

export interface GetProjectMemoryInput {
  workspaceId: string;
  projectId: string;
}

export interface UpsertProjectMemoryInput {
  workspaceId: string;
  projectId: string;
  summary?: string;
  topic?: string | null;
  audience?: string | null;
  tone?: string | null;
  platform?: string | null;
  format?: string | null;
  carouselGoal?: string | null;
  slideCount?: number | null;
  visualDirection?: string | null;
  approvedDirection?: string | null;
  rejectedIdeas?: string[];
  userPreferences?: string[];
  constraints?: string[];
}

export type PatchProjectMemoryInput = UpsertProjectMemoryInput;

export interface ProjectMemoryRepository {
  /** Returns the memory row for this project within the given workspace, or null. */
  getByProjectIdForWorkspace(input: GetProjectMemoryInput): Promise<ProjectContextMemoryRow | null>;
  /** Creates or fully replaces the memory row for this project. Sets updated_at. */
  upsertForProject(input: UpsertProjectMemoryInput): Promise<ProjectContextMemoryRow>;
  /** Merges non-undefined fields into the existing row. Returns null if no row exists. */
  patchForProject(input: PatchProjectMemoryInput): Promise<ProjectContextMemoryRow | null>;
  /** Returns the existing row, or creates a default empty row if none exists. */
  ensureForProject(input: GetProjectMemoryInput): Promise<ProjectContextMemoryRow>;
}

/**
 * Stub that throws "not implemented" — satisfies the interface for tests
 * that don't need memory behaviour.
 */
export class StubProjectMemoryRepository implements ProjectMemoryRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_db: DbClient) {}

  async getByProjectIdForWorkspace(_input: GetProjectMemoryInput): Promise<ProjectContextMemoryRow | null> {
    throw new Error('ProjectMemoryRepository.getByProjectIdForWorkspace is not implemented yet.');
  }

  async upsertForProject(_input: UpsertProjectMemoryInput): Promise<ProjectContextMemoryRow> {
    throw new Error('ProjectMemoryRepository.upsertForProject is not implemented yet.');
  }

  async patchForProject(_input: PatchProjectMemoryInput): Promise<ProjectContextMemoryRow | null> {
    throw new Error('ProjectMemoryRepository.patchForProject is not implemented yet.');
  }

  async ensureForProject(_input: GetProjectMemoryInput): Promise<ProjectContextMemoryRow> {
    throw new Error('ProjectMemoryRepository.ensureForProject is not implemented yet.');
  }
}

/**
 * Production implementation backed by Supabase.
 * All queries scope by workspace_id; no method can access another workspace's data.
 */
export class SupabaseProjectMemoryRepository implements ProjectMemoryRepository {
  constructor(private db: DbClient) {}

  async getByProjectIdForWorkspace(input: GetProjectMemoryInput): Promise<ProjectContextMemoryRow | null> {
    const { data, error } = await this.db
      .from('project_context_memories')
      .select('*')
      .eq('project_id', input.projectId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (error) throw mapDbError(error);
    return data as ProjectContextMemoryRow | null;
  }

  async upsertForProject(input: UpsertProjectMemoryInput): Promise<ProjectContextMemoryRow> {
    const now = new Date().toISOString();

    const payload: Record<string, unknown> = {
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      updated_at: now,
    };

    // Only include fields that were explicitly provided (not undefined)
    if (input.summary !== undefined) payload.summary = input.summary;
    if (input.topic !== undefined) payload.topic = input.topic;
    if (input.audience !== undefined) payload.audience = input.audience;
    if (input.tone !== undefined) payload.tone = input.tone;
    if (input.platform !== undefined) payload.platform = input.platform;
    if (input.format !== undefined) payload.format = input.format;
    if (input.carouselGoal !== undefined) payload.carousel_goal = input.carouselGoal;
    if (input.slideCount !== undefined) payload.slide_count = input.slideCount;
    if (input.visualDirection !== undefined) payload.visual_direction = input.visualDirection;
    if (input.approvedDirection !== undefined) payload.approved_direction = input.approvedDirection;
    if (input.rejectedIdeas !== undefined) payload.rejected_ideas = input.rejectedIdeas;
    if (input.userPreferences !== undefined) payload.user_preferences = input.userPreferences;
    if (input.constraints !== undefined) payload.constraints = input.constraints;

    const { data, error } = await this.db
      .from('project_context_memories')
      .upsert(payload, { onConflict: 'project_id' })
      .select()
      .single();

    if (error) throw mapDbError(error);
    return data as ProjectContextMemoryRow;
  }

  async patchForProject(input: PatchProjectMemoryInput): Promise<ProjectContextMemoryRow | null> {
    // Read-then-upsert pattern: fetch existing row, merge, then upsert.
    // Safe because memory updates are idempotent and always fire-and-forget.
    const existing = await this.getByProjectIdForWorkspace({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });

    if (!existing) return null;

    // Merge: input fields win over existing where provided
    const merged: UpsertProjectMemoryInput = {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      summary: input.summary ?? existing.summary,
      topic: input.topic !== undefined ? input.topic : existing.topic,
      audience: input.audience !== undefined ? input.audience : existing.audience,
      tone: input.tone !== undefined ? input.tone : existing.tone,
      platform: input.platform !== undefined ? input.platform : existing.platform,
      format: input.format !== undefined ? input.format : existing.format,
      carouselGoal: input.carouselGoal !== undefined ? input.carouselGoal : existing.carousel_goal,
      slideCount: input.slideCount !== undefined ? input.slideCount : existing.slide_count,
      visualDirection: input.visualDirection !== undefined ? input.visualDirection : existing.visual_direction,
      approvedDirection: input.approvedDirection !== undefined ? input.approvedDirection : existing.approved_direction,
      rejectedIdeas: input.rejectedIdeas !== undefined
        ? input.rejectedIdeas
        : (Array.isArray(existing.rejected_ideas) ? existing.rejected_ideas as string[] : []),
      userPreferences: input.userPreferences !== undefined
        ? input.userPreferences
        : (Array.isArray(existing.user_preferences) ? existing.user_preferences as string[] : []),
      constraints: input.constraints !== undefined
        ? input.constraints
        : (Array.isArray(existing.constraints) ? existing.constraints as string[] : []),
    };

    return this.upsertForProject(merged);
  }

  async ensureForProject(input: GetProjectMemoryInput): Promise<ProjectContextMemoryRow> {
    const existing = await this.getByProjectIdForWorkspace(input);
    if (existing) return existing;
    return this.upsertForProject({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
  }
}
