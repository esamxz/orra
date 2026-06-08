// ---------------------------------------------------------------------------
// Stable API error taxonomy
// ---------------------------------------------------------------------------
// Aligned with Orra system design (section 6, error taxonomy)

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'VERSION_CONFLICT'
  | 'INSUFFICIENT_CREDITS'
  | 'PROVIDER_FAILURE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export const HttpStatusMap: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  // 402 = Payment Required; semantically correct for credit exhaustion.
  INSUFFICIENT_CREDITS: 402,
  PROVIDER_FAILURE: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = HttpStatusMap[code];
    this.details = details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
