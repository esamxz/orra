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
}

function toDto(row: TrendTemplateRow): TrendTemplateDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    prompt: row.prompt,
    category: row.category,
    projectType: row.project_type as 'post' | 'carousel',
    ratioHint: row.ratio_hint,
    platformHint: row.platform_hint,
    assetHints: row.asset_hints,
    previewVariant: row.preview_variant,
    isFeatured: row.is_featured,
    tags: row.tags,
    sortIndex: row.sort_index,
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
