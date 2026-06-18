import { AIProviderError } from './errors.js';

/**
 * Decode a base64 string to Uint8Array.
 *
 * Works in Cloudflare Workers, Vitest/Node, and browser environments.
 * Uses `atob` (available in all three) to avoid runtime-specific APIs.
 */
export function base64ToUint8Array(data: string, provider: string): Uint8Array {
  try {
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  } catch {
    throw new AIProviderError({
      code: 'PROVIDER_INVALID_RESPONSE',
      provider,
      message: 'Failed to decode base64 image data from provider response',
    });
  }
}

/**
 * Encode a Uint8Array to a base64 string.
 *
 * Works in Cloudflare Workers, Vitest/Node, and browser environments.
 */
export function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  const len = data.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
