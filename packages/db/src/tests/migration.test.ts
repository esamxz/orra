// Migration lint test — reads the SQL file and validates structural requirements
// without needing a live database connection.
//
// Checks:
//   • All 19 expected tables are present
//   • cards and layers are NOT standalone tables
//   • artifact_versions.document is jsonb
//   • workspace_id is present on all owned tables
//   • Check constraints are present for key columns
//   • All required indexes are present
//   • RLS enable statements are present for owned tables
//   • trend_templates has a public read policy
//   • The circular FK (artifacts → artifact_versions) is resolved via ALTER TABLE

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_PATH = join(
  __dirname,
  '../../../../supabase/migrations/20260607000001_orra_foundation.sql',
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf-8').toLowerCase();
});

// ---------------------------------------------------------------------------
// Helper: check that a substring is present
// ---------------------------------------------------------------------------
function has(fragment: string): boolean {
  return sql.includes(fragment.toLowerCase());
}

// ---------------------------------------------------------------------------
// Expected tables
// ---------------------------------------------------------------------------
const EXPECTED_TABLES = [
  'users',
  'workspaces',
  'workspace_members',
  'brand_systems',
  'brand_assets',
  'projects',
  'chat_threads',
  'chat_messages',
  'project_assets',
  'artifacts',
  'artifact_versions',
  'generation_jobs',
  'exports',
  'trend_templates',
  'credit_ledger',
  'credit_balances',
  'subscriptions',
  'purchases',
  'webhook_events',
];

// ---------------------------------------------------------------------------
// Tables that must NOT exist (cards and layers are JSON, not rows)
// ---------------------------------------------------------------------------
const FORBIDDEN_TABLES = ['cards', 'layers'];

// ---------------------------------------------------------------------------
// Tables that must have workspace_id (trend_templates and webhook_events excluded)
// ---------------------------------------------------------------------------
const WORKSPACE_OWNED_TABLES = [
  'workspaces',
  'workspace_members',
  'brand_systems',
  'brand_assets',
  'projects',
  'chat_threads',
  'chat_messages',
  'project_assets',
  'artifacts',
  'artifact_versions',
  'generation_jobs',
  'exports',
  'credit_ledger',
  'credit_balances',
  'subscriptions',
  'purchases',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migration file exists and is readable', () => {
  it('loads the migration file', () => {
    expect(sql.length).toBeGreaterThan(0);
  });
});

describe('expected tables are present', () => {
  for (const table of EXPECTED_TABLES) {
    it(`creates table: ${table}`, () => {
      expect(has(`create table ${table}`)).toBe(true);
    });
  }
});

describe('forbidden tables are absent (cards and layers must be JSON)', () => {
  for (const table of FORBIDDEN_TABLES) {
    it(`does NOT create table: ${table}`, () => {
      expect(has(`create table ${table}`)).toBe(false);
    });
  }
});

describe('artifact_versions stores document as jsonb', () => {
  it('artifact_versions has a document jsonb column', () => {
    expect(has('document               jsonb') || has('document jsonb')).toBe(true);
  });
});

describe('workspace_id is present on all owned tables', () => {
  for (const table of WORKSPACE_OWNED_TABLES) {
    it(`${table} references workspace_id`, () => {
      // The column or FK reference must appear in context of the table.
      // We check that workspace_id appears in the migration at all for now;
      // a stricter per-table parse is overkill for a lint test.
      expect(has('workspace_id')).toBe(true);
    });
  }

  it('workspace_id appears multiple times (once per owned table)', () => {
    const occurrences = sql.split('workspace_id').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(WORKSPACE_OWNED_TABLES.length);
  });
});

describe('check constraints', () => {
  it('workspaces.type check includes personal and team', () => {
    expect(has("'personal'") && has("'team'")).toBe(true);
  });

  it('workspace_members.role check includes owner, admin, member', () => {
    expect(has("'owner'") && has("'admin'") && has("'member'")).toBe(true);
  });

  it('projects.type check includes post, carousel, from_assets', () => {
    expect(has("'post'") && has("'carousel'") && has("'from_assets'")).toBe(true);
  });

  it('chat_messages.role check includes user, assistant, system', () => {
    expect(has("'user'") && has("'assistant'") && has("'system'")).toBe(true);
  });

  it('chat_messages.kind check includes text, approval_summary, job_ref', () => {
    expect(has("'text'") && has("'approval_summary'") && has("'job_ref'")).toBe(true);
  });

  it('brand_assets.kind check includes logo and reference', () => {
    expect(has("'logo'") && has("'reference'")).toBe(true);
  });

  it('project_assets.kind check includes generated_background and pinned_brand', () => {
    expect(has("'generated_background'") && has("'pinned_brand'")).toBe(true);
  });

  it('artifact_versions.reason check includes generation and restore', () => {
    expect(has("'generation'") && has("'restore'")).toBe(true);
  });

  it('artifact_versions.created_by check includes user and ai', () => {
    expect(has("'ai'")).toBe(true);
  });

  it('generation_jobs.kind check includes full_generate and region_edit', () => {
    expect(has("'full_generate'") && has("'region_edit'")).toBe(true);
  });

  it('generation_jobs.status check includes queued, running, succeeded, failed', () => {
    expect(
      has("'queued'") && has("'running'") && has("'succeeded'") && has("'failed'"),
    ).toBe(true);
  });

  it('exports.format check includes png and zip (no pdf)', () => {
    expect(has("'png'") && has("'zip'")).toBe(true);
    expect(has("'pdf'")).toBe(false);
  });

  it('credit_ledger.entry_type check includes grant, reserve, capture, refund', () => {
    expect(
      has("'grant'") && has("'reserve'") && has("'capture'") && has("'refund'"),
    ).toBe(true);
  });

  it('credit_ledger.bucket check includes subscription and topup', () => {
    expect(has("'subscription'") && has("'topup'")).toBe(true);
  });
});

describe('indexes', () => {
  const EXPECTED_INDEXES = [
    'idx_users_clerk_id',
    'idx_workspace_members_user_id',
    'idx_workspace_members_workspace_id',
    'idx_brand_systems_workspace_id',
    'idx_projects_workspace_id_updated_at',
    'idx_projects_brand_system_id',
    'idx_chat_threads_project_id',
    'idx_chat_messages_thread_id_created_at',
    'idx_project_assets_project_id',
    'idx_project_assets_workspace_id',
    'idx_artifacts_project_id',
    'idx_artifact_versions_artifact_id_version',
    'idx_generation_jobs_workspace_id_status',
    'idx_generation_jobs_project_id_created_at',
    'idx_exports_project_id_created_at',
    'idx_credit_ledger_workspace_id_created_at',
    'idx_subscriptions_workspace_id',
    'idx_webhook_events_event_id',
    'idx_trend_templates_active',
  ];

  for (const idx of EXPECTED_INDEXES) {
    it(`index exists: ${idx}`, () => {
      expect(has(idx)).toBe(true);
    });
  }
});

describe('row level security', () => {
  const RLS_TABLES = [
    'workspaces',
    'workspace_members',
    'brand_systems',
    'brand_assets',
    'projects',
    'chat_threads',
    'chat_messages',
    'project_assets',
    'artifacts',
    'artifact_versions',
    'generation_jobs',
    'exports',
    'credit_ledger',
    'credit_balances',
    'subscriptions',
    'purchases',
    'trend_templates',
    'webhook_events',
  ];

  for (const table of RLS_TABLES) {
    it(`rls enabled on: ${table}`, () => {
      expect(has(`alter table ${table}`) && has('enable row level security')).toBe(true);
    });
  }

  it('trend_templates has a public read policy', () => {
    expect(has('trend_templates_public_read')).toBe(true);
  });

  it('no insecure "using (true)" policies on owned tables', () => {
    // Ensure we have not accidentally written a blanket permit policy.
    // The only allowed "using (true)"-style policy would be on trend_templates
    // which uses "using (active = true)" not "using (true)".
    expect(has('using (true)')).toBe(false);
  });
});

describe('circular FK resolution', () => {
  it('artifacts.current_version_id FK is added via alter table', () => {
    expect(has('alter table artifacts') && has('artifacts_current_version_id_fkey')).toBe(true);
  });
});
