import { z } from 'zod';
import { ApprovalActionSchema, MediaIntentSchema } from '@orra/shared';

// ---------------------------------------------------------------------------
// Chat route schemas
// ---------------------------------------------------------------------------

export const ListMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const AppendMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(8000),
  selectedCardIndex: z.number().int().min(0).optional(),
  intent: MediaIntentSchema.optional(),
  primarySourceAssetId: z.string().uuid().nullable().optional(),
  sourceAssetIds: z.array(z.string().uuid()).optional(),
}).superRefine((data, ctx) => {
  // edit_image and analyze_image require a source image asset.
  if ((data.intent === 'edit_image' || data.intent === 'analyze_image') && !data.primarySourceAssetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['primarySourceAssetId'],
      message: `${data.intent} requires a primary source asset.`,
    });
  }

  // generate_image and chat_text must not carry source assets.
  if ((data.intent === 'generate_image' || data.intent === 'chat_text') && data.primarySourceAssetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['primarySourceAssetId'],
      message: `${data.intent} must not include a source asset.`,
    });
  }

  // When both are present, primary must be included in the full list.
  if (data.primarySourceAssetId && data.sourceAssetIds?.length && !data.sourceAssetIds.includes(data.primarySourceAssetId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceAssetIds'],
      message: 'sourceAssetIds must include primarySourceAssetId.',
    });
  }
});

export const ApprovalActionBodySchema = z.object({
  action: ApprovalActionSchema,
  value: z.string().trim().max(2000).optional(),
});

export const MessageIdParamSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});
