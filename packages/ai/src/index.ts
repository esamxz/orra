export type {
  AIProviderName,
  TextPlanRequest,
  TextPlanResult,
  PlannedCard,
  MockDocumentRequest,
  MockDocumentResult,
  AIProvider,
  ChatInput,
  ChatOutput,
  RecentChatMessage,
  CurrentArtifactSummary,
  PromptEnhancementInput,
  PromptEnhancementOutput,
} from './types.js';

export type {
  ImageGenerationKind,
  ImageOutputFormat,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageEditRequest,
  ImageProvider,
} from './imageTypes.js';

export { buildArtifactSummary } from './artifactSummary.js';

export { FakeAIProvider } from './providers/fakeProvider.js';
export { GeminiTextProvider } from './providers/geminiTextProvider.js';
export type { GeminiTextProviderConfig } from './providers/geminiTextProvider.js';
export { OpenAITextProvider } from './providers/openAITextProvider.js';
export type { OpenAITextProviderConfig } from './providers/openAITextProvider.js';

export { FakeImageProvider } from './providers/fakeImageProvider.js';
export { GeminiImageProvider } from './providers/geminiImageProvider.js';
export type { GeminiImageProviderConfig } from './providers/geminiImageProvider.js';
export { DEFAULT_GEMINI_IMAGE_MODEL } from './providers/geminiImageProvider.js';
export { OpenAIImageProvider } from './providers/openAIImageProvider.js';
export type { OpenAIImageProviderConfig } from './providers/openAIImageProvider.js';
// FluxImageProvider retained for reference — not routed by createImageProviderRouter since D5.2
export { FluxImageProvider } from './providers/fluxImageProvider.js';
export type { FluxImageProviderConfig } from './providers/fluxImageProvider.js';

export { AIProviderError, isAIProviderError } from './errors.js';
export type { AIProviderErrorCode } from './errors.js';

export type { AIProviderObservation, AIProviderObserver } from './observability.js';
export { NoopAIProviderObserver } from './observability.js';

export { TextPlanResultSchema, PlannedCardSchema, PromptEnhancementResultSchema } from './schemas.js';

export { extractJsonObjectFromText } from './json.js';
export { normalizeTextPlanResult } from './normalization.js';
export { resolveImageRequestSize } from './imageSize.js';
export type { ImageSizeInput, ImageSizeProvider } from './imageSize.js';
export { buildTextPlanPrompt, buildEnhancementPrompt } from './prompts.js';

export type { AIProviderRouter, AIProviderRouterConfig } from './router.js';
export { createAIProviderRouter } from './router.js';

export type { ImageProviderRouter, ImageProviderRouterConfig } from './imageRouter.js';
export { createImageProviderRouter } from './imageRouter.js';
