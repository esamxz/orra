import type { ArtifactDocument } from '@orra/shared';
export type { ApprovalCardDto } from '@orra/shared';

// ---------------------------------------------------------------------------
// Frontend API types
// ---------------------------------------------------------------------------
// These mirror backend DTOs but are owned by the frontend layer.
// They do not import server internals.

export interface Ratio {
  name: string;
  w: number;
  h: number;
}

export interface Project {
  id: string;
  name: string;
  type: 'post' | 'carousel' | 'from_assets';
  ratio: Ratio;
  brandSystemId: string | null;
  sourceTemplateId: string | null;
  currentArtifactId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  type: 'post' | 'carousel' | 'from_assets';
  ratio: Ratio;
  brandSystemId?: string;
}

export interface UpdateProjectInput {
  name?: string;
  ratio?: Ratio;
  brandSystemId?: string | null;
}

export interface ArtifactApiResponse {
  artifactId: string;
  projectId: string;
  currentVersionId: string;
  version: number;
  document: ArtifactDocument;
  createdAt: string;
  updatedAt: string;
}

export interface ApplyActionInput {
  baseVersion: number;
  action: unknown;
}

export interface ApplyActionApiResponse {
  artifactId: string;
  projectId: string;
  currentVersionId: string;
  version: number;
  document: ArtifactDocument;
  artifactVersionNumber: number;
}

// ---------------------------------------------------------------------------
// Chat types
// ---------------------------------------------------------------------------

export interface ChatMessageDto {
  id: string;
  projectId: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  kind: 'text' | 'approval_summary' | 'job_ref';
  content: string | null;
  metadata: Record<string, unknown>;
  seq: number | null;
  createdAt: string;
}

export interface AppendProjectMessageInput {
  content: string;
}

export interface ListProjectMessagesParams {
  limit?: number;
}

// ---------------------------------------------------------------------------
// Director intent types
// ---------------------------------------------------------------------------
// These mirror the backend intent DTOs.

export type DirectorMode = 'conversation' | 'generation';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface GenerationHint {
  artifactType?: 'post' | 'carousel';
  requestedCardCount?: number;
  rawTopic?: string;
}

export interface DirectorIntentResult {
  mode: DirectorMode;
  confidence: ConfidenceLevel;
  reason: string;
  generationHint?: GenerationHint;
}

export interface AppendProjectMessageResponse {
  message: ChatMessageDto;
  intent: DirectorIntentResult;
  approvalMessage?: ChatMessageDto;
}

// ---------------------------------------------------------------------------
// Approval action types
// ---------------------------------------------------------------------------

export type ApprovalAction = 'approve_and_create' | 'cancel' | 'add_cta' | 'edit_direction';

export interface ApprovalActionInput {
  action: ApprovalAction;
  value?: string;
}

export interface ApprovalActionResponse {
  ok: true;
  data: ChatMessageDto;
}

// ---------------------------------------------------------------------------
// Generation job types
// ---------------------------------------------------------------------------

export type GenerationJobStatus = 'queued' | 'running' | 'partial' | 'succeeded' | 'failed';
export type GenerationJobKind = 'full_generate' | 'region_edit';

export interface GenerationJobDto {
  id: string;
  projectId: string;
  status: GenerationJobStatus;
  kind: GenerationJobKind;
  resultVersionId: string | null;
  reservedCredits: number;
  capturedCredits: number;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGenerationJobInput {
  projectId: string;
  approvalMessageId: string;
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Brand system types
// ---------------------------------------------------------------------------

export interface BrandSystemDto {
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

export interface CreateBrandSystemInput {
  name: string;
  description?: string;
  tone?: string;
  visualDirection?: string;
  rules?: string;
  colors?: Record<string, string>;
  typography?: Record<string, unknown>;
  logoAssetId?: string | null;
}

export interface UpdateBrandSystemInput {
  name?: string;
  description?: string;
  tone?: string;
  visualDirection?: string;
  rules?: string;
  colors?: Record<string, string>;
  typography?: Record<string, unknown>;
  logoAssetId?: string | null;
}

export interface ListBrandSystemsParams {
  limit?: number;
  search?: string;
}


export interface CreditBalanceDto {
  workspaceId: string;
  monthlyRemaining: number;
  topupRemaining: number;
  totalRemaining: number;
  reserved: number;
  resetAt: string | null;
}

export interface CreditLedgerEntryDto {
  id: string;
  workspaceId: string;
  entryType: string;
  bucket: string;
  amount: number;
  jobId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreditStatusResponse {
  balance: CreditBalanceDto;
  recentLedger: CreditLedgerEntryDto[];
}

export interface ListCreditLedgerParams {
  limit?: number;
}

// ---------------------------------------------------------------------------
// Asset upload types
// ---------------------------------------------------------------------------

export interface AssetDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  brandSystemId: string | null;
  kind: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  r2Key: string;
  status: string;
  createdAt: string;
}

export interface UploadIntentInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: string;
}

export interface UploadIntentResponse {
  asset: AssetDto;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
}

export interface ConfirmAssetUploadInput {
  expectedSizeBytes?: number;
  expectedContentType?: string;
}
