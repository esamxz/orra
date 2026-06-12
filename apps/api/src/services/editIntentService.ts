// ---------------------------------------------------------------------------
// Edit Intent Service
// ---------------------------------------------------------------------------
// Deterministic rule-based classifier for chat-directed artifact edits.
// Returns EditIntent when a user message matches a supported edit pattern,
// or null when no edit pattern matches (falls through to generation/conversation).
//
// Rules:
//   - No AI provider calls.
//   - No artifact mutation.
//   - No credit reservation.
// ---------------------------------------------------------------------------

export type EditIntentType =
  | 'text_content'
  | 'text_size_increase'
  | 'text_size_decrease'
  | 'card_add'
  | 'card_duplicate'
  | 'card_delete'
  | 'card_background_dark'
  | 'card_background_light'
  | 'unsupported_image_edit';

export interface EditIntent {
  /** The specific edit operation detected. */
  type: EditIntentType;
  /** Target text layer role — only for text_content edits. */
  targetRole?: 'title' | 'cta';
  /** New text content — only for text_content edits. */
  newContent?: string;
}

// ---------------------------------------------------------------------------
// Pattern table
// ---------------------------------------------------------------------------

interface EditPattern {
  regex: RegExp;
  handler: (match: RegExpMatchArray) => EditIntent;
}

const EDIT_PATTERNS: EditPattern[] = [
  // Text content: title
  {
    regex: /^(?:change|set|update)\s+(?:the\s+)?title\s+to[:\s]+["']?(.+?)["']?$/i,
    handler: (m) => ({ type: 'text_content', targetRole: 'title', newContent: m[1].trim() }),
  },
  // Text content: CTA
  {
    regex: /^(?:change|set|update)\s+(?:the\s+)?(?:cta|call[\s-]to[\s-]action|button)\s+to[:\s]+["']?(.+?)["']?$/i,
    handler: (m) => ({ type: 'text_content', targetRole: 'cta', newContent: m[1].trim() }),
  },
  {
    regex: /^make\s+(?:the\s+)?(?:cta|button)\s+(?:say|read)[:\s]+["']?(.+?)["']?$/i,
    handler: (m) => ({ type: 'text_content', targetRole: 'cta', newContent: m[1].trim() }),
  },
  // Text size: increase
  {
    regex: /^make\s+(?:the\s+)?(?:text|font|title)\s+(?:bigger|larger|bolder)/i,
    handler: () => ({ type: 'text_size_increase' }),
  },
  {
    regex: /^(?:increase|enlarge|bump\s+up)\s+(?:the\s+)?(?:text|font)\s+size/i,
    handler: () => ({ type: 'text_size_increase' }),
  },
  // Text size: decrease
  {
    regex: /^make\s+(?:the\s+)?(?:text|font|title)\s+(?:smaller|tinier)/i,
    handler: () => ({ type: 'text_size_decrease' }),
  },
  {
    regex: /^(?:decrease|reduce|shrink)\s+(?:the\s+)?(?:text|font)\s+size/i,
    handler: () => ({ type: 'text_size_decrease' }),
  },
  // Card: duplicate
  {
    regex: /^(?:duplicate|copy|clone)\s+(?:this|the|current)?\s*card/i,
    handler: () => ({ type: 'card_duplicate' }),
  },
  // Card: delete
  {
    regex: /^(?:delete|remove)\s+(?:this|the|current)?\s*card/i,
    handler: () => ({ type: 'card_delete' }),
  },
  // Card: add
  {
    regex: /^add\s+(?:a|an|another|new)?\s*card/i,
    handler: () => ({ type: 'card_add' }),
  },
  // Background: dark
  {
    regex: /^make\s+(?:the\s+)?background\s+(?:dark(?:er)?|black|deep)/i,
    handler: () => ({ type: 'card_background_dark' }),
  },
  // Background: light
  {
    regex: /^make\s+(?:the\s+)?background\s+(?:light(?:er)?|white|bright(?:er)?)/i,
    handler: () => ({ type: 'card_background_light' }),
  },
  // Unsupported image edits — return intent so chatService can reply gracefully
  {
    regex: /^(?:remove|cut\s+out)\s+(?:the\s+)?(?:background\s+(?:from|of)|image\s+background)/i,
    handler: () => ({ type: 'unsupported_image_edit' }),
  },
  {
    regex: /^(?:replace|swap)\s+(?:the\s+)?(?:image|photo|picture)/i,
    handler: () => ({ type: 'unsupported_image_edit' }),
  },
  {
    regex: /^edit\s+(?:this|the)?\s*(?:image|photo|region)/i,
    handler: () => ({ type: 'unsupported_image_edit' }),
  },
];

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify a user message as an edit intent.
 * Returns null if no edit pattern matches — the caller should then fall through
 * to generation/conversation classification.
 */
export function classifyEditIntent(content: string): EditIntent | null {
  const trimmed = content.trim();
  for (const { regex, handler } of EDIT_PATTERNS) {
    const match = trimmed.match(regex);
    if (match) return handler(match);
  }
  return null;
}
