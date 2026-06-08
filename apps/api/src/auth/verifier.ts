import { jwtVerify, createRemoteJWKSet, createLocalJWKSet } from 'jose';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// Clerk verifier adapter
// ---------------------------------------------------------------------------
// This boundary isolates token verification so the middleware stays
// testable and provider-agnostic.
//
// Phase 7B.1 replaces the skeleton with real JWT/JWKS verification via jose,
// which is fully compatible with Cloudflare Workers (uses Web Crypto API).
//
//   - verify JWT signature against Clerk JWKS
//   - verify issuer (if CLERK_JWT_ISSUER is configured)
//   - verify audience (if CLERK_AUDIENCE is configured)
//   - verify expiration
//   - extract Clerk subject/user ID from `sub`
//
// Tests never hit Clerk. They generate local RSA keys, sign test JWTs,
// and inject a local JWKSet via createTestVerifier().

export interface ClerkVerifyResult {
  ok: true;
  clerkUserId: string;
}

export interface ClerkVerifyFailure {
  ok: false;
  reason: string;
}

export type ClerkVerifyResponse = ClerkVerifyResult | ClerkVerifyFailure;

export interface ClerkVerifier {
  verifyToken(token: string, env: Env): Promise<ClerkVerifyResponse>;
}

// ---------------------------------------------------------------------------
// Internal: shared verification logic
// ---------------------------------------------------------------------------
// Works with any jose-compatible key resolver (remote JWKS or local JWKSet).

import type { JWTVerifyGetKey } from 'jose';

async function verifyWithKeyResolver(
  token: string,
  env: Env,
  getKey: JWTVerifyGetKey
): Promise<ClerkVerifyResponse> {
  const verifyOptions: Parameters<typeof jwtVerify>[2] = {
    clockTolerance: 60, // 60 seconds tolerance for clock skew
  };

  if (env.CLERK_JWT_ISSUER) {
    verifyOptions.issuer = env.CLERK_JWT_ISSUER;
  }

  if (env.CLERK_AUDIENCE) {
    verifyOptions.audience = env.CLERK_AUDIENCE;
  }

  try {
    const { payload } = await jwtVerify(token, getKey, verifyOptions);
    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      return { ok: false, reason: 'JWT missing subject claim.' };
    }

    return { ok: true, clerkUserId };
  } catch (err) {
    // Map common jose errors to safe messages. Never leak token details.
    // jose messages include patterns like:
    //   JWTExpired: "exp" claim timestamp check failed
    //   JWTClaimValidationFailed: unexpected "iss" claim value
    //   JWTClaimValidationFailed: unexpected "aud" claim value
    //   JWSSignatureVerificationFailed
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();

      // jose expiration errors: "JWTExpired", "\"exp\" claim timestamp check failed"
      if (msg.includes('jwtexpired') || msg.includes('"exp"') || msg.includes('used before')) {
        return { ok: false, reason: 'Token has expired.' };
      }
      // jose issuer errors: "unexpected \"iss\" claim value"
      if (msg.includes('"iss"') || msg.includes('issuer mismatch')) {
        return { ok: false, reason: 'Invalid token issuer.' };
      }
      // jose audience errors: "unexpected \"aud\" claim value"
      if (msg.includes('"aud"') || msg.includes('audience mismatch')) {
        return { ok: false, reason: 'Invalid token audience.' };
      }
      if (msg.includes('signature') || msg.includes('key')) {
        return { ok: false, reason: 'Invalid token signature.' };
      }

      return { ok: false, reason: 'Invalid or expired token.' };
    }

    return { ok: false, reason: 'Token verification failed.' };
  }
}

// ---------------------------------------------------------------------------
// Production verifier
// ---------------------------------------------------------------------------
// Fetches the JWKS from the configured URL and verifies tokens against it.
// Requires CLERK_JWKS_URL. Other env vars are optional.

export function createProductionVerifier(): ClerkVerifier {
  return {
    async verifyToken(token: string, env: Env): Promise<ClerkVerifyResponse> {
      if (!env.CLERK_JWKS_URL) {
        return {
          ok: false,
          reason: 'Clerk is not configured: CLERK_JWKS_URL is missing.',
        };
      }

      const getKey = createRemoteJWKSet(new URL(env.CLERK_JWKS_URL));
      return verifyWithKeyResolver(token, env, getKey);
    },
  };
}

// ---------------------------------------------------------------------------
// Test fake verifier
// ---------------------------------------------------------------------------
// Accepts tokens that start with "test_" so tests never need real Clerk
// tokens or network calls.

export function createFakeVerifier(): ClerkVerifier {
  return {
    async verifyToken(token: string): Promise<ClerkVerifyResponse> {
      if (token.startsWith('test_')) {
        return { ok: true, clerkUserId: 'usr_test_fake' };
      }
      return { ok: false, reason: 'Invalid test token.' };
    },
  };
}

// ---------------------------------------------------------------------------
// Test verifier with a local JWKSet
// ---------------------------------------------------------------------------
// For tests that exercise real JWT verification without network calls.
// Generate local keys, export the public JWK, create a local JWKSet,
// and pass it here.

export function createTestVerifier(getKey: JWTVerifyGetKey): ClerkVerifier {
  return {
    async verifyToken(token: string, env: Env): Promise<ClerkVerifyResponse> {
      return verifyWithKeyResolver(token, env, getKey);
    },
  };
}

// Re-export jose helpers so tests can build local JWKSets without
// importing jose directly.
export { createLocalJWKSet };
