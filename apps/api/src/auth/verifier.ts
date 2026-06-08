import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// Clerk verifier adapter
// ---------------------------------------------------------------------------
// This boundary isolates token verification so the middleware stays
// testable and provider-agnostic. A future phase swaps the production
// skeleton for real JWT verification (e.g. via @clerk/backend or jose).

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
// Production skeleton
// ---------------------------------------------------------------------------
// Returns a verifier that checks env config and performs no real
// verification in Phase 7B. The skeleton structure is correct; the
// implementation will be completed when Clerk JWT verification is wired.

export function createProductionVerifier(): ClerkVerifier {
  return {
    async verifyToken(_token: string, env: Env): Promise<ClerkVerifyResponse> {
      if (!env.CLERK_SECRET_KEY) {
        return { ok: false, reason: 'Clerk is not configured: CLERK_SECRET_KEY is missing.' };
      }
      // TODO: real JWT verification using JWKS (future phase).
      // For now, reject every token so production cannot accidentally
      // accept fake credentials until the real verifier is implemented.
      return { ok: false, reason: 'Production verifier not implemented yet.' };
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
