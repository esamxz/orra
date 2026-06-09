import { describe, it, expect } from 'vitest';
import { FakeR2Signer, createR2Signer } from '../r2/r2Signer.js';
import { ApiError } from '../errors.js';

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
});

describe('createR2Signer', () => {
  it('returns FakeR2Signer in development', () => {
    const signer = createR2Signer({ ENVIRONMENT: 'development' });
    expect(signer).toBeInstanceOf(FakeR2Signer);
  });

  it('returns FakeR2Signer in staging', () => {
    const signer = createR2Signer({ ENVIRONMENT: 'staging' });
    expect(signer).toBeInstanceOf(FakeR2Signer);
  });

  it('throws INTERNAL in production', () => {
    expect(() => createR2Signer({ ENVIRONMENT: 'production' })).toThrow(ApiError);
    expect(() => createR2Signer({ ENVIRONMENT: 'production' })).toThrow('R2 production signer is not configured');
  });
});
