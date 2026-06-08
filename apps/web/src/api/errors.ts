// ---------------------------------------------------------------------------
// API client error taxonomy
// ---------------------------------------------------------------------------
// Frontend-safe error class. Never leaks stack traces or server internals.

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}
