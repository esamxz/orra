// Database row types for Orra.
// These are hand-written to match the migration schema.
// Do not use Supabase codegen in this phase — add it later when the
// local Supabase instance is running and types can be generated from the live DB.

// Ratio and RatioName come from packages/shared (the canonical source).
// They are re-exported here so db consumers have a single import point.
export type { Ratio, RatioName } from '@orra/shared';

// RatioJson is an alias for Ratio kept for backward compatibility.
// Prefer importing Ratio directly.
import type { Ratio } from '@orra/shared';
export type RatioJson = Ratio;

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ---------------------------------------------------------------------------
// Value-set types (mirror check constraints in the migration)
// ---------------------------------------------------------------------------

export type WorkspaceType = 'personal' | 'team';
export type WorkspacePlan = 'free' | 'creator' | 'pro' | 'studio';

export type WorkspaceMemberRole = 'owner' | 'admin' | 'member';

export type ProjectType = 'post' | 'carousel' | 'from_assets';

export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type ChatMessageKind = 'text' | 'approval_summary' | 'job_ref';

export type BrandAssetKind = 'logo' | 'reference';

export type ProjectAssetKind =
  | 'upload'
  | 'generated_background'
  | 'generated_object'
  | 'pinned_brand'
  | 'reference'
  | 'export';

export type ArtifactVersionReason =
  | 'generation'
  | 'region_edit'
  | 'manual_edit'
  | 'manual_checkpoint'
  | 'restore';

export type ArtifactVersionCreatedBy = 'user' | 'ai';

export type GenerationJobKind = 'full_generate' | 'region_edit';
export type GenerationJobStatus = 'queued' | 'running' | 'partial' | 'succeeded' | 'failed';

export type ExportFormat = 'png' | 'zip';

export type CreditLedgerEntryType = 'grant' | 'reserve' | 'capture' | 'refund' | 'expire' | 'topup';
export type CreditBucket = 'subscription' | 'topup';

export type SubscriptionPlan = 'creator' | 'pro' | 'studio';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

export type PurchasePack = 'pack_5' | 'pack_10' | 'pack_25' | 'pack_50';
export type PurchaseStatus = 'pending' | 'paid' | 'failed';

// ---------------------------------------------------------------------------
// Row types
// One interface per table, named <TableSingular>Row.
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  clerk_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  type: WorkspaceType;
  owner_user_id: string | null;
  plan: WorkspacePlan;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRole;
  created_at: string;
  updated_at: string;
}

export interface BrandSystemRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  tone_of_voice: string | null;
  visual_direction: string | null;
  rules: string | null;
  palette: Json;    // [{hex: string, role: string}]
  typography: Json; // {fontFamily?: string, ...}
  created_at: string;
  updated_at: string;
}

export type AssetStatus = 'pending_upload' | 'uploaded' | 'failed';

export interface BrandAssetRow {
  id: string;
  workspace_id: string;
  brand_system_id: string;
  kind: BrandAssetKind;
  r2_key: string;
  content_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  status: AssetStatus;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  type: ProjectType;
  ratio: RatioJson;
  brand_system_id: string | null;
  source_template_id: string | null;
  autosave_state: Json | null;
  created_at: string;
  updated_at: string;
}

export interface ChatThreadRow {
  id: string;
  workspace_id: string;
  project_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  workspace_id: string;
  thread_id: string;
  role: ChatMessageRole;
  kind: ChatMessageKind;
  content: string | null;
  metadata: Json;
  seq: number | null;
  created_at: string;
}

export interface ProjectAssetRow {
  id: string;
  workspace_id: string;
  project_id: string;
  kind: ProjectAssetKind;
  r2_key: string;
  content_hash: string | null;
  content_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  source_prompt: string | null;
  analysis: Json | null;
  status: AssetStatus;
  created_at: string;
}

export interface ArtifactRow {
  id: string;
  workspace_id: string;
  project_id: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

// document is the full ArtifactDocument JSON.
// Cards and layers live entirely inside this field — they are not separate rows.
export interface ArtifactVersionRow {
  id: string;
  workspace_id: string;
  artifact_id: string;
  version: number;
  document: Json;                      // full ArtifactDocument; validated by Zod/kernel
  reason: ArtifactVersionReason;
  created_by: ArtifactVersionCreatedBy;
  brand_context_snapshot: Json | null; // brand state captured at generation time
  created_at: string;
}

export interface GenerationJobRow {
  id: string;
  workspace_id: string;
  project_id: string;
  kind: GenerationJobKind;
  status: GenerationJobStatus;
  idempotency_key: string | null;
  reserved_credits: number;
  captured_credits: number;
  plan: Json | null;
  error: Json | null;
  result_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportRow {
  id: string;
  workspace_id: string;
  project_id: string;
  format: ExportFormat;
  r2_key: string;
  ratio: RatioJson | null;
  created_at: string;
}

export interface TrendTemplateRow {
  id: string;
  title: string;
  prompt: string;
  description: string | null;
  reference_r2_key: string | null;
  tags: string[];
  active: boolean;
  category: string | null;
  project_type: string;         // 'post' | 'carousel'
  ratio_hint: string | null;
  platform_hint: string | null;
  asset_hints: string[];
  preview_variant: string;
  is_featured: boolean;
  sort_index: number;
  created_at: string;
  updated_at: string;
}

export interface CreditLedgerRow {
  id: string;
  workspace_id: string;
  entry_type: CreditLedgerEntryType;
  bucket: CreditBucket;
  amount: number;
  job_id: string | null;
  expires_at: string | null;
  metadata: Json;
  created_at: string;
}

export interface CreditBalanceRow {
  workspace_id: string;
  subscription_available: number;
  topup_available: number;
  reserved: number;
  updated_at: string;
}

export interface SubscriptionRow {
  id: string;
  workspace_id: string;
  dodo_subscription_id: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseRow {
  id: string;
  workspace_id: string;
  dodo_payment_id: string | null;
  pack: PurchasePack;
  credits_granted: number;
  status: PurchaseStatus;
  created_at: string;
  updated_at: string;
}

export interface WebhookEventRow {
  id: string;
  provider: string;
  event_id: string;
  processed_at: string | null;
  payload: Json | null;
  created_at: string;
}

// Phase 13D: project-scoped structured memory (one row per project)
export interface ProjectContextMemoryRow {
  id: string;
  workspace_id: string;
  project_id: string;
  summary: string;
  topic: string | null;
  audience: string | null;
  tone: string | null;
  platform: string | null;
  format: string | null;
  carousel_goal: string | null;
  slide_count: number | null;
  visual_direction: string | null;
  approved_direction: string | null;
  rejected_ideas: Json;    // string[] at runtime; cast after Array.isArray guard
  user_preferences: Json;  // string[] at runtime
  constraints: Json;       // string[] at runtime
  created_at: string;
  updated_at: string;
}
