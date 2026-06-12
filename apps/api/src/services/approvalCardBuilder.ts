// ---------------------------------------------------------------------------
// Approval Card Builder
// ---------------------------------------------------------------------------
// Deterministic builder that creates a lightweight ApprovalCardDto from a
// user message, Director intent result, and project metadata.
//
// This is a skeleton seam. Real AI planning will replace the deterministic
// defaults in a later phase.
//
// Rules:
//   - No AI provider calls.
//   - No model names, token counts, or image prompts in output.
//   - Calm, short UI copy. No em dashes or unnecessary dash punctuation.
//   - CTA defaults to "Not set". Missing CTA never blocks generation.
// ---------------------------------------------------------------------------

import type { ApprovalCardDto, ApprovalAction, BrandContextDto } from '@orra/shared';
import type { DirectorIntentResult } from './directorIntentService.js';

export interface BuildApprovalCardInput {
  /** The raw user message content. */
  content: string;
  /** The classified Director intent. */
  intent: DirectorIntentResult;
  /** Project type (post | carousel | from_assets). */
  projectType: string;
  /** Project ratio name (e.g. "4:5"). */
  ratioName: string;
  /** Optional brand context attached to the project. */
  brandContext?: BrandContextDto | null;
  /** Project name, used for fallback topic extraction. */
  projectName?: string;
  /** Compact project memory summary (Phase 14D). Max 120 chars shown to user. */
  memorySummary?: string | null;
}

const DEFAULT_STYLE = 'calm, premium, focused';
const DEFAULT_ASSUMPTIONS = [
  'Using a clean visual direction.',
  'Readable editable text will be rendered by Orra.',
];
const ALL_ACTIONS: ApprovalAction[] = [
  'approve_and_create',
  'add_cta',
  'edit_direction',
  'cancel',
];

function buildSummaryLine(input: BuildApprovalCardInput): string {
  const hint = input.intent.generationHint;
  const topic = hint?.rawTopic ?? extractTopicFallback(input.content, input.projectName);
  const typeLabel = hint?.artifactType === 'carousel' ? 'carousel' : 'post';
  const cardCount = hint?.requestedCardCount;

  if (hint?.artifactType === 'carousel' && cardCount && cardCount > 1) {
    return `Ready to create a ${cardCount}-card ${typeLabel} about ${topic}.`;
  }

  return `Ready to create a ${typeLabel} about ${topic}.`;
}

function extractTopicFallback(content: string, projectName?: string): string {
  // Try to extract a topic after "about", "on", "for"
  const aboutMatch = content.match(/(?:about|on|for)\s+(.+?)(?:\.|$)/i);
  if (aboutMatch) {
    const topic = aboutMatch[1].trim();
    if (topic.length > 1 && topic.length < 80) return topic;
  }

  // Clean generation keywords and return remainder
  let cleaned = content
    .replace(/\b(create|make|design|build|generate|draft|a|an|the|please|some|this|that|me|us|for|about|on)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Reject if the result is just an artifact type word (post, carousel, card, etc.)
  const artifactOnlyWords = ['post', 'carousel', 'card', 'cards', 'slide', 'slides'];
  if (
    cleaned.length > 1 &&
    cleaned.length < 80 &&
    !artifactOnlyWords.includes(cleaned.toLowerCase())
  ) {
    return cleaned;
  }

  // Fallback to project name or generic topic
  return projectName && projectName.length > 1 ? projectName : 'your topic';
}

function buildBrandLabel(brandContext: BrandContextDto | null | undefined): string {
  if (brandContext?.name) {
    return brandContext.name;
  }
  return 'No brand selected';
}

function buildAssumptions(
  brandContext: BrandContextDto | null | undefined,
  baseAssumptions: string[]
): string[] {
  const assumptions = [...baseAssumptions];
  if (brandContext?.name) {
    assumptions.push('Using your selected brand direction.');
    if (brandContext.tone) {
      assumptions.push(`Tone: ${brandContext.tone.slice(0, 60)}`);
    }
  } else {
    assumptions.push("Using Orra's default creative direction.");
  }
  return assumptions;
}

/**
 * Build a deterministic approval card from the given inputs.
 *
 * This function is pure: no side effects, no AI calls, no DB access.
 */
export function buildApprovalCard(input: BuildApprovalCardInput): ApprovalCardDto {
  const summaryLine = buildSummaryLine(input);
  const style = DEFAULT_STYLE;
  const format = input.ratioName;
  const brand = buildBrandLabel(input.brandContext);
  const cta = 'Not set';
  const assumptions = buildAssumptions(input.brandContext, DEFAULT_ASSUMPTIONS);
  const isCarousel = input.intent.generationHint?.artifactType === 'carousel';
  const actions: ApprovalAction[] = isCarousel
    ? ['approve_and_create', 'create_card_by_card', 'add_cta', 'edit_direction', 'cancel']
    : [...ALL_ACTIONS];

  // Phase 14D: surface direction hints from intent, brand, and memory.
  // These fields are optional and deterministic — no AI calls.
  const cardCount = input.intent.generationHint?.requestedCardCount ?? undefined;

  const visualDirection = input.brandContext?.visualDirection
    ? input.brandContext.visualDirection.slice(0, 80)
    : undefined;

  // brandContext.rules is a single string — wrap as one-item array if non-empty.
  const styleNotesRaw = input.brandContext?.rules;
  const styleNotes: string[] | undefined = (() => {
    if (!styleNotesRaw) return undefined;
    const trimmed = styleNotesRaw.trim().slice(0, 80);
    return trimmed.length > 0 ? [trimmed] : undefined;
  })();

  const memorySummary = input.memorySummary
    ? input.memorySummary.slice(0, 120)
    : undefined;

  return {
    summaryLine,
    style,
    format,
    brand,
    cta,
    assumptions,
    actions,
    ...(cardCount !== undefined && { cardCount }),
    ...(visualDirection !== undefined && { visualDirection }),
    ...(styleNotes !== undefined && { styleNotes }),
    ...(memorySummary !== undefined && { memorySummary }),
  };
}
