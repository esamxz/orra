import type {
  TextPlanRequest,
  RecentChatMessage,
  CurrentArtifactSummary,
  PromptEnhancementInput,
} from './types.js';
import type { ProjectContextMemory } from '@orra/shared';

// ---------------------------------------------------------------------------
// Shared prompt builders — used by all real text providers (Gemini, OpenAI).
// Extracted from GeminiTextProvider so providers don't duplicate this logic.
// ---------------------------------------------------------------------------

function buildBrandSection(ctx: NonNullable<TextPlanRequest['brandContext']>): string {
  const lines: string[] = [
    `You are creating content for the brand "${ctx.name}".`,
  ];
  if (ctx.description) lines.push(`Brand description: ${ctx.description}`);
  if (ctx.tone) lines.push(`Tone of voice: ${ctx.tone}`);
  if (ctx.visualDirection) lines.push(`Visual direction: ${ctx.visualDirection}`);
  if (ctx.rules) lines.push(`Brand rules: ${ctx.rules.slice(0, 300)}`);
  lines.push(
    `Important: if the user's prompt mentions "${ctx.name}", treat this as referring to the selected brand above — do not invent an unrelated industry, product category, or company.`,
  );
  return `\nBrand context:\n${lines.join('\n')}\n`;
}

export function buildTextPlanPrompt(input: TextPlanRequest): string {
  const brandSection = input.brandContext ? buildBrandSection(input.brandContext) : '';

  const memorySection = buildMemorySection(input.projectMemory);
  const chatSection = buildRecentChatSection(input.recentChatMessages);
  const artifactSection = buildArtifactSummarySection(input.currentArtifactSummary);

  return `You are a visual content planning assistant.
Request: "${input.prompt}"
Project type: ${input.projectType}
Aspect ratio: ${input.ratio.name} (${input.ratio.w}x${input.ratio.h})
${brandSection}${memorySection}${chatSection}${artifactSection}
Current user request takes precedence over all context above.

Return a JSON object with exactly these fields:
- title: string (1-200 chars) short topic title
- summary: string one sentence plan summary
- cardCount: integer 1 for post, 2-5 for carousel, max 10
- body: string main body copy for the first card (fallback when cards[0] is absent)
- styleNotes: array of strings (max 20 items, each max 300 chars) visual style guidance
- cards: array of objects (one per card, same length as cardCount), each with:
    - headline: string (1-200 chars) card-specific headline text
    - body: string card-specific paragraph copy
    - cta: string (optional, max 100 chars) call-to-action text, only for the last card
- layoutDirection: string (optional, max 200 chars) — one of: editorial, centered, bold, minimal, quote, split
- visualDirection: string (optional, max 200 chars) — one of: calm, dark, bold, minimal, elegant, playful, professional

Do not include image prompts, layer coordinates, or ArtifactDocument JSON.`;
}

export function buildEnhancementPrompt(input: PromptEnhancementInput): string {
  const selectedTypeHint = input.selectedType ? `\nUser selected type: ${input.selectedType}` : '';
  const ratioHint = input.aspectRatio ? `\nAspect ratio: ${input.aspectRatio}` : '';
  const assetHint = input.hasAssets
    ? `\nAttached assets: ${input.assetCount ?? 1} image(s) attached by the user.`
    : '';

  return `You are a creative brief writer for a visual content creation tool.

Expand and clarify the following rough user prompt into a richer creative brief suitable for generating a social media visual.

User prompt: "${input.prompt}"${selectedTypeHint}${ratioHint}${assetHint}

Rules:
- Preserve the user's original topic and intent exactly.
- If selectedType is "single_post" or the user prompt mentions "post", set inferredType to "single_post".
- If selectedType is "carousel" or the user prompt mentions "carousel", "slides", or "cards", set inferredType to "carousel".
- If neither applies, default inferredType to "single_post".
- Never change single_post to carousel or vice versa against the user's stated intent.
- Only add cardCount when inferredType is "carousel". For single_post, never include cardCount.
- Do not invent fake statistics, percentage claims, named studies, brand names, URLs, CTAs, or product details not mentioned by the user.
- Do not invent audience demographics, company names, or specific data points.
- Keep the enhanced prompt concise (2-5 sentences). Do not write a paragraph-by-paragraph essay.
- If the original prompt is already detailed (over 80 words), polish lightly without rewriting.
- If assets are attached, mention using them as visual reference.

Return a JSON object with exactly these fields:
- enhancedPrompt: string (1-4000 chars) — the expanded creative brief
- inferredType: "single_post" | "carousel" | "generic_visual"
- cardCount: integer (2-10, only when inferredType is "carousel")`;
}

function buildMemorySection(memory: ProjectContextMemory | null | undefined): string {
  if (!memory) return '';
  const lines: string[] = [];
  if (memory.topic) lines.push(`- Topic: ${memory.topic}`);
  if (memory.platform) lines.push(`- Platform: ${memory.platform}`);
  if (memory.tone) lines.push(`- Tone: ${memory.tone}`);
  if (memory.audience) lines.push(`- Audience: ${memory.audience}`);
  const avoids = [
    ...(memory.constraints ?? []),
    ...(memory.rejectedIdeas ?? []),
  ].filter(Boolean);
  if (avoids.length > 0) lines.push(`- Avoid: ${avoids.slice(0, 5).join(', ')}`);
  if (lines.length === 0) return '';
  return `\nProject context (from prior conversation):\n${lines.join('\n')}\n`;
}

function buildRecentChatSection(messages: RecentChatMessage[] | undefined): string {
  if (!messages || messages.length === 0) return '';
  const formatted = messages
    .map((m) => `  ${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n');
  return `\nRecent conversation (oldest first):\n${formatted}\n`;
}

function buildArtifactSummarySection(summary: CurrentArtifactSummary | null | undefined): string {
  if (!summary || summary.cardCount === 0) return '';
  const snippetPart =
    summary.textSnippets.length > 0
      ? ` Existing text: ${summary.textSnippets.map((s) => `"${s.slice(0, 100)}"`).join(', ')}.`
      : '';
  return `\nCurrent artifact: ${summary.cardCount} card(s), ${summary.textLayerCount} text layer(s), ${summary.imageLayerCount} image layer(s).${snippetPart}\n`;
}
