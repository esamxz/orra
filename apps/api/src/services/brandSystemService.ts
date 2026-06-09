import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import { ApiError } from '../errors.js';
import type { BrandSystemRepository } from '../repositories/brandSystemRepository.js';
import type { BrandSystemRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Brand system service
// ---------------------------------------------------------------------------
// Business logic for brand system CRUD. All methods enforce workspace scoping
// via the repository layer; the service never trusts client-provided workspace IDs.

export interface CreateBrandSystemRequest {
  name: string;
  description?: string;
  tone?: string;
  visualDirection?: string;
  rules?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  typography?: Record<string, unknown>;
  logoAssetId?: string | null;
}

export interface UpdateBrandSystemRequest {
  name?: string;
  description?: string;
  tone?: string;
  visualDirection?: string;
  rules?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  typography?: Record<string, unknown>;
  logoAssetId?: string | null;
}

export interface ListBrandSystemsRequest {
  limit: number;
  search?: string;
}

export interface BrandSystemResponse {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  tone: string | null;
  visualDirection: string | null;
  rules: string | null;
  colors: Record<string, string>;
  typography: Record<string, unknown>;
  logoAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

function colorsToPalette(
  colors?: Record<string, string>
): Array<{ hex: string; role: string }> {
  if (!colors) return [];
  const entries: Array<{ hex: string; role: string }> = [];
  const roles = ['primary', 'secondary', 'accent', 'background', 'text'] as const;
  for (const role of roles) {
    const hex = colors[role];
    if (hex) {
      entries.push({ hex, role });
    }
  }
  return entries;
}

function paletteToColors(
  palette: BrandSystemRow['palette'] | undefined
): Record<string, string> {
  if (!Array.isArray(palette)) return {};
  const result: Record<string, string> = {};
  for (const entry of palette) {
    if (
      entry &&
      typeof entry === 'object' &&
      'hex' in entry &&
      'role' in entry &&
      typeof entry.hex === 'string' &&
      typeof entry.role === 'string'
    ) {
      result[entry.role] = entry.hex;
    }
  }
  return result;
}

function mapBrandSystemRow(row: BrandSystemRow): BrandSystemResponse {
  const palette = row.palette as Array<{ hex: string; role: string }> | undefined;
  const typography =
    row.typography && typeof row.typography === 'object'
      ? (row.typography as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    tone: row.tone_of_voice,
    visualDirection: row.visual_direction,
    rules: row.rules,
    colors: paletteToColors(palette),
    typography,
    logoAssetId: null, // Reserved for Phase 11B (brand asset upload)
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BrandSystemService {
  constructor(private brandRepo: BrandSystemRepository) {}

  async createBrandSystem(
    ctx: ServiceContext,
    input: CreateBrandSystemRequest
  ): Promise<BrandSystemResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const row = await this.brandRepo.create({
      workspaceId,
      name: input.name,
      description: input.description,
      toneOfVoice: input.tone,
      visualDirection: input.visualDirection,
      rules: input.rules,
      palette: colorsToPalette(input.colors),
      typography: input.typography ?? {},
    });

    return mapBrandSystemRow(row);
  }

  async listBrandSystems(
    ctx: ServiceContext,
    input: ListBrandSystemsRequest
  ): Promise<BrandSystemResponse[]> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const rows = await this.brandRepo.listByWorkspace({
      workspaceId,
      limit: input.limit,
      search: input.search,
    });

    return rows.map(mapBrandSystemRow);
  }

  async getBrandSystem(ctx: ServiceContext, brandId: string): Promise<BrandSystemResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    const row = await this.brandRepo.findByIdForWorkspace({
      id: brandId,
      workspaceId,
    });

    if (!row) {
      throw new ApiError('NOT_FOUND', 'Brand system not found.');
    }

    return mapBrandSystemRow(row);
  }

  async updateBrandSystem(
    ctx: ServiceContext,
    brandId: string,
    input: UpdateBrandSystemRequest
  ): Promise<BrandSystemResponse> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the brand exists in this workspace before updating.
    const existing = await this.brandRepo.findByIdForWorkspace({
      id: brandId,
      workspaceId,
    });

    if (!existing) {
      throw new ApiError('NOT_FOUND', 'Brand system not found.');
    }

    const updates: Partial<
      Pick<BrandSystemRow, 'name' | 'description' | 'tone_of_voice' | 'visual_direction' | 'rules' | 'palette' | 'typography'>
    > = {};

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.tone !== undefined) updates.tone_of_voice = input.tone;
    if (input.visualDirection !== undefined) updates.visual_direction = input.visualDirection;
    if (input.rules !== undefined) updates.rules = input.rules;
    if (input.colors !== undefined) {
      updates.palette = colorsToPalette(input.colors) as unknown as BrandSystemRow['palette'];
    }
    if (input.typography !== undefined) {
      updates.typography = input.typography as unknown as BrandSystemRow['typography'];
    }

    const row = await this.brandRepo.updateForWorkspace({
      id: brandId,
      workspaceId,
      updates,
    });

    if (!row) {
      throw new ApiError('NOT_FOUND', 'Brand system not found.');
    }

    return mapBrandSystemRow(row);
  }

  async deleteBrandSystem(ctx: ServiceContext, brandId: string): Promise<void> {
    const auth = requireAuth(ctx);
    const workspaceId = auth.workspaceId;

    // Verify the brand exists in this workspace before deleting.
    const existing = await this.brandRepo.findByIdForWorkspace({
      id: brandId,
      workspaceId,
    });

    if (!existing) {
      throw new ApiError('NOT_FOUND', 'Brand system not found.');
    }

    await this.brandRepo.deleteForWorkspace({
      id: brandId,
      workspaceId,
    });
  }
}
