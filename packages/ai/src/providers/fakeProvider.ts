import type { AIProvider, TextPlanRequest, TextPlanResult, PlannedCard, MockDocumentRequest, MockDocumentResult, PromptEnhancementInput, PromptEnhancementOutput, ChatInput, ChatOutput, SourceImageInput } from '../types.js';

// ---------------------------------------------------------------------------
// Fake AI provider
// ---------------------------------------------------------------------------
// Phase 13A: deterministic, no network calls. Replicates the topic-parsing
// logic that previously lived inline in mockGenerationConsumer. Produces the
// same output as before; no visible change to generated artifacts.
//
// Phase 14A: now generates per-card content (cards[]) and visualDirection so
// the artifact builder can use real plan content in every generated card.
//
// Real providers replace this in Phase 13B/13C.

export class FakeAIProvider implements AIProvider {
  readonly name = 'fake' as const;

  async planText(input: TextPlanRequest): Promise<TextPlanResult> {
    const raw = input.approvalCard?.summaryLine ?? input.prompt;

    // Memory topic wins as the title if available; otherwise parse the summary line
    const titleFromMemory = input.projectMemory?.topic;
    const title = titleFromMemory
      ?? (raw.replace(/^Ready to create\s*(a\s*)?/i, '').trim() || 'design');

    const cardCount = input.projectType === 'carousel' ? 3 : 1;

    const styleNotes: string[] = [];
    if (input.brandContext) {
      if (input.brandContext.tone) {
        styleNotes.push(`tone: ${input.brandContext.tone}`);
      }
      if (input.brandContext.visualDirection) {
        styleNotes.push(`style: ${input.brandContext.visualDirection}`);
      }
    }

    // Memory enrichment — memory tone only added when brandContext has no tone
    if (input.projectMemory) {
      if (input.projectMemory.platform) {
        styleNotes.push(`Optimized for ${input.projectMemory.platform}`);
      }
      if (input.projectMemory.tone && !input.brandContext?.tone) {
        styleNotes.push(`tone: ${input.projectMemory.tone}`);
      }
    }

    // Phase 13E: artifact summary context — compact, deterministic
    if (input.currentArtifactSummary && input.currentArtifactSummary.cardCount > 0) {
      styleNotes.push(
        `existing: ${input.currentArtifactSummary.cardCount} card(s), ${input.currentArtifactSummary.textLayerCount} text layer(s)`
      );
    }

    // Phase 13E: recent chat context — only the last user message, deterministic
    if (input.recentChatMessages && input.recentChatMessages.length > 0) {
      const lastUser = [...input.recentChatMessages].reverse().find((m) => m.role === 'user');
      if (lastUser) {
        styleNotes.push(`context: ${lastUser.content.slice(0, 100)}`);
      }
    }

    const body = `Key insights on ${title}. This content was planned by the fake provider and is fully editable.`;

    // Phase 14A: per-card content — deterministic, derived from title and cardCount
    const cards: PlannedCard[] = [];
    for (let i = 0; i < cardCount; i++) {
      const headline = i === 0 ? title : `${title} — Part ${i + 1}`;
      const cardBody = i === 0 ? body : `Insight ${i + 1} for ${title}.`;
      const isLast = i === cardCount - 1;
      cards.push({
        headline,
        body: cardBody,
        ...(isLast ? { cta: 'Learn more' } : {}),
      });
    }

    // Phase 14A: visualDirection from brand context or project memory
    const visualDirection =
      (input.brandContext?.visualDirection || undefined) ??
      (input.projectMemory?.visualDirection || undefined);

    return {
      summary: raw,
      cardCount,
      title,
      body,
      styleNotes,
      cards,
      ...(visualDirection !== undefined ? { visualDirection } : {}),
    };
  }

  async generateImageOrDocument(_input: MockDocumentRequest): Promise<MockDocumentResult> {
    return { kind: 'mock_document' };
  }

  async chat(_input: ChatInput): Promise<ChatOutput> {
    return {
      reply: "[Fake AI] Try: 'Create a post about discipline' or 'Make a 5-card carousel about productivity'.",
    };
  }

  async analyzeImage(input: { prompt: string; sourceImages: SourceImageInput[] }): Promise<ChatOutput> {
    const count = input.sourceImages.length;
    const totalBytes = input.sourceImages.reduce((sum, img) => sum + img.bytes.byteLength, 0);
    return {
      reply: `[Fake AI] I see ${count} image(s) (${totalBytes} bytes). You asked: "${input.prompt}". In a real vision model this would be a descriptive analysis.`,
    };
  }

  async enhancePrompt(input: PromptEnhancementInput): Promise<PromptEnhancementOutput> {
    const normalized = input.prompt.replace(/\s+/g, ' ').trim();
    const inferredType = fakeDetectType(normalized, input.selectedType);
    const cardCount = inferredType === 'carousel' ? fakeExtractCardCount(normalized) : undefined;
    const tone = fakeDetectTone(normalized);
    const ratioLabel = input.aspectRatio ? `${input.aspectRatio} ` : '';
    const wordCount = normalized.split(/\s+/).length;

    let enhancedPrompt: string;

    if (wordCount > 80) {
      enhancedPrompt = normalized;
    } else if (inferredType === 'carousel') {
      const count = cardCount ?? 5;
      const topic = fakeExtractTopic(normalized);
      enhancedPrompt =
        `Create a ${count}-card carousel about ${topic}. ` +
        `Use a ${tone} tone and clear visual direction. ` +
        `Structure it as: Card 1 hook, middle cards key points, final card takeaway. ` +
        `Keep each card focused, readable, and visually consistent.`;
    } else {
      const topic = fakeExtractTopic(normalized);
      enhancedPrompt =
        `Create a ${tone} ${ratioLabel}social post about ${topic}. ` +
        `Use a bold minimal layout with strong visual contrast. ` +
        `Include a strong headline, short supporting text, and a clear focal point. ` +
        `Keep the design clean and focused.`;
    }

    if (input.hasAssets) {
      enhancedPrompt +=
        ' Use the attached image(s) as visual reference or source material.' +
        ' Preserve important details. Do not alter logos or brand marks.';
    }

    return {
      enhancedPrompt: enhancedPrompt.trim(),
      inferredType,
      ...(cardCount !== undefined ? { cardCount } : {}),
    };
  }
}

// ---------------------------------------------------------------------------
// Enhancement helpers — deterministic, no network, shared with FakeAIProvider
// ---------------------------------------------------------------------------

const FAKE_ENHANCEMENT_TONES = [
  'professional', 'clean', 'minimal', 'bold', 'playful', 'fun',
  'motivational', 'serious', 'editorial', 'soft', 'raw', 'vibrant',
];

function fakeDetectType(
  normalized: string,
  selectedType?: string,
): 'single_post' | 'carousel' | 'generic_visual' {
  if (selectedType === 'single_post') return 'single_post';
  if (selectedType === 'carousel') return 'carousel';
  if (selectedType === 'generic_visual') return 'generic_visual';
  if (/\b(carousel|slides?|cards?)\b/i.test(normalized)) return 'carousel';
  return 'single_post';
}

function fakeExtractCardCount(normalized: string): number {
  const match = normalized.match(/\b(\d+)\s*(?:card|slide|page)s?\b/i);
  if (match) {
    const n = parseInt(match[1], 10);
    return Math.min(10, Math.max(2, n));
  }
  return 5;
}

function fakeDetectTone(normalized: string): string {
  for (const kw of FAKE_ENHANCEMENT_TONES) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(normalized)) return kw;
  }
  return 'clean, focused';
}

function fakeExtractTopic(normalized: string): string {
  const aboutMatch = normalized.match(/\babout\s+(.+?)(?=\s*(?:\.|,|;|$))/i);
  if (aboutMatch) {
    const topic = aboutMatch[1].trim();
    return topic.length > 120 ? topic.slice(0, 120) : topic;
  }
  const stripped = normalized
    .replace(/^(?:create|make|design|build|generate|write|show|craft|produce)\s+/i, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/^(?:\d+[- ]?(?:card|slide|page)s?\s+)?(?:carousel|post|social post|image|visual)\s+/i, '')
    .trim();
  const result = stripped || normalized;
  return result.length > 120 ? result.slice(0, 120) : result;
}
