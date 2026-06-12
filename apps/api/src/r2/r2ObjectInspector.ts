import { ApiError } from '../errors.js';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// R2 object inspection abstraction
// ---------------------------------------------------------------------------
// Phase 12C: verify that an object exists in R2 after a direct browser upload.
//
// Production/staging use the Cloudflare Workers R2 bucket binding (ORRA_ASSETS).
// Dev/test use a fake verifier that returns mock metadata.
//
// The inspector does NOT generate public read URLs. It only checks existence
// and returns metadata for server-side validation.

export interface R2ObjectMetadata {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
  etag?: string;
  uploadedAt?: string;
}

export interface R2ObjectInspector {
  /**
   * Check whether an object exists in R2 and return its metadata.
   *
   * @param key - The server-generated R2 object key.
   */
  headObject(key: string): Promise<R2ObjectMetadata>;
}

/**
 * Fake inspector for development and testing.
 * Simulates R2 object existence based on a simple in-memory registry.
 */
export class FakeR2ObjectInspector implements R2ObjectInspector {
  private registry = new Map<string, R2ObjectMetadata>();
  private wildcard: R2ObjectMetadata | null = null;

  register(key: string, meta: Omit<R2ObjectMetadata, 'exists'>): void {
    this.registry.set(key, { exists: true, ...meta });
  }

  /** Register a wildcard fallback returned for any key not in the registry. */
  registerAll(meta: Omit<R2ObjectMetadata, 'exists'>): void {
    this.wildcard = { exists: true, ...meta };
  }

  unregister(key: string): void {
    this.registry.delete(key);
  }

  clear(): void {
    this.registry.clear();
    this.wildcard = null;
  }

  async headObject(key: string): Promise<R2ObjectMetadata> {
    return this.registry.get(key) ?? this.wildcard ?? { exists: false };
  }
}

/**
 * Production inspector backed by the Cloudflare Workers R2 bucket binding.
 */
export class R2BindingObjectInspector implements R2ObjectInspector {
  constructor(private bucket: R2Bucket) {}

  async headObject(key: string): Promise<R2ObjectMetadata> {
    const object = await this.bucket.head(key);

    if (!object) {
      return { exists: false };
    }

    return {
      exists: true,
      sizeBytes: object.size,
      contentType: object.httpMetadata?.contentType,
      etag: object.httpEtag,
      uploadedAt: object.uploaded ? new Date(object.uploaded).toISOString() : undefined,
    };
  }
}

/**
 * Factory: create the correct object inspector for the current environment.
 *
 * - development / test → FakeR2ObjectInspector
 * - staging / production → R2BindingObjectInspector (requires ORRA_ASSETS binding)
 */
const fakeInspectorSingleton = new FakeR2ObjectInspector();

export function createR2ObjectInspector(env: Env): R2ObjectInspector {
  if (env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'test') {
    return fakeInspectorSingleton;
  }

  const bucket = env.ORRA_ASSETS;

  if (!bucket) {
    throw new ApiError(
      'INTERNAL',
      'R2 bucket binding ORRA_ASSETS is not available. Object inspection cannot proceed.'
    );
  }

  return new R2BindingObjectInspector(bucket);
}

/** Exported for tests that need to pre-register objects before hitting routes. */
export function getFakeR2ObjectInspector(): FakeR2ObjectInspector {
  return fakeInspectorSingleton;
}
