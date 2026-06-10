import { z } from 'zod';
import type {
  AIProvider,
  AIProviderName,
  TextPlanRequest,
  TextPlanResult,
  ImageGenerationRequest,
  ImageGenerationResult,
  RecentChatMessage,
  CurrentArtifactSummary,
} from '../types.js';
import type { ProjectContextMemory } from '@orra/shared';
import { AIProviderError } from '../errors.js';
import { extractJsonObjectFromText } from '../json.js';
import { normalizeTextPlanResult } from '../normalization.js';
import type { AIProviderObserver } from '../observability.js';
import { NoopAIProviderObserver } from '../observability.js';

export interface GeminiTextProviderConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  baseUrl?: string;
  observer?: AIProviderObserver;
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_TIMEOUT_MS = 30_000;

const GeminiEnvelopeSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string() })),
        }),
      }),
    )
    .min(1),
});

export class GeminiTextProvider implements AIProvider {
  readonly name: AIProviderName = 'gemini';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly observer: AIProviderObserver;

  constructor(config: GeminiTextProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.observer = config.observer ?? new NoopAIProviderObserver();
  }

  async planText(input: TextPlanRequest): Promise<TextPlanResult> {
    const prompt = this.buildPrompt(input);
    const t0 = Date.now();

    this.observer.observe({
      provider: 'gemini',
      operation: 'planText',
      status: 'started',
      model: this.model,
      promptChars: prompt.length,
    });

    const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new AIProviderError({
            code: 'PROVIDER_TIMEOUT',
            provider: 'gemini',
            message: `Gemini request timed out after ${this.timeoutMs}ms`,
            retryable: true,
          });
        }
        throw new AIProviderError({
          code: 'PROVIDER_HTTP_ERROR',
          provider: 'gemini',
          message: `Gemini network error: ${err instanceof Error ? err.message : 'unknown'}`,
          retryable: true,
        });
      }
      clearTimeout(timer);

      if (!response.ok) {
        throw new AIProviderError({
          code: 'PROVIDER_HTTP_ERROR',
          provider: 'gemini',
          message: `Gemini returned HTTP ${response.status}`,
          retryable: response.status >= 500,
        });
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini response body was not valid JSON',
        });
      }

      const envelope = GeminiEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        throw new AIProviderError({
          code: 'PROVIDER_INVALID_RESPONSE',
          provider: 'gemini',
          message: 'Gemini response did not match expected envelope shape',
        });
      }

      const rawText = envelope.data.candidates[0].content.parts[0].text;

      const extracted = extractJsonObjectFromText(rawText, 'gemini');
      const result = normalizeTextPlanResult(extracted, 'gemini');

      this.observer.observe({
        provider: 'gemini',
        operation: 'planText',
        status: 'succeeded',
        durationMs: Date.now() - t0,
        model: this.model,
        promptChars: prompt.length,
        responseChars: rawText.length,
        normalizedCardCount: result.cardCount,
        layoutDirection: result.layoutDirection,
        visualDirection: result.visualDirection,
      });

      return result;

    } catch (err) {
      const durationMs = Date.now() - t0;
      this.observer.observe({
        provider: 'gemini',
        operation: 'planText',
        status: 'failed',
        durationMs,
        errorCode: err instanceof AIProviderError ? err.code : 'PROVIDER_UNKNOWN',
        retryable: err instanceof AIProviderError ? err.retryable : false,
      });
      throw err;
    }
  }

  async generateImageOrDocument(_input: ImageGenerationRequest): Promise<ImageGenerationResult> {
    throw new AIProviderError({
      code: 'PROVIDER_UNAVAILABLE',
      provider: 'gemini',
      message: 'GeminiTextProvider does not support image generation',
      retryable: false,
    });
  }

  private buildPrompt(input: TextPlanRequest): string {
    const brandSection = input.brandContext
      ? `Brand tone: ${input.brandContext.tone ?? 'not specified'}\nVisual direction: ${input.brandContext.visualDirection ?? 'not specified'}`
      : 'No brand context.';

    const memorySection = this.buildMemorySection(input.projectMemory);
    const chatSection = this.buildRecentChatSection(input.recentChatMessages);
    const artifactSection = this.buildArtifactSummarySection(input.currentArtifactSummary);

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

  private buildMemorySection(memory: ProjectContextMemory | null | undefined): string {
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

  private buildRecentChatSection(messages: RecentChatMessage[] | undefined): string {
    if (!messages || messages.length === 0) return '';
    const formatted = messages
      .map((m) => `  ${m.role}: ${m.content.slice(0, 500)}`)
      .join('\n');
    return `\nRecent conversation (oldest first):\n${formatted}\n`;
  }

  private buildArtifactSummarySection(summary: CurrentArtifactSummary | null | undefined): string {
    if (!summary || summary.cardCount === 0) return '';
    const snippetPart =
      summary.textSnippets.length > 0
        ? ` Existing text: ${summary.textSnippets.map((s) => `"${s.slice(0, 100)}"`).join(', ')}.`
        : '';
    return `\nCurrent artifact: ${summary.cardCount} card(s), ${summary.textLayerCount} text layer(s), ${summary.imageLayerCount} image layer(s).${snippetPart}\n`;
  }
}
