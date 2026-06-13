import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadFileToSignedUrl, UploadError } from '../uploadFileToSignedUrl.js';

describe('uploadFileToSignedUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeFile(name = 'test.png', type = 'image/png', size = 1024): File {
    const blob = new Blob(['x'.repeat(size)], { type });
    return new File([blob], name, { type });
  }

  it('PUTs to signed URL with exact headers from backend', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as unknown as Response);

    const file = makeFile();
    const upload = {
      url: 'https://r2.example.com/signed',
      headers: {
        'Content-Type': 'image/png',
        'x-amz-meta-project': 'proj-1',
      },
    };

    await uploadFileToSignedUrl(file, upload);

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('https://r2.example.com/signed');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('PUT');
    const headers = init.headers as Headers;
    expect(headers.get('Content-Type')).toBe('image/png');
    expect(headers.get('x-amz-meta-project')).toBe('proj-1');
  });

  it('does not send Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as unknown as Response);

    const file = makeFile();
    const upload = {
      url: 'https://r2.example.com/signed',
      headers: {},
    };

    await uploadFileToSignedUrl(file, upload);

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('throws UploadError on non-2xx R2 response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
    } as unknown as Response);

    const file = makeFile();
    const upload = {
      url: 'https://r2.example.com/signed',
      headers: {},
    };

    await expect(uploadFileToSignedUrl(file, upload)).rejects.toThrow(UploadError);
    await expect(uploadFileToSignedUrl(file, upload)).rejects.toThrow('Upload failed with status 403');
  });

  it('throws UploadError on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('net::ERR_FAILED'));

    const file = makeFile();
    const upload = {
      url: 'https://r2.example.com/signed',
      headers: {},
    };

    await expect(uploadFileToSignedUrl(file, upload)).rejects.toThrow(UploadError);
    await expect(uploadFileToSignedUrl(file, upload)).rejects.toThrow('Network error during upload');
  });

  it('throws UploadError with cancelled message on abort', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetch).mockRejectedValue(abortError);

    const file = makeFile();
    const upload = {
      url: 'https://r2.example.com/signed',
      headers: {},
    };
    const controller = new AbortController();
    controller.abort();

    await expect(uploadFileToSignedUrl(file, upload, controller.signal)).rejects.toThrow(
      'Upload cancelled',
    );
  });

  it('falls back to file.type when backend omits Content-Type header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as unknown as Response);

    const file = makeFile('photo.webp', 'image/webp');
    const upload = {
      url: 'https://r2.example.com/signed',
      headers: {},
    };

    await uploadFileToSignedUrl(file, upload);

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('image/webp');
  });

  it('handles missing headers safely by using an empty set', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as unknown as Response);

    const file = makeFile();
    const upload = {
      url: 'https://r2.example.com/signed',
      headers: {},
    };

    await expect(uploadFileToSignedUrl(file, upload)).resolves.toBeUndefined();
  });
});
