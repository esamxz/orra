import { describe, it, expect } from 'vitest';
import { FakeR2Signer, createR2Signer } from '../r2/r2Signer.js';
import { RealR2Signer } from '../r2/realR2Signer.js';
import { ApiError } from '../errors.js';

// ---------------------------------------------------------------------------
// FakeR2Signer
// ---------------------------------------------------------------------------

describe('FakeR2Signer', () => {
  it('returns a fake upload URL with key and expiry', async () => {
    const signer = new FakeR2Signer();
    const result = await signer.createUploadUrl('my/key.png', 'image/png', 300);

    expect(result.url).toContain('fake-r2.orra.local');
    expect(result.url).toContain(encodeURIComponent('my/key.png'));
    expect(result.headers['Content-Type']).toBe('image/png');
    expect(result.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('expiresAt is roughly now + expiresInSeconds', async () => {
    const signer = new FakeR2Signer();
    const before = Date.now();
    const result = await signer.createUploadUrl('k', 'image/jpeg', 120);
    const after = Date.now();

    const expires = new Date(result.expiresAt).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 119_000);
    expect(expires).toBeLessThanOrEqual(after + 121_000);
  });

  it('returns a fake read URL with key and expiry', async () => {
    const signer = new FakeR2Signer();
    const result = await signer.createReadUrl('my/key.png', 300);

    expect(result.url).toContain('fake-r2.orra.local');
    expect(result.url).toContain('read?');
    expect(result.url).toContain(encodeURIComponent('my/key.png'));
    expect(result.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// RealR2Signer
// ---------------------------------------------------------------------------

describe('RealR2Signer', () => {
  function createSigner(clock?: { now: () => Date }) {
    return new RealR2Signer(
      'test-account',
      'orra-assets',
      'TESTACCESSKEY',
      'testsecretkey',
      clock
    );
  }

  it('returns a real R2 presigned PUT URL', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createUploadUrl('workspace/ws-1/key.png', 'image/png', 300);

    expect(result.url).toMatch(/^https:\/\/test-account\.r2\.cloudflarestorage\.com\//);
    expect(result.url).toContain('/orra-assets/');
    expect(result.url).toContain('workspace/ws-1/key.png');
  });

  it('includes all required X-Amz query parameters', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createUploadUrl('k', 'image/png', 300);

    const url = new URL(result.url);
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-Date')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-Content-SHA256')).toBe('UNSIGNED-PAYLOAD');
  });

  it('X-Amz-Expires matches the requested expiry window', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createUploadUrl('k', 'image/png', 600);

    const url = new URL(result.url);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
  });

  it('upload headers include Content-Type matching the signed value', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createUploadUrl('k', 'image/webp', 300);

    expect(result.headers['Content-Type']).toBe('image/webp');
  });

  it('expiresAt matches signer expiry window', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createUploadUrl('k', 'image/png', 300);

    const expected = new Date(fixedDate.getTime() + 300 * 1000).toISOString();
    expect(result.expiresAt).toBe(expected);
  });

  it('different keys produce different signatures', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });

    const result1 = await signer.createUploadUrl('key-a.png', 'image/png', 300);
    const result2 = await signer.createUploadUrl('key-b.png', 'image/png', 300);

    const sig1 = new URL(result1.url).searchParams.get('X-Amz-Signature');
    const sig2 = new URL(result2.url).searchParams.get('X-Amz-Signature');
    expect(sig1).not.toBe(sig2);
  });

  it('different content types produce different signatures', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });

    const result1 = await signer.createUploadUrl('k', 'image/png', 300);
    const result2 = await signer.createUploadUrl('k', 'image/jpeg', 300);

    const sig1 = new URL(result1.url).searchParams.get('X-Amz-Signature');
    const sig2 = new URL(result2.url).searchParams.get('X-Amz-Signature');
    expect(sig1).not.toBe(sig2);
  });

  it('unsafe key characters are URL-encoded in the path', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createUploadUrl('file with spaces.png', 'image/png', 300);

    expect(result.url).toContain('file%20with%20spaces.png');
    expect(result.url).not.toContain('file with spaces.png');
  });

  it('access key id appears in credential but secret never appears', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createUploadUrl('k', 'image/png', 300);

    const url = new URL(result.url);
    const credential = url.searchParams.get('X-Amz-Credential');
    expect(credential).toContain('TESTACCESSKEY');
    expect(result.url).not.toContain('testsecretkey');
    expect(result.url).not.toContain('secretkey');
  });

  it('host is the R2 S3 endpoint', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createUploadUrl('k', 'image/png', 300);

    const url = new URL(result.url);
    expect(url.host).toBe('test-account.r2.cloudflarestorage.com');
  });

  it('does not contain a fake URL', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createUploadUrl('k', 'image/png', 300);

    expect(result.url).not.toContain('fake-r2.orra.local');
  });

  it('returns a real R2 presigned GET URL', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createReadUrl('workspace/ws-1/key.png', 300);

    expect(result.url).toMatch(/^https:\/\/test-account\.r2\.cloudflarestorage\.com\//);
    expect(result.url).toContain('/orra-assets/');
    expect(result.url).toContain('workspace/ws-1/key.png');
  });

  it('read URL includes all required X-Amz query parameters', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createReadUrl('k', 300);

    const url = new URL(result.url);
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-Date')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-Content-SHA256')).toBe('UNSIGNED-PAYLOAD');
  });

  it('read URL does not expose secret key', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const signer = createSigner({ now: () => fixedDate });
    const result = await signer.createReadUrl('k', 300);

    expect(result.url).not.toContain('testsecretkey');
    expect(result.url).not.toContain('secretkey');
  });
});

// ---------------------------------------------------------------------------
// createR2Signer factory
// ---------------------------------------------------------------------------

describe('createR2Signer', () => {
  it('returns FakeR2Signer in development', () => {
    const signer = createR2Signer({ ENVIRONMENT: 'development' });
    expect(signer).toBeInstanceOf(FakeR2Signer);
  });

  it('returns FakeR2Signer in test', () => {
    const signer = createR2Signer({ ENVIRONMENT: 'test' });
    expect(signer).toBeInstanceOf(FakeR2Signer);
  });

  it('returns RealR2Signer in staging with full env', () => {
    const signer = createR2Signer({
      ENVIRONMENT: 'staging',
      R2_ACCOUNT_ID: 'acc-1',
      R2_BUCKET_NAME: 'bucket-1',
      R2_ACCESS_KEY_ID: 'key-1',
      R2_SECRET_ACCESS_KEY: 'secret-1',
    });
    expect(signer).toBeInstanceOf(RealR2Signer);
  });

  it('returns RealR2Signer in production with full env', () => {
    const signer = createR2Signer({
      ENVIRONMENT: 'production',
      R2_ACCOUNT_ID: 'acc-1',
      R2_BUCKET_NAME: 'bucket-1',
      R2_ACCESS_KEY_ID: 'key-1',
      R2_SECRET_ACCESS_KEY: 'secret-1',
    });
    expect(signer).toBeInstanceOf(RealR2Signer);
  });

  it('throws INTERNAL in production when R2_ACCOUNT_ID is missing', () => {
    expect(() =>
      createR2Signer({
        ENVIRONMENT: 'production',
        R2_BUCKET_NAME: 'bucket-1',
        R2_ACCESS_KEY_ID: 'key-1',
        R2_SECRET_ACCESS_KEY: 'secret-1',
      })
    ).toThrow(ApiError);
  });

  it('throws INTERNAL in production when all env vars are missing', () => {
    let caught: unknown;
    try {
      createR2Signer({ ENVIRONMENT: 'production' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const message = (caught as ApiError).message;
    expect(message).toContain('R2_ACCOUNT_ID');
    expect(message).toContain('R2_BUCKET_NAME');
    expect(message).toContain('R2_ACCESS_KEY_ID');
    expect(message).toContain('R2_SECRET_ACCESS_KEY');
  });

  it('throws INTERNAL in staging when env vars are missing', () => {
    expect(() =>
      createR2Signer({
        ENVIRONMENT: 'staging',
        R2_BUCKET_NAME: 'bucket-1',
      })
    ).toThrow(ApiError);
  });

  it('error message does not contain secret values', () => {
    let caught = false;
    try {
      createR2Signer({
        ENVIRONMENT: 'production',
        R2_SECRET_ACCESS_KEY: 'super-secret-123',
      });
    } catch (err) {
      caught = true;
      const message = (err as ApiError).message;
      expect(message).not.toContain('super-secret-123');
    }
    expect(caught).toBe(true);
  });
});
