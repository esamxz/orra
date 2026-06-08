import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient, createDefaultAuthTokenProvider } from '../client.js';
import { ApiClientError } from '../errors.js';

describe('createApiClient', () => {
  const baseUrl = 'http://test.api/v1';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(response: unknown, status = 200) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
    } as unknown as Response);
  }

  it('parses success envelope and returns data', async () => {
    const client = createApiClient({ baseUrl });
    mockFetch({ ok: true, data: { id: 'proj-1', name: 'Test' } });

    const result = await client.request('/projects');
    expect(result).toEqual({ id: 'proj-1', name: 'Test' });
  });

  it('parses error envelope and throws ApiClientError', async () => {
    const client = createApiClient({ baseUrl });
    mockFetch({ ok: false, error: { code: 'NOT_FOUND', message: 'Project not found.', requestId: 'req-1' } }, 404);

    try {
      await client.request('/projects/1');
      expect.fail('Expected request to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).message).toBe('Project not found.');
      expect((err as ApiClientError).code).toBe('NOT_FOUND');
      expect((err as ApiClientError).requestId).toBe('req-1');
    }
  });

  it('includes Authorization header when token provider returns token', async () => {
    const client = createApiClient({
      baseUrl,
      getAuthToken: async () => 'test-token-123',
    });
    mockFetch({ ok: true, data: {} });

    await client.request('/projects');
    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token-123');
  });

  it('omits Authorization header when token provider returns null', async () => {
    const client = createApiClient({
      baseUrl,
      getAuthToken: async () => null,
    });
    mockFetch({ ok: true, data: {} });

    await client.request('/projects');
    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });

  it('handles malformed API response safely', async () => {
    const client = createApiClient({ baseUrl });
    mockFetch({ unexpected: 'shape' });

    await expect(client.request('/projects')).rejects.toBeInstanceOf(ApiClientError);
    try {
      await client.request('/projects');
    } catch (err) {
      expect((err as ApiClientError).code).toBe('PARSE_ERROR');
    }
  });

  it('handles non-JSON response safely', async () => {
    const client = createApiClient({ baseUrl });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new Error('not json'); },
    } as unknown as Response);

    await expect(client.request('/projects')).rejects.toBeInstanceOf(ApiClientError);
    try {
      await client.request('/projects');
    } catch (err) {
      expect((err as ApiClientError).code).toBe('PARSE_ERROR');
    }
  });

  it('handles network errors safely', async () => {
    const client = createApiClient({ baseUrl });
    vi.mocked(fetch).mockRejectedValueOnce(new Error('net::ERR_FAILED'));

    try {
      await client.request('/projects');
      expect.fail('Expected request to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).code).toBe('NETWORK_ERROR');
    }
  });

  it('allows swapping the auth token provider later', async () => {
    const client = createApiClient({
      baseUrl,
      getAuthToken: async () => 'old-token',
    });
    client.setAuthTokenProvider(async () => 'new-token');

    mockFetch({ ok: true, data: {} });
    await client.request('/projects');

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer new-token');
  });
});

describe('createDefaultAuthTokenProvider', () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    // Reset localStorage mock before each test
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      length: 0,
      key: (_index: number) => null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Restore import.meta.env
    Object.assign(import.meta.env, originalEnv);
  });

  it('returns null when dev auth token fallback is disabled', async () => {
    import.meta.env.DEV = true;
    import.meta.env.VITE_DEV_AUTH_TOKEN_ENABLED = 'false';

    const provider = createDefaultAuthTokenProvider();
    const token = await provider();

    expect(token).toBeNull();
  });

  it('returns null in production regardless of localStorage token', async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEV_AUTH_TOKEN_ENABLED = 'true';
    localStorage.setItem('orra:dev:authToken', 'secret-token');

    const provider = createDefaultAuthTokenProvider();
    const token = await provider();

    expect(token).toBeNull();
  });

  it('returns localStorage token when dev mode and fallback are both enabled', async () => {
    import.meta.env.DEV = true;
    import.meta.env.VITE_DEV_AUTH_TOKEN_ENABLED = 'true';
    localStorage.setItem('orra:dev:authToken', 'dev-jwt-123');

    const provider = createDefaultAuthTokenProvider();
    const token = await provider();

    expect(token).toBe('dev-jwt-123');
  });

  it('returns null when dev enabled but localStorage key is missing', async () => {
    import.meta.env.DEV = true;
    import.meta.env.VITE_DEV_AUTH_TOKEN_ENABLED = 'true';

    const provider = createDefaultAuthTokenProvider();
    const token = await provider();

    expect(token).toBeNull();
  });
});
