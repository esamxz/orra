import { ApiError } from '../errors.js';

// ---------------------------------------------------------------------------
// DB error mapping
// ---------------------------------------------------------------------------
// Converts Supabase/Postgres errors into stable ApiError instances.
// Repositories and services should use these helpers so route handlers
// never see raw Postgres codes or SQL details.
//
// Mapping choices (documented):
//   - unique violation         -> CONFLICT    (resource already exists)
//   - foreign key violation    -> VALIDATION  (reference to missing resource)
//   - check constraint violation -> VALIDATION  (business rule violated)
//   - row not found            -> NOT_FOUND   (no matching row)
//   - unknown DB error         -> INTERNAL    (do not leak internals)
//
// The original error is preserved on the ApiError cause for internal logging.

/** Postgres error codes we care about. */
const PostgresErrorCodes = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
} as const;

/** PostgREST-specific error codes. */
const PostgrestErrorCodes = {
  /** Results contain 0 rows (single() on empty result). */
  ZERO_ROWS: 'PGRST116',
} as const;

export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

function isDbErrorLike(err: unknown): err is DbErrorLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    ('code' in err || 'message' in err)
  );
}

/**
 * Map a Supabase/Postgres error to an ApiError.
 * Never leaks the raw SQL or the secret values.
 */
export function mapDbError(err: unknown): ApiError {
  if (!isDbErrorLike(err)) {
    return new ApiError('INTERNAL', 'Database error.', { original: String(err) });
  }

  const code = err.code ?? '';
  const message = err.message ?? 'Database error.';

  switch (code) {
    case PostgresErrorCodes.UNIQUE_VIOLATION:
      return new ApiError('CONFLICT', 'A resource with that identifier already exists.', {
        originalMessage: message,
      });

    case PostgresErrorCodes.FOREIGN_KEY_VIOLATION:
      return new ApiError('VALIDATION', 'Reference to a missing resource.', {
        originalMessage: message,
      });

    case PostgresErrorCodes.CHECK_VIOLATION:
    case PostgresErrorCodes.NOT_NULL_VIOLATION:
      return new ApiError('VALIDATION', 'Constraint violation.', {
        originalMessage: message,
      });

    case PostgrestErrorCodes.ZERO_ROWS:
      return new ApiError('NOT_FOUND', 'Resource not found.');

    default:
      return new ApiError('INTERNAL', 'An unexpected database error occurred.', {
        originalMessage: message,
      });
  }
}

/**
 * Convenience helper: wrap a Supabase single-row query result.
 * Throws NOT_FOUND when data is null and there is no error.
 * Throws the mapped ApiError when an error is present.
 */
export function expectSingleRow<T>(
  data: T | null,
  error: DbErrorLike | null
): T {
  if (error) {
    throw mapDbError(error);
  }
  if (data === null) {
    throw new ApiError('NOT_FOUND', 'Resource not found.');
  }
  return data;
}

/**
 * Convenience helper: wrap a Supabase list query result.
 * Throws the mapped ApiError when an error is present.
 */
export function expectRows<T>(
  data: T[] | null,
  error: DbErrorLike | null
): T[] {
  if (error) {
    throw mapDbError(error);
  }
  return data ?? [];
}
