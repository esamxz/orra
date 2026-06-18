export type AIProviderErrorCode =
  | 'PROVIDER_CONFIG_MISSING'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_INVALID_REQUEST'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_CAPABILITY_UNSUPPORTED';

interface AIProviderErrorOptions {
  code: AIProviderErrorCode;
  provider: string;
  message: string;
  retryable?: boolean;
}

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly provider: string;
  readonly retryable: boolean;

  constructor(options: AIProviderErrorOptions) {
    super(options.message);
    this.name = 'AIProviderError';
    this.code = options.code;
    this.provider = options.provider;
    this.retryable = options.retryable ?? false;
  }
}

export function isAIProviderError(err: unknown): err is AIProviderError {
  return err instanceof AIProviderError;
}
