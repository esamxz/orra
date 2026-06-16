import type { DbClient } from '../db/client.js';
import type { TrendTemplateRow } from '@orra/db';
import { mapDbError } from '../db/errors.js';

// ---------------------------------------------------------------------------
// Trend template repository
// ---------------------------------------------------------------------------
// Platform-owned catalog — no workspace scoping. Read-only from the API layer.
// Admin mutations (insert/update/delete) happen directly in the DB or via seed SQL.

export interface TrendTemplateRepository {
  listActive(): Promise<TrendTemplateRow[]>;
}

export class FakeTrendTemplateRepository implements TrendTemplateRepository {
  constructor(private rows: TrendTemplateRow[] = []) {}

  async listActive(): Promise<TrendTemplateRow[]> {
    return this.rows
      .filter((r) => r.active)
      .sort((a, b) => a.sort_index - b.sort_index || a.created_at.localeCompare(b.created_at));
  }
}

export class SupabaseTrendTemplateRepository implements TrendTemplateRepository {
  constructor(private db: DbClient) {}

  async listActive(): Promise<TrendTemplateRow[]> {
    const { data, error } = await this.db
      .from('trend_templates')
      .select('*')
      .eq('active', true)
      .order('sort_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw mapDbError(error);
    }

    return (data ?? []) as TrendTemplateRow[];
  }
}
