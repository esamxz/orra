import { zValidator } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';
import type { Context } from 'hono';
import { ApiError } from '../errors.js';

// ---------------------------------------------------------------------------
// Zod validation helpers
// ---------------------------------------------------------------------------
// Wraps @hono/zod-validator to produce clean ApiError responses.
//
// Usage:
//   app.post('/', validateJson(MySchema), (c) => { ... })

function formatZodIssues(issues: Array<{ path: (string | number)[]; message: string }>) {
  return issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

function createValidator<T extends ZodSchema>(target: 'json' | 'query' | 'param', schema: T) {
  return zValidator(target, schema, (result, _c: Context) => {
    if (!result.success) {
      const issues = formatZodIssues(result.error.issues);
      throw new ApiError(
        'VALIDATION',
        `Invalid ${target}`,
        { issues }
      );
    }
  });
}

export function validateJson<T extends ZodSchema>(schema: T) {
  return createValidator('json', schema);
}

export function validateQuery<T extends ZodSchema>(schema: T) {
  return createValidator('query', schema);
}

export function validateParam<T extends ZodSchema>(schema: T) {
  return createValidator('param', schema);
}
