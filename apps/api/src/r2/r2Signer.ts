import { ApiError } from '../errors.js';
import type { Env } from '../env.js';
import { RealR2Signer } from './realR2Signer.js';

// ---------------------------------------------------------------------------
// R2 upload signer abstraction
// ---------------------------------------------------------------------------
// Phase 12A created the interface and a fake signer for dev/test.
// Phase 12B added real AWS SigV4 presigned URL generation for production.
//
// The fake signer returns a clearly dev-only URL. It must not be used
// in production or staging.

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
 * - development / test → FakeR2Signer (safe for local development)
 * - staging / production → RealR2Signer (requires R2 signing env)
 *
 * In staging and production, missing any required R2 signing env throws
 * a safe INTERNAL configuration error. Never silently falls back to fake.
 */
export function createR2Signer(env: Env): R2Signer {
  if (env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'test') {
    return new FakeR2Signer();
  }

  const accountId = env.R2_ACCOUNT_ID;
  const bucketName = env.R2_BUCKET_NAME;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
    const missing = [
      !accountId && 'R2_ACCOUNT_ID',
      !bucketName && 'R2_BUCKET_NAME',
      !accessKeyId && 'R2_ACCESS_KEY_ID',
      !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
    ].filter((m): m is string => Boolean(m));

    throw new ApiError(
      'INTERNAL',
      `R2 signer configuration incomplete. Missing: ${missing.join(', ')}.`
    );
  }

  return new RealR2Signer(accountId, bucketName, accessKeyId, secretAccessKey);
}
