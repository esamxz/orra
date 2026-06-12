import { z } from 'zod';
import { ApprovalActionSchema } from '@orra/shared';

// ---------------------------------------------------------------------------
// Chat route schemas
// ---------------------------------------------------------------------------

export const ListMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const AppendMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(8000),
  selectedCardIndex: z.number().int().min(0).optional(),
});

export const ApprovalActionBodySchema = z.object({
  action: ApprovalActionSchema,
  value: z.string().trim().max(2000).optional(),
});

export const MessageIdParamSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});
