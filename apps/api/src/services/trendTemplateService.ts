import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import type { TrendTemplateRepository } from '../repositories/trendTemplateRepository.js';
import type { TrendTemplateRow } from '@orra/db';
import type { R2Signer } from '../r2/r2Signer.js';

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
  projectType: 'post';
  ratioHint: string | null;
  platformHint: string | null;
  assetHints: string[];
  previewVariant: string;
  isFeatured: boolean;
  tags: string[];
  sortIndex: number;
  referenceR2Key: string | null;
  previewUrl: string | null;
}

const PREVIEW_EXPIRY_SECONDS = 300; // 5 minutes

/**
 * Defensive mapper that returns safe defaults for every extended column.
 * This keeps the API stable while the `trend_templates_extend` migration is
 * rolling out across environments; rows fetched before the migration is applied
 * (or from a stale view) will simply use the documented defaults instead of
 * exposing undefined values to clients.
 */
function toDto(row: TrendTemplateRow): Omit<TrendTemplateDto, 'previewUrl'> {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    prompt: row.prompt,
    category: row.category ?? null,
    projectType: (row.project_type as 'post') ?? 'post',
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
  constructor(
    private repo: TrendTemplateRepository,
    private r2Signer?: R2Signer
  ) {}

  async listActive(ctx: ServiceContext): Promise<TrendTemplateDto[]> {
    requireAuth(ctx);
    const rows = await this.repo.listActive();
    const baseDtos = rows.map(toDto);

    const signer = this.r2Signer;
    if (!signer) {
      return baseDtos.map((dto) => ({ ...dto, previewUrl: null }));
    }

    return Promise.all(
      baseDtos.map(async (dto) => {
        if (!dto.referenceR2Key) {
          return { ...dto, previewUrl: null };
        }
        try {
          const readUrl = await signer.createReadUrl(
            dto.referenceR2Key,
            PREVIEW_EXPIRY_SECONDS
          );
          return { ...dto, previewUrl: readUrl.url };
        } catch (err) {
          // Fail open: a missing or misconfigured preview signer must not break
          // the template catalog. The frontend will render a fallback visual.
          console.error(
            `[trend-templates] previewUrl signing failed for key=${dto.referenceR2Key}:`,
            err
          );
          return { ...dto, previewUrl: null };
        }
      })
    );
  }
}
