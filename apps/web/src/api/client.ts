import { ApiClientError } from './errors.js';

// ---------------------------------------------------------------------------
// API envelope shape
// ---------------------------------------------------------------------------

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; requestId?: string } };

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj.ok === true) {
    return 'data' in obj;
  }
  if (obj.ok === false) {
    const err = obj.error;
    if (typeof err !== 'object' || err === null) return false;
    const e = err as Record<string, unknown>;
    return typeof e.code === 'string' && typeof e.message === 'string';
  }
  return false;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken?: () => Promise<string | null>;
}

export interface ApiClient {
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  getAuthToken: () => Promise<string | null>;
  setAuthTokenProvider: (provider: () => Promise<string | null>) => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createApiClient(config: ApiClientConfig): ApiClient {
  let getAuthToken = config.getAuthToken ?? (async () => null);

  const client: ApiClient = {
    getAuthToken: () => getAuthToken(),

    setAuthTokenProvider(provider) {
      getAuthToken = provider;
    },

    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const url = `${config.baseUrl}${path}`;
      const headers = new Headers(init.headers);

      headers.set('Accept', 'application/json');
      if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const token = await getAuthToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      let response: Response;
      try {
        response = await fetch(url, { ...init, headers });
      } catch (err) {
        throw new ApiClientError(
          'NETWORK_ERROR',
          'Unable to reach the server. Please check your connection.',
        );
      }

      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch {
        throw new ApiClientError(
          'PARSE_ERROR',
          'The server returned an unreadable response.',
        );
      }

      if (!isApiEnvelope(envelope)) {
        throw new ApiClientError(
          'PARSE_ERROR',
          'The server returned an unexpected response shape.',
        );
      }

      if (!envelope.ok) {
        throw new ApiClientError(
          envelope.error.code,
          envelope.error.message,
          envelope.error.requestId,
        );
      }

      return envelope.data as T;
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Default client instance
// ---------------------------------------------------------------------------
// Reads VITE_API_BASE_URL from env; falls back to localhost:8787/v1 in dev.
// Documented: production must set VITE_API_BASE_URL.

function getDefaultBaseUrl(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (env && typeof env === 'string') {
    return env.replace(/\/+$/, '');
  }
  // Dev-only fallback. In production this must be configured explicitly.
  if (import.meta.env.DEV) {
    return 'http://localhost:8787/v1';
  }
  throw new Error(
    'VITE_API_BASE_URL is not set. Configure the API base URL in your environment.',
  );
}

// ---------------------------------------------------------------------------
// Auth token provider boundary
// ---------------------------------------------------------------------------
// The API client obtains tokens from a provider set at runtime.
// In production, the provider is wired to Clerk via useAuth().
// In development, an explicit localStorage fallback is available ONLY when
// VITE_DEV_AUTH_TOKEN_ENABLED is set to "true".

/** @internal exported for testing */
export function createDefaultAuthTokenProvider(): () => Promise<string | null> {
  const devEnabled = import.meta.env.VITE_DEV_AUTH_TOKEN_ENABLED === 'true';
  return async () => {
    if (import.meta.env.DEV && devEnabled) {
      const manual = localStorage.getItem('orra:dev:authToken');
      if (manual) return manual;
    }
    return null;
  };
}

export const apiClient = createApiClient({
  baseUrl: getDefaultBaseUrl(),
  getAuthToken: createDefaultAuthTokenProvider(),
});
