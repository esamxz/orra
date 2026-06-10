import type { ServiceContext } from './service-context.js';
import { requireAuth } from './service-context.js';
import type { ProjectMemoryRepository } from '../repositories/projectMemoryRepository.js';
import type { ProjectContextMemoryRow } from '@orra/db';
import type { ProjectContextMemory, ApprovalAction, ApprovalCardDto } from '@orra/shared';
import type { DirectorIntentResult } from './directorIntentService.js';

// ---------------------------------------------------------------------------
// Project memory service (Phase 13D)
// ---------------------------------------------------------------------------
// Manages per-project structured memory built from user chat signals.
// Deterministic, rule-based — no AI calls in this phase.
//
// Rules:
//   * One row per project.
//   * All access scoped by workspace_id.
//   * Memory fields are only written when a new signal is detected and the
//     field is currently unset — existing values are preserved.
//   * Array fields (rejectedIdeas, constraints) append deduplicated items
//     and cap at 20 items of max 300 chars each.
//   * Updates are always fire-and-forget from callers — never block responses.

// ---------------------------------------------------------------------------
// Platform map (canonical casing)
// ---------------------------------------------------------------------------

const PLATFORM_PATTERNS: Array<[RegExp, string]> = [
  [/\bfor\s+linkedin\b/i, 'LinkedIn'],
  [/\bfor\s+instagram\b/i, 'Instagram'],
  [/\bfor\s+twitter\b/i, 'Twitter'],
  [/\bfor\s+tiktok\b/i, 'TikTok'],
  [/\bfor\s+facebook\b/i, 'Facebook'],
];

// Tone keywords that map directly
const TONE_PATTERN =
  /\bmake\s+it\s+(professional|funny|calm|bold|elegant|playful)\b/i;

// Visual direction keywords
const VISUAL_DIRECTION_PATTERN = /\b(minimal|dark)\b/i;

// Audience patterns
const AUDIENCE_SENTENCE_PATTERN =
  /\baudience\s+(?:is|are)\s+([a-z][a-z\s,&-]{1,80}?)(?:\.|,|;|$)/i;
const AUDIENCE_KEYWORDS_PATTERN =
  /\bfor\s+(founders|designers|students|marketers|developers|entrepreneurs|creators)\b/i;

// Constraint / rejection patterns (global to find all matches)
const CONSTRAINT_PATTERN =
  /\b(?:don'?t\s+use|avoid\s+using|avoid|no\s+)\s*([a-z0-9][a-z0-9\s\-]{1,100}?)(?:\.|,|;|$)/gi;
const REJECTED_PATTERN =
  /\b(?:not\s+like|reject(?:ed)?)\s+([a-z0-9][a-z0-9\s\-]{1,100}?)(?:\.|,|;|$)/gi;

// Slide/card count
const SLIDE_COUNT_PATTERN = /\b(\d{1,2})[- ]?(?:slides?|cards?)\b/i;

// ---------------------------------------------------------------------------
// Pure signal extraction
// ---------------------------------------------------------------------------

/**
 * Extract structured signals from a user message.
 * Returns only the fields where a signal was detected.
 * For array fields, returns the MERGED set (existing + new items).
 */
export function extractMemorySignals(
  messageText: string,
  existing?: Partial<ProjectContextMemory>
): Partial<ProjectContextMemory> {
  const signals: Partial<ProjectContextMemory> = {};

  // Platform
  if (!existing?.platform) {
    for (const [pattern, canonical] of PLATFORM_PATTERNS) {
      if (pattern.test(messageText)) {
        signals.platform = canonical;
        break;
      }
    }
  }

  // Slide count
  if (!existing?.slideCount) {
    const slideMatch = SLIDE_COUNT_PATTERN.exec(messageText);
    if (slideMatch) {
      const count = parseInt(slideMatch[1], 10);
      if (count >= 1 && count <= 50) {
        signals.slideCount = count;
      }
    }
  }

  // Tone (only if not already set)
  if (!existing?.tone) {
    const toneMatch = TONE_PATTERN.exec(messageText);
    if (toneMatch) {
      signals.tone = toneMatch[1].toLowerCase();
    }
  }

  // Visual direction (only if not already set)
  if (!existing?.visualDirection) {
    const vdMatch = VISUAL_DIRECTION_PATTERN.exec(messageText);
    if (vdMatch) {
      signals.visualDirection = vdMatch[1].toLowerCase();
    }
  }

  // Audience (only if not already set)
  if (!existing?.audience) {
    const audienceSentence = AUDIENCE_SENTENCE_PATTERN.exec(messageText);
    if (audienceSentence) {
      signals.audience = audienceSentence[1].trim().slice(0, 500);
    } else {
      const audienceKw = AUDIENCE_KEYWORDS_PATTERN.exec(messageText);
      if (audienceKw) {
        signals.audience = audienceKw[1];
      }
    }
  }

  // Constraints — append to existing
  const existingConstraints = existing?.constraints ?? [];
  const newConstraints = extractMatches(messageText, CONSTRAINT_PATTERN);
  if (newConstraints.length > 0) {
    const merged = mergeArrayField(existingConstraints, newConstraints);
    if (merged.length > existingConstraints.length) {
      signals.constraints = merged;
    }
  }

  // Rejected ideas — append to existing
  const existingRejected = existing?.rejectedIdeas ?? [];
  const newRejected = extractMatches(messageText, REJECTED_PATTERN);
  if (newRejected.length > 0) {
    const merged = mergeArrayField(existingRejected, newRejected);
    if (merged.length > existingRejected.length) {
      signals.rejectedIdeas = merged;
    }
  }

  return signals;
}

/** Build a short deterministic summary from memory fields. */
export function buildSummary(memory: Partial<ProjectContextMemory>): string {
  const parts: string[] = [];
  if (memory.topic) parts.push(`Project about ${memory.topic}`);
  if (memory.platform) parts.push(`for ${memory.platform}`);
  if (memory.audience) parts.push(`audience: ${memory.audience}`);
  if (memory.tone) parts.push(`tone: ${memory.tone}`);
  if (parts.length === 0) return '';
  return parts.join(', ').slice(0, 1000) + '.';
}

// ---------------------------------------------------------------------------
// Row → DTO
// ---------------------------------------------------------------------------

export function rowToMemory(row: ProjectContextMemoryRow): ProjectContextMemory {
  return {
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    topic: row.topic ?? undefined,
    audience: row.audience ?? undefined,
    tone: row.tone ?? undefined,
    platform: row.platform ?? undefined,
    format: row.format ?? undefined,
    carouselGoal: row.carousel_goal ?? undefined,
    slideCount: row.slide_count ?? undefined,
    visualDirection: row.visual_direction ?? undefined,
    approvedDirection: row.approved_direction ?? undefined,
    rejectedIdeas: Array.isArray(row.rejected_ideas) ? (row.rejected_ideas as string[]) : [],
    userPreferences: Array.isArray(row.user_preferences) ? (row.user_preferences as string[]) : [],
    constraints: Array.isArray(row.constraints) ? (row.constraints as string[]) : [],
    summary: row.summary,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class ProjectMemoryService {
  constructor(private memoryRepo: ProjectMemoryRepository) {}

  /**
   * Update memory from a user chat message.
   * Always fire-and-forget — callers must NOT await this for a user response.
   */
  async updateFromUserMessage(
    ctx: ServiceContext,
    projectId: string,
    messageText: string,
    intentResult: DirectorIntentResult
  ): Promise<void> {
    const auth = requireAuth(ctx);

    const existing = await this.memoryRepo.getByProjectIdForWorkspace({
      workspaceId: auth.workspaceId,
      projectId,
    });

    const existingMemory = existing ? rowToMemory(existing) : undefined;
    const signals = extractMemorySignals(messageText, existingMemory);

    // Pick up rawTopic from intent if no topic yet
    const rawTopic = intentResult.generationHint?.rawTopic;
    if (rawTopic && !signals.topic && !existingMemory?.topic) {
      signals.topic = rawTopic.slice(0, 500);
    }

    if (Object.keys(signals).length === 0) return; // nothing to persist

    // Rebuild merged memory for summary
    const merged: Partial<ProjectContextMemory> = { ...existingMemory, ...signals };
    signals.summary = buildSummary(merged);

    await this.memoryRepo.upsertForProject({
      workspaceId: auth.workspaceId,
      projectId,
      ...signals,
    });
  }

  /**
   * Update memory when an approval action is taken.
   * approve_and_create → record the approved direction summary.
   * cancel → append the rejected direction to rejectedIdeas.
   * Other actions: no-op.
   */
  async updateFromApprovalAction(
    ctx: ServiceContext,
    projectId: string,
    action: ApprovalAction,
    approvalCard?: ApprovalCardDto
  ): Promise<void> {
    const auth = requireAuth(ctx);
    const summaryLine = approvalCard?.summaryLine;

    if (action === 'approve_and_create' && summaryLine) {
      await this.memoryRepo.upsertForProject({
        workspaceId: auth.workspaceId,
        projectId,
        approvedDirection: summaryLine.slice(0, 500),
      });
      return;
    }

    if (action === 'cancel' && summaryLine) {
      const existing = await this.memoryRepo.getByProjectIdForWorkspace({
        workspaceId: auth.workspaceId,
        projectId,
      });
      const existingRejected = existing && Array.isArray(existing.rejected_ideas)
        ? (existing.rejected_ideas as string[])
        : [];
      const merged = mergeArrayField(existingRejected, [summaryLine.slice(0, 300)]);
      await this.memoryRepo.upsertForProject({
        workspaceId: auth.workspaceId,
        projectId,
        rejectedIdeas: merged,
      });
    }

    // 'edit_direction' and 'add_cta' → no memory change
  }

  /**
   * Get the current project memory. Returns null if no memory exists yet.
   * Requires auth; workspace-scoped.
   */
  async getMemory(
    ctx: ServiceContext,
    projectId: string
  ): Promise<ProjectContextMemory | null> {
    const auth = requireAuth(ctx);
    const row = await this.memoryRepo.getByProjectIdForWorkspace({
      workspaceId: auth.workspaceId,
      projectId,
    });
    return row ? rowToMemory(row) : null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all capture group 1 matches from a global regex. */
function extractMatches(text: string, pattern: RegExp): string[] {
  // Reset lastIndex for global regex
  pattern.lastIndex = 0;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const item = match[1]?.trim();
    if (item && item.length > 0) {
      results.push(item.slice(0, 300));
    }
  }
  return results;
}

/** Merge new items into existing array, dedupe, cap at 20 items. */
function mergeArrayField(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((s) => s.toLowerCase()));
  const result = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      result.push(item);
    }
  }
  return result.slice(0, 20);
}
