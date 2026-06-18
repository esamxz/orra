import type { BrandContextDto, ApprovalCardDto, ProjectContextMemory } from '@orra/shared';

// ---------------------------------------------------------------------------
// AI provider types
// ---------------------------------------------------------------------------
// Phase 13A: provider abstraction layer. Only 'fake' is active. Real providers
// (Gemini, FLUX, etc.) are added in Phase 13B/13C.

export type AIProviderName = 'fake' | 'gemini' | 'openai';

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

// P0.2: dashboard-time prompt enhancement — no projectId, ratio, or projectType needed
export interface PromptEnhancementInput {
  prompt: string;
  selectedType?: 'single_post' | 'carousel' | 'generic_visual';
  aspectRatio?: string;
  hasAssets?: boolean;
  assetCount?: number;
}

export interface PromptEnhancementOutput {
  enhancedPrompt: string;
  inferredType: 'single_post' | 'carousel' | 'generic_visual';
  cardCount?: number;
}

// Phase 16A: source image input shared by chat/analysis and image editing.
export interface SourceImageInput {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
  assetId: string;
}

export interface ChatInput {
  userMessage: string;
  recentMessages?: RecentChatMessage[];
  projectType?: string;
  projectMemory?: ProjectContextMemory | null;
  currentArtifactSummary?: CurrentArtifactSummary | null;
  /** Images attached to a chat or analysis message. */
  sourceImages?: SourceImageInput[];
}

export interface ChatOutput {
  reply: string;
}

export interface AIProvider {
  readonly name: AIProviderName;
  planText(input: TextPlanRequest): Promise<TextPlanResult>;
  generateImageOrDocument(input: MockDocumentRequest): Promise<MockDocumentResult>;
  enhancePrompt(input: PromptEnhancementInput): Promise<PromptEnhancementOutput>;
  chat(input: ChatInput): Promise<ChatOutput>;
  /**
   * Analyze one or more source images and return a text description/answer.
   * Required for analyze_image intent. May throw AIProviderError with
   * PROVIDER_CAPABILITY_UNSUPPORTED if the configured provider/model cannot
   * process images.
   */
  analyzeImage(input: { prompt: string; sourceImages: SourceImageInput[] }): Promise<ChatOutput>;
}
