import { ApiError } from '../errors.js';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// R2 upload signer abstraction
// ---------------------------------------------------------------------------
// Phase 12A creates the interface and a fake signer for dev/test.
// Production S3-compatible signing is planned for Phase 12B.
//
// The fake signer returns a clearly dev-only URL. It must not be used
// in production.

export interface R2Signer {
  /**
   * Generate a one-time upload URL for a given R2 object key.
   *
   * @param key - The server-generated R2 object key.
   * @param contentType - The MIME type the client must send.
   * @param expiresInSeconds - How long the URL remains valid.
   */
  createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<{
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  }>;
}

/**
 * Fake signer for development and testing.
 * Returns a non-functional placeholder URL with the key and expiry embedded.
 */
export class FakeR2Signer implements R2Signer {
  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    return {
      url: `https://fake-r2.orra.local/upload?key=${encodeURIComponent(key)}&expires=${encodeURIComponent(expiresAt)}`,
      headers: {
        'Content-Type': contentType,
      },
      expiresAt,
    };
  }
}

/**
 * Factory: create the correct signer for the current environment.
 *
 * - development / staging → FakeR2Signer
 * - production → throws INTERNAL (real signer not yet implemented)
 *
 * Phase 12B will add an S3-compatible signer for production.
 */
export function createR2Signer(env: Env): R2Signer {
  if (env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'staging') {
    return new FakeR2Signer();
  }

  throw new ApiError(
    'INTERNAL',
    'R2 production signer is not configured. Phase 12A supports dev/test uploads only. Real S3-compatible signing will be added in Phase 12B.'
  );
}
