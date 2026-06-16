import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import type { TrendTemplateRepository } from '../repositories/trendTemplateRepository.js';
import type { TrendTemplateRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Trend template service
// ---------------------------------------------------------------------------
// Read-only. Templates are platform-owned catalog data managed directly in DB.

export interface TrendTemplateDto {
  id: string;
  title: string;
  description: string | null;
  prompt: string;
  category: string | null;
  projectType: 'post' | 'carousel';
  ratioHint: string | null;
  platformHint: string | null;
  assetHints: string[];
  previewVariant: string;
  isFeatured: boolean;
  tags: string[];
  sortIndex: number;
  referenceR2Key: string | null;
}

/**
 * Defensive mapper that returns safe defaults for every extended column.
 * This keeps the API stable while the `trend_templates_extend` migration is
 * rolling out across environments; rows fetched before the migration is applied
 * (or from a stale view) will simply use the documented defaults instead of
 * exposing undefined values to clients.
 */
function toDto(row: TrendTemplateRow): TrendTemplateDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    prompt: row.prompt,
    category: row.category ?? null,
    projectType: (row.project_type as 'post' | 'carousel') ?? 'post',
    ratioHint: row.ratio_hint ?? null,
    platformHint: row.platform_hint ?? null,
    assetHints: row.asset_hints ?? [],
    previewVariant: row.preview_variant ?? 'cover',
    isFeatured: row.is_featured ?? false,
    tags: row.tags ?? [],
    sortIndex: row.sort_index ?? 0,
    referenceR2Key: row.reference_r2_key ?? null,
  };
}

export class TrendTemplateService {
  constructor(private repo: TrendTemplateRepository) {}

  async listActive(ctx: ServiceContext): Promise<TrendTemplateDto[]> {
    requireAuth(ctx);
    const rows = await this.repo.listActive();
    return rows.map(toDto);
  }
}
