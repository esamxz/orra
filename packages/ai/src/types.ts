import type { BrandContextDto, ApprovalCardDto, ProjectContextMemory } from '@orra/shared';

// ---------------------------------------------------------------------------
// AI provider types
// ---------------------------------------------------------------------------
// Phase 13A: provider abstraction layer. Only 'fake' is active. Real providers
// (Gemini, FLUX, etc.) are added in Phase 13B/13C.

export type AIProviderName = 'fake' | 'gemini';

export interface TextPlanRequest {
  projectId: string;
  prompt: string;
  projectType: 'post' | 'carousel';
  ratio: { name: string; w: number; h: number };
  brandContext: BrandContextDto | null;
  approvalCard?: ApprovalCardDto;
  projectMemory?: ProjectContextMemory | null; // Phase 13D: per-project context
}

export interface TextPlanResult {
  summary: string;
  cardCount: number;
  title: string;
  body: string;
  styleNotes: string[];
}

export interface ImageGenerationRequest {
  projectId: string;
  plan: TextPlanResult;
  brandContext: BrandContextDto | null;
}

export interface ImageGenerationResult {
  kind: 'mock_document';
  documentPatchPlan?: unknown;
}

export interface AIProvider {
  readonly name: AIProviderName;
  planText(input: TextPlanRequest): Promise<TextPlanResult>;
  generateImageOrDocument(input: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
