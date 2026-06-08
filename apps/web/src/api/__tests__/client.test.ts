import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient } from '../client.js';
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
