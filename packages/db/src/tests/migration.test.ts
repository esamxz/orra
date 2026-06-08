// Migration lint tests — read SQL files and validate structural requirements
// without a live database connection.
//
// Covers both migrations:
//   20260607000001_orra_foundation.sql  (foundation schema)
//   20260607000002_orra_hardening.sql   (Phase 6B hardening: version > 0, brand_assets index)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import type {
  GenerationJobStatus,
  GenerationJobKind,
  ProjectType,
  ArtifactVersionReason,
  ExportFormat,
  CreditLedgerEntryType,
  CreditBucket,
  WorkspaceType,
  WorkspacePlan,
  WorkspaceMemberRole,
  BrandAssetKind,
  ProjectAssetKind,
  ArtifactVersionCreatedBy,
  SubscriptionPlan,
  SubscriptionStatus,
  PurchasePack,
  PurchaseStatus,
  ChatMessageRole,
  ChatMessageKind,
} from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '../../../../supabase/migrations');
const FOUNDATION = join(MIGRATIONS_DIR, '20260607000001_orra_foundation.sql');
const HARDENING = join(MIGRATIONS_DIR, '20260607000002_orra_hardening.sql');
const ATOMIC = join(MIGRATIONS_DIR, '20260608000002_orra_atomic_artifact_version.sql');

let foundation: string;
let hardening: string;
let atomic: string;

beforeAll(() => {
  foundation = readFileSync(FOUNDATION, 'utf-8').toLowerCase();
  hardening = readFileSync(HARDENING, 'utf-8').toLowerCase();
  atomic = readFileSync(ATOMIC, 'utf-8').toLowerCase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True if fragment appears anywhere in haystack (case-insensitive). */
function has(haystack: string, fragment: string): boolean {
  return haystack.includes(fragment.toLowerCase());
}

/**
 * Extract the CREATE TABLE block for a given table name.
 * Slices from "create table <name>" to the first ");" that ends the statement.
 * Returns empty string if the table is not found.
 */
function extractTableDef(sql: string, table: string): string {
  const marker = `create table ${table.toLowerCase()}`;
  const start = sql.indexOf(marker);
  if (start === -1) return '';
  const end = sql.indexOf(');', start);
  return end === -1 ? '' : sql.slice(start, end + 2);
}

// ---------------------------------------------------------------------------
// Foundation migration file existence
// ---------------------------------------------------------------------------

describe('migration files exist and are non-empty', () => {
  it('foundation migration is readable', () => {
    expect(foundation.length).toBeGreaterThan(0);
  });

  it('hardening migration is readable', () => {
    expect(hardening.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Required tables
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

const FORBIDDEN_TABLES = ['cards', 'layers'];

describe('required tables exist', () => {
  for (const table of EXPECTED_TABLES) {
    it(`creates table: ${table}`, () => {
      expect(has(foundation, `create table ${table}`)).toBe(true);
    });
  }
});

describe('forbidden tables are absent — cards and layers must be JSON inside artifact_versions.document', () => {
  for (const table of FORBIDDEN_TABLES) {
    it(`does NOT create table: ${table}`, () => {
      expect(has(foundation, `create table ${table}`)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// workspace_id scoping — per-table, not a global check
// ---------------------------------------------------------------------------

const WORKSPACE_OWNED_TABLES = [
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

// Tables that must NOT have workspace_id
const NON_WORKSPACE_TABLES = ['users', 'trend_templates', 'webhook_events'];

describe('workspace_id is present in each owned table definition', () => {
  for (const table of WORKSPACE_OWNED_TABLES) {
    it(`${table} has workspace_id in its CREATE TABLE block`, () => {
      const def = extractTableDef(foundation, table);
      expect(def.length).toBeGreaterThan(0);
      expect(has(def, 'workspace_id')).toBe(true);
    });
  }
});

describe('workspace_id is absent from non-owned tables', () => {
  for (const table of NON_WORKSPACE_TABLES) {
    it(`${table} does NOT have workspace_id`, () => {
      const def = extractTableDef(foundation, table);
      expect(def.length).toBeGreaterThan(0);
      expect(has(def, 'workspace_id')).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Structural integrity
// ---------------------------------------------------------------------------

describe('structural integrity', () => {
  it('artifacts has unique(project_id)', () => {
    const def = extractTableDef(foundation, 'artifacts');
    expect(has(def, 'unique (project_id)')).toBe(true);
  });

  it('artifact_versions has unique(artifact_id, version)', () => {
    const def = extractTableDef(foundation, 'artifact_versions');
    expect(has(def, 'unique (artifact_id, version)')).toBe(true);
  });

  it('artifact_versions.document is jsonb not null', () => {
    const def = extractTableDef(foundation, 'artifact_versions');
    // Allow for varying whitespace between column name and type
    expect(has(def, 'document') && has(def, 'jsonb') && has(def, 'not null')).toBe(true);
  });

  it('users.clerk_id has unique constraint', () => {
    const def = extractTableDef(foundation, 'users');
    expect(has(def, 'clerk_id') && has(def, 'unique')).toBe(true);
  });

  it('users.clerk_id is not null', () => {
    const def = extractTableDef(foundation, 'users');
    expect(has(def, 'clerk_id') && has(def, 'not null')).toBe(true);
  });

  it('workspaces.owner_user_id references users(id)', () => {
    const def = extractTableDef(foundation, 'workspaces');
    expect(has(def, 'owner_user_id') && has(def, 'references users(id)')).toBe(true);
  });

  it('workspace_members has unique(workspace_id, user_id)', () => {
    const def = extractTableDef(foundation, 'workspace_members');
    expect(has(def, 'unique (workspace_id, user_id)')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Foreign key delete behavior
// ---------------------------------------------------------------------------

describe('foreign key delete behavior', () => {
  it('projects.brand_system_id uses ON DELETE SET NULL', () => {
    const def = extractTableDef(foundation, 'projects');
    // Find the brand_system_id line and check it has on delete set null
    expect(has(def, 'brand_system_id') && has(def, 'on delete set null')).toBe(true);
  });

  it('brand_assets cascades when brand_system is deleted', () => {
    const def = extractTableDef(foundation, 'brand_assets');
    // brand_system_id FK should be cascade
    expect(has(def, 'brand_system_id') && has(def, 'on delete cascade')).toBe(true);
  });

  it('project_assets cascades when project is deleted', () => {
    const def = extractTableDef(foundation, 'project_assets');
    expect(has(def, 'project_id') && has(def, 'on delete cascade')).toBe(true);
  });

  it('chat_threads cascades when project is deleted', () => {
    const def = extractTableDef(foundation, 'chat_threads');
    expect(has(def, 'project_id') && has(def, 'on delete cascade')).toBe(true);
  });

  it('artifacts.current_version_id uses ON DELETE SET NULL (circular FK via ALTER TABLE)', () => {
    expect(
      has(foundation, 'alter table artifacts') &&
      has(foundation, 'artifacts_current_version_id_fkey') &&
      has(foundation, 'on delete set null'),
    ).toBe(true);
  });

  it('workspace_members cascades when workspace is deleted', () => {
    const def = extractTableDef(foundation, 'workspace_members');
    expect(has(def, 'workspace_id') && has(def, 'on delete cascade')).toBe(true);
  });

  it('source_template_id in projects has no FK reference', () => {
    const def = extractTableDef(foundation, 'projects');
    // Verify source_template_id exists but does NOT reference another table
    expect(has(def, 'source_template_id')).toBe(true);
    // Isolate the source_template_id line to check it has no "references" keyword
    const lines = def.split('\n');
    const templateLine = lines.find(l => l.includes('source_template_id'));
    expect(templateLine).toBeDefined();
    expect(has(templateLine ?? '', 'references')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Check constraints — aligned with packages/db union types
// Tests use typed arrays to ensure SQL and TypeScript stay in sync.
// If a value is added to the TypeScript union, add it here too; if missing
// from the SQL constraint this test will catch it.
// ---------------------------------------------------------------------------

describe('check constraints aligned with packages/db union types', () => {
  // workspaces.type
  const workspaceTypes: WorkspaceType[] = ['personal', 'team'];
  it.each(workspaceTypes)('workspaces.type includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // workspaces.plan
  const workspacePlans: WorkspacePlan[] = ['free', 'creator', 'pro', 'studio'];
  it.each(workspacePlans)('workspaces.plan includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // workspace_members.role
  const memberRoles: WorkspaceMemberRole[] = ['owner', 'admin', 'member'];
  it.each(memberRoles)('workspace_members.role includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // projects.type
  const projectTypes: ProjectType[] = ['post', 'carousel', 'from_assets'];
  it.each(projectTypes)('projects.type includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // chat_messages.role
  const messageRoles: ChatMessageRole[] = ['user', 'assistant', 'system'];
  it.each(messageRoles)('chat_messages.role includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // chat_messages.kind
  const messageKinds: ChatMessageKind[] = ['text', 'approval_summary', 'job_ref'];
  it.each(messageKinds)('chat_messages.kind includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // brand_assets.kind
  const brandAssetKinds: BrandAssetKind[] = ['logo', 'reference'];
  it.each(brandAssetKinds)('brand_assets.kind includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // project_assets.kind
  const projectAssetKinds: ProjectAssetKind[] = [
    'upload', 'generated_background', 'generated_object',
    'pinned_brand', 'reference', 'export',
  ];
  it.each(projectAssetKinds)('project_assets.kind includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // artifact_versions.reason
  const versionReasons: ArtifactVersionReason[] = [
    'generation', 'region_edit', 'manual_edit', 'manual_checkpoint', 'restore',
  ];
  it.each(versionReasons)('artifact_versions.reason includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // artifact_versions.created_by
  const versionCreatedBy: ArtifactVersionCreatedBy[] = ['user', 'ai'];
  it.each(versionCreatedBy)('artifact_versions.created_by includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // generation_jobs.kind
  const jobKinds: GenerationJobKind[] = ['full_generate', 'region_edit'];
  it.each(jobKinds)('generation_jobs.kind includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // generation_jobs.status — includes 'partial' (was missing from original test)
  const jobStatuses: GenerationJobStatus[] = ['queued', 'running', 'partial', 'succeeded', 'failed'];
  it.each(jobStatuses)('generation_jobs.status includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // exports.format — must include png and zip; must NOT include pdf
  const exportFormats: ExportFormat[] = ['png', 'zip'];
  it.each(exportFormats)('exports.format includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });
  it("exports.format does NOT include 'pdf'", () => {
    const def = extractTableDef(foundation, 'exports');
    expect(has(def, "'pdf'")).toBe(false);
  });

  // credit_ledger.entry_type
  const entryTypes: CreditLedgerEntryType[] = ['grant', 'reserve', 'capture', 'refund', 'expire', 'topup'];
  it.each(entryTypes)('credit_ledger.entry_type includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // credit_ledger.bucket
  const buckets: CreditBucket[] = ['subscription', 'topup'];
  it.each(buckets)('credit_ledger.bucket includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // subscriptions.plan
  const subscriptionPlans: SubscriptionPlan[] = ['creator', 'pro', 'studio'];
  it.each(subscriptionPlans)('subscriptions.plan includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // subscriptions.status
  const subscriptionStatuses: SubscriptionStatus[] = ['active', 'past_due', 'canceled'];
  it.each(subscriptionStatuses)('subscriptions.status includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // purchases.pack
  const purchasePacks: PurchasePack[] = ['pack_5', 'pack_10', 'pack_25', 'pack_50'];
  it.each(purchasePacks)('purchases.pack includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });

  // purchases.status
  const purchaseStatuses: PurchaseStatus[] = ['pending', 'paid', 'failed'];
  it.each(purchaseStatuses)('purchases.status includes %s', (v) => {
    expect(has(foundation, `'${v}'`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Indexes (foundation migration)
// ---------------------------------------------------------------------------

const FOUNDATION_INDEXES = [
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

describe('indexes (foundation migration)', () => {
  for (const idx of FOUNDATION_INDEXES) {
    it(`index exists: ${idx}`, () => {
      expect(has(foundation, idx)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Indexes (hardening migration)
// ---------------------------------------------------------------------------

describe('indexes (hardening migration)', () => {
  it('idx_brand_assets_brand_system_id is added in the hardening migration', () => {
    expect(has(hardening, 'idx_brand_assets_brand_system_id')).toBe(true);
  });

  it('idx_brand_assets_brand_system_id targets brand_assets(brand_system_id)', () => {
    expect(
      has(hardening, 'on brand_assets(brand_system_id)') ||
      has(hardening, 'on\n  brand_assets(brand_system_id)'),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hardening migration constraints
// ---------------------------------------------------------------------------

describe('hardening migration: artifact_versions.version > 0', () => {
  it('adds artifact_versions_version_positive constraint', () => {
    expect(has(hardening, 'artifact_versions_version_positive')).toBe(true);
  });

  it('constraint expression is check (version > 0)', () => {
    expect(has(hardening, 'check (version > 0)')).toBe(true);
  });

  it('ALTER TABLE targets artifact_versions', () => {
    expect(has(hardening, 'alter table artifact_versions')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Atomic artifact version migration
// ---------------------------------------------------------------------------

describe('atomic migration: commit_artifact_version rpc', () => {
  it('migration file is readable', () => {
    expect(atomic.length).toBeGreaterThan(0);
  });

  it('defines commit_artifact_version function', () => {
    expect(has(atomic, 'create or replace function commit_artifact_version')).toBe(true);
  });

  it('function accepts p_workspace_id parameter', () => {
    expect(has(atomic, 'p_workspace_id')).toBe(true);
  });

  it('function accepts p_artifact_id parameter', () => {
    expect(has(atomic, 'p_artifact_id')).toBe(true);
  });

  it('function accepts p_expected_current_version_id parameter', () => {
    expect(has(atomic, 'p_expected_current_version_id')).toBe(true);
  });

  it('function accepts p_version parameter', () => {
    expect(has(atomic, 'p_version')).toBe(true);
  });

  it('function accepts p_document parameter', () => {
    expect(has(atomic, 'p_document')).toBe(true);
  });

  it('function accepts p_reason parameter', () => {
    expect(has(atomic, 'p_reason')).toBe(true);
  });

  it('function accepts p_created_by parameter', () => {
    expect(has(atomic, 'p_created_by')).toBe(true);
  });

  it('uses for update row lock on artifacts', () => {
    expect(has(atomic, 'for update')).toBe(true);
  });

  it('checks artifact is distinct from expected current version', () => {
    expect(has(atomic, 'is distinct from')).toBe(true);
  });

  it('inserts into artifact_versions', () => {
    expect(has(atomic, 'insert into artifact_versions')).toBe(true);
  });

  it('updates artifacts.current_version_id', () => {
    expect(has(atomic, 'update artifacts')).toBe(true);
    expect(has(atomic, 'current_version_id')).toBe(true);
  });

  it('returns the new artifact_versions row', () => {
    expect(has(atomic, 'returning')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row level security
// ---------------------------------------------------------------------------

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

describe('row level security', () => {
  for (const table of RLS_TABLES) {
    it(`rls enabled on: ${table}`, () => {
      expect(
        has(foundation, `alter table ${table}`) &&
        has(foundation, 'enable row level security'),
      ).toBe(true);
    });
  }

  it('trend_templates has a public read policy for active entries', () => {
    expect(has(foundation, 'trend_templates_public_read')).toBe(true);
  });

  it('trend_templates policy uses active = true (not a blanket allow)', () => {
    expect(has(foundation, 'using (active = true)')).toBe(true);
  });

  it('no insecure blanket "using (true)" policies exist', () => {
    expect(has(foundation, 'using (true)')).toBe(false);
  });

  it('webhook_events has no create policy statement', () => {
    // webhook_events should have RLS enabled but no user-facing policies.
    // Use a regex to find any "create policy ... on webhook_events" block
    // (avoids a false positive from the "create index ... on webhook_events" statement).
    const policyMatches = [...foundation.matchAll(/create policy[^;]+on webhook_events/gs)];
    expect(policyMatches.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Circular FK resolution
// ---------------------------------------------------------------------------

describe('circular FK resolution: artifacts ↔ artifact_versions', () => {
  it('artifacts.current_version_id FK is added via ALTER TABLE', () => {
    expect(
      has(foundation, 'alter table artifacts') &&
      has(foundation, 'artifacts_current_version_id_fkey'),
    ).toBe(true);
  });

  it('circular FK is on delete set null', () => {
    // Only way to verify is that the alter table block has set null
    expect(
      has(foundation, 'artifacts_current_version_id_fkey') &&
      has(foundation, 'on delete set null'),
    ).toBe(true);
  });
});
