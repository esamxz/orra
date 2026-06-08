import { z } from 'zod';

// ---------------------------------------------------------------------------
// Chat route schemas
// ---------------------------------------------------------------------------

export const ListMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const AppendMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(8000),
});
