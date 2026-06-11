import type { BrandContextDto, ApprovalCardDto, ProjectContextMemory } from '@orra/shared';

// ---------------------------------------------------------------------------
// AI provider types
// ---------------------------------------------------------------------------
// Phase 13A: provider abstraction layer. Only 'fake' is active. Real providers
// (Gemini, FLUX, etc.) are added in Phase 13B/13C.

export type AIProviderName = 'fake' | 'gemini';

export interface RecentChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Phase 13E: compact artifact summary — never includes assetIds, R2 keys, or URLs
export interface CurrentArtifactSummary {
  cardCount: number;
  ratioName?: string;
  textLayerCount: number;
  imageLayerCount: number;
  shapeLayerCount: number;
  visibleLayerCount: number;
  selectedCardIndex?: number;
  textSnippets: string[]; // max 5, each max 100 chars, from non-hidden text layers
}

export interface TextPlanRequest {
  projectId: string;
  prompt: string;
  projectType: 'post' | 'carousel';
  ratio: { name: string; w: number; h: number };
  brandContext: BrandContextDto | null;
  approvalCard?: ApprovalCardDto;
  projectMemory?: ProjectContextMemory | null; // Phase 13D: per-project context
  recentChatMessages?: RecentChatMessage[];    // Phase 13E: max 6, content truncated to 500 chars
  currentArtifactSummary?: CurrentArtifactSummary | null; // Phase 13E: compact document context
}

// Phase 14A: per-card content for plan-driven artifact generation
export interface PlannedCard {
  headline: string;
  body: string;
  cta?: string;
}

export interface TextPlanResult {
  summary: string;
  cardCount: number;
  title: string;
  body: string;
  styleNotes: string[];
  // Phase 14A: optional per-card content and visual direction
  cards?: PlannedCard[];
  layoutDirection?: string;
  visualDirection?: string;
}

// Stub types for AIProvider.generateImageOrDocument() — the mock document placeholder pathway.
// These are intentionally named to reflect their real purpose (mock document generation),
// freeing the ImageGeneration* names for the real image provider seam added in Phase 15A.
export interface MockDocumentRequest {
  projectId: string;
  plan: TextPlanResult;
  brandContext: BrandContextDto | null;
}

export interface MockDocumentResult {
  kind: 'mock_document';
  documentPatchPlan?: unknown;
}

export interface AIProvider {
  readonly name: AIProviderName;
  planText(input: TextPlanRequest): Promise<TextPlanResult>;
  generateImageOrDocument(input: MockDocumentRequest): Promise<MockDocumentResult>;
}
