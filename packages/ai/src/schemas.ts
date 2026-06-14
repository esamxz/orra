import { z } from 'zod';

// P0.2: schema for validating the JSON object returned by Gemini for prompt enhancement
export const PromptEnhancementResultSchema = z.object({
  enhancedPrompt: z.string().min(1).max(4000),
  inferredType: z.enum(['single_post', 'carousel', 'generic_visual']),
  cardCount: z.number().int().min(2).max(10).optional(),
});

// Phase 14A: per-card content schema
export const PlannedCardSchema = z.object({
  headline: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  cta: z.string().max(100).optional(),
});

export const TextPlanResultSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1),
  cardCount: z.number().int().min(1).max(10),
  body: z.string().min(1),
  styleNotes: z.array(z.string().min(1).max(300)).max(20),
  // Phase 14A: optional per-card content and visual direction
  cards: z.array(PlannedCardSchema).max(10).optional(),
  layoutDirection: z.string().max(200).optional(),
  visualDirection: z.string().max(200).optional(),
});
