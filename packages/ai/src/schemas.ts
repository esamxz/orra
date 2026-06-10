import { z } from 'zod';

export const TextPlanResultSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1),
  cardCount: z.number().int().min(1).max(10),
  body: z.string().min(1),
  styleNotes: z.array(z.string().min(1).max(300)).max(20),
});
