import { z } from 'zod';
import { RatioSchema } from '@orra/shared';

// ---------------------------------------------------------------------------
// Project route schemas
// ---------------------------------------------------------------------------

export const ProjectTypeSchema = z.enum(['post', 'carousel', 'from_assets']);

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: ProjectTypeSchema,
  ratio: RatioSchema,
  brandSystemId: z.string().uuid().optional(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  ratio: RatioSchema.optional(),
  brandSystemId: z.string().uuid().nullable().optional(),
});

export const ListProjectsQuerySchema = z.object({
  tab: z.enum(['recent', 'all']).optional().default('recent'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const ProjectIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Dashboard new-project schema — creates a project and saves the first prompt
// as the first project chat message (no intent classification, no approval card).
export const NewProjectSchema = CreateProjectSchema.extend({
  prompt: z.string().trim().min(1).max(8000),
});

export type NewProjectRequest = z.infer<typeof NewProjectSchema>;
