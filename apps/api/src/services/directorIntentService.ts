// ---------------------------------------------------------------------------
// Director Intent Service
// ---------------------------------------------------------------------------
// Deterministic rule-based classifier that splits user messages into two modes:
//   - conversation: brainstorming, questions, context, discussion
//   - generation: clear creation actions (create a post, make a carousel, etc.)
//
// This is a skeleton seam. Real AI intent classification will replace the
// rule-based logic in a later phase.
//
// Rules:
//   - No AI provider calls.
//   - No approval card creation.
//   - No generation job enqueue.
//   - No credit reservation.
// ---------------------------------------------------------------------------

export type DirectorMode = 'conversation' | 'generation';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface GenerationHint {
  /** Detected artifact type if generation mode. */
  artifactType?: 'post' | 'carousel';
  /** Number of cards requested for carousels. */
  requestedCardCount?: number;
  /** Raw topic extracted from the prompt. */
  rawTopic?: string;
}

export interface DirectorIntentResult {
  mode: DirectorMode;
  confidence: ConfidenceLevel;
  reason: string;
  generationHint?: GenerationHint;
}

// ---------------------------------------------------------------------------
// Rule patterns
// ---------------------------------------------------------------------------

/** Strong generation keywords that almost always signal creation intent. */
const STRONG_GENERATION_KEYWORDS = [
  'create',
  'make',
  'design',
  'build',
  'generate',
  'draft',
];

/** Medium generation keywords that need additional context. */
const MEDIUM_GENERATION_KEYWORDS = [
  'turn this into',
  'turn it into',
  'make this a',
  'make this into',
  'create the final',
  'build the final',
  'design the final',
];

/** Artifact type keywords. */
const POST_KEYWORDS = ['post', 'single post'];
const CAROUSEL_KEYWORDS = ['carousel', 'carousels', 'cards', 'slides'];

/** Conversation-only keywords that suppress generation classification. */
const CONVERSATION_KEYWORDS = [
  'what do you think',
  'help me brainstorm',
  'brainstorm',
  'discuss',
  'explain',
  'question',
  'questions',
  'help me think',
  'give me ideas',
  'tell me about',
  'what is',
  'how do',
  'how to',
  'can you explain',
  'why is',
  'should i',
  'do you think',
  'your thoughts',
  'opinion',
  'suggestion',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/[.!?]+$/g, '');
}

function containsAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

function extractCardCount(text: string): number | undefined {
  // Match patterns like "5-card", "5 card", "5 cards", "make 5 cards"
  const match = text.match(/\b(\d{1,2})[\s\-]?(?:card|cards|slide|slides)\b/);
  if (match) {
    const count = parseInt(match[1], 10);
    if (count >= 1 && count <= 20) return count;
  }
  // Also match "make 5 cards" where the number precedes the keyword
  const looseMatch = text.match(/\b(\d{1,2})\s+(?:card|cards|slide|slides)\b/);
  if (looseMatch) {
    const count = parseInt(looseMatch[1], 10);
    if (count >= 1 && count <= 20) return count;
  }
  return undefined;
}

function extractTopic(text: string): string | undefined {
  // Try to extract a topic after "about", "on", "for"
  const aboutMatch = text.match(/(?:about|on|for)\s+(.+?)(?:\.|$)/i);
  if (aboutMatch) {
    const topic = aboutMatch[1].trim();
    if (topic.length > 1 && topic.length < 80) return topic;
  }
  // Fallback: remove generation keywords and return the remainder
  let cleaned = text
    .replace(/\b(create|make|design|build|generate|draft|a|an|the|please|some|this|that|me|us|for|about|on)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length > 1 && cleaned.length < 80) return cleaned;
  return undefined;
}

function detectArtifactType(text: string): 'post' | 'carousel' | undefined {
  if (containsAny(text, CAROUSEL_KEYWORDS)) return 'carousel';
  if (containsAny(text, POST_KEYWORDS)) return 'post';
  return undefined;
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

export function classifyDirectorIntent(text: string): DirectorIntentResult {
  const normalized = normalizeText(text);

  // Empty or whitespace-only content should have been rejected by schema,
  // but guard here just in case.
  if (!normalized) {
    return {
      mode: 'conversation',
      confidence: 'low',
      reason: 'Empty input cannot be classified.',
    };
  }

  // Check for explicit conversation signals first.
  if (containsAny(normalized, CONVERSATION_KEYWORDS)) {
    return {
      mode: 'conversation',
      confidence: 'high',
      reason: 'Detected brainstorming or discussion language.',
    };
  }

  // Check for strong generation keywords.
  const hasStrongGeneration = containsAny(normalized, STRONG_GENERATION_KEYWORDS);
  const hasMediumGeneration = containsAny(normalized, MEDIUM_GENERATION_KEYWORDS);

  if (hasStrongGeneration || hasMediumGeneration) {
    const artifactType = detectArtifactType(normalized);
    const requestedCardCount = artifactType === 'carousel' ? extractCardCount(normalized) : undefined;
    const rawTopic = extractTopic(text);

    return {
      mode: 'generation',
      confidence: hasStrongGeneration ? 'high' : 'medium',
      reason: hasStrongGeneration
        ? 'Detected clear creation intent.'
        : 'Detected creation intent with contextual phrasing.',
      generationHint: {
        artifactType,
        requestedCardCount,
        rawTopic,
      },
    };
  }

  // Ambiguous: no strong signals either way.
  return {
    mode: 'conversation',
    confidence: 'low',
    reason: 'No clear creation or discussion signals found. Defaulting to conversation.',
  };
}
