import type { AIProvider, TextPlanRequest, TextPlanResult, PlannedCard, ImageGenerationRequest, ImageGenerationResult } from '../types.js';

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

  async generateImageOrDocument(_input: ImageGenerationRequest): Promise<ImageGenerationResult> {
    return { kind: 'mock_document' };
  }
}
