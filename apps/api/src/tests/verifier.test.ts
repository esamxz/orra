import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import {
  createProductionVerifier,
  createTestVerifier,
  createLocalJWKSet,
} from '../auth/verifier.js';
import type { Env } from '../env.js';

describe('production Clerk verifier', () => {
  describe('env validation', () => {
    it('fails safely when CLERK_JWKS_URL is missing', async () => {
      const verifier = createProductionVerifier();
      const env = { ENVIRONMENT: 'production' } as unknown as Env;
      const result = await verifier.verifyToken('any-token', env);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('CLERK_JWKS_URL is missing');
      }
    });
  });
});

describe('JWT verification with local keys (no network)', () => {
  let privateKey: CryptoKey;
  let publicJwk: JWK;
  let jwksUrl: string;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    publicJwk = await exportJWK(pair.publicKey);
    publicJwk.kid = 'test-key-1';
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    publicJwk.key_ops = ['verify'];

    // We don't use a real URL in tests; createTestVerifier accepts a getKey
    // function directly so no fetch is needed.
    jwksUrl = 'https://test.clerk.dev/.well-known/jwks.json';
  });

  function buildEnv(overrides?: Partial<Env>): Env {
    return {
      ENVIRONMENT: 'production',
      CLERK_JWKS_URL: jwksUrl,
      CLERK_JWT_ISSUER: 'https://test.clerk.dev',
      CLERK_AUDIENCE: 'orra-api',
      ...overrides,
    } as unknown as Env;
  }

  async function signTestToken(claims: Record<string, unknown> = {}, expiry?: string): Promise<string> {
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuedAt()
      .setIssuer('https://test.clerk.dev')
      .setAudience('orra-api');

    if (expiry) {
      jwt.setExpirationTime(expiry);
    } else {
      jwt.setExpirationTime('1h');
    }

    return jwt.sign(privateKey);
  }

  it('accepts a valid JWT and returns clerkUserId from sub', async () => {
    const token = await signTestToken({ sub: 'usr_test_abc123' });
    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);
    const result = await verifier.verifyToken(token, buildEnv());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clerkUserId).toBe('usr_test_abc123');
    }
  });

  it('rejects an expired JWT', async () => {
    const token = await signTestToken({ sub: 'usr_test_expired' }, '-300s');
    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);
    const result = await verifier.verifyToken(token, buildEnv());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Token has expired.');
    }
  });

  it('rejects a token with wrong issuer', async () => {
    const token = await new SignJWT({ sub: 'usr_test_wrong_issuer' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuedAt()
      .setIssuer('https://evil.clerk.dev')
      .setAudience('orra-api')
      .setExpirationTime('1h')
      .sign(privateKey);

    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);
    const result = await verifier.verifyToken(token, buildEnv());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Invalid token issuer.');
    }
  });

  it('rejects a token with wrong audience', async () => {
    const token = await new SignJWT({ sub: 'usr_test_wrong_aud' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuedAt()
      .setIssuer('https://test.clerk.dev')
      .setAudience('wrong-audience')
      .setExpirationTime('1h')
      .sign(privateKey);

    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);
    const result = await verifier.verifyToken(token, buildEnv());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Invalid token audience.');
    }
  });

  it('rejects a token with missing sub claim', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuedAt()
      .setIssuer('https://test.clerk.dev')
      .setAudience('orra-api')
      .setExpirationTime('1h')
      .sign(privateKey);

    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);
    const result = await verifier.verifyToken(token, buildEnv());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('JWT missing subject claim.');
    }
  });

  it('rejects a token signed with a different key', async () => {
    // Generate a different key pair
    const otherPair = await generateKeyPair('RS256', { extractable: true });
    const token = await new SignJWT({ sub: 'usr_test_other_key' })
      .setProtectedHeader({ alg: 'RS256', kid: 'other-key' })
      .setIssuedAt()
      .setIssuer('https://test.clerk.dev')
      .setAudience('orra-api')
      .setExpirationTime('1h')
      .sign(otherPair.privateKey);

    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);
    const result = await verifier.verifyToken(token, buildEnv());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Invalid token signature.');
    }
  });

  it('rejects a malformed token', async () => {
    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);
    const result = await verifier.verifyToken('not-a-real-jwt', buildEnv());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Invalid or expired token.');
    }
  });

  it('does not expose the raw token in the failure reason', async () => {
    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);
    const result = await verifier.verifyToken('super-secret-token-xyz', buildEnv());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toContain('super-secret-token-xyz');
    }
  });

  it('works when issuer and audience are not configured', async () => {
    const token = await signTestToken({ sub: 'usr_test_no_constraints' });
    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    const verifier = createTestVerifier(getKey);
    const result = await verifier.verifyToken(
      token,
      buildEnv({ CLERK_JWT_ISSUER: undefined, CLERK_AUDIENCE: undefined })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clerkUserId).toBe('usr_test_no_constraints');
    }
  });
});
