# Orra API Auth Architecture

## Public routes

- `GET /health`
- `GET /v1/health`
- `OPTIONS` preflight requests

These routes do not require authentication and skip workspace bootstrap.

## Protected routes

All other `/v1/*` routes require a valid Clerk JWT passed in the `Authorization: Bearer <token>` header.

After Clerk JWT verification succeeds, the middleware bootstraps the app-side user and workspace:

1. **Find or create user** — looked up by `clerk_id`; created from JWT claims (`sub`, `email`, `name`)
2. **Find or create personal workspace** — every user gets one personal workspace on first request
3. **Create owner membership** — `workspace_members` row with role `owner`
4. **Populate full AuthContext** — `userId`, `workspaceId`, `role`

If the database is not configured, protected routes return `INTERNAL` (500) because the server cannot complete authorization bootstrap.

Future route modules (projects, artifacts, brand-systems, assets, export, credits, billing) will mount under `/v1` and inherit auth + bootstrap automatically.

## Production auth: real Clerk JWT/JWKS verification

Phase 7B.1 replaces the skeleton verifier with real JWT verification via the `jose` library (Web Crypto API, fully Cloudflare Workers compatible).

Verification steps:
1. Fetch the JWKS from the configured `CLERK_JWKS_URL`
2. Verify the JWT signature against the JWKS
3. Verify expiration (with 60-second clock skew tolerance)
4. Verify issuer if `CLERK_JWT_ISSUER` is configured
5. Verify audience if `CLERK_AUDIENCE` is configured
6. Extract the Clerk user ID from the `sub` claim
7. Extract optional `email` and `name` claims for user creation

The production verifier returns `UNAUTHENTICATED` for any failure. It never logs or exposes raw tokens, claims, or JWKS internals.

## Dev auth fallback

In development/test environments, setting `DEV_AUTH_ENABLED=true` allows protected routes to accept requests without a Bearer token. The middleware falls back to a fixed dev `AuthContext`.

Dev auth is **disabled in production** regardless of the flag. Production routes require real Clerk JWTs.

## AuthContext shape

```ts
interface AuthContext {
  isAuthenticated: boolean;
  clerkUserId: string;
  userId?: string;
  workspaceId?: string;
  role?: 'owner' | 'admin' | 'member';
  authSource: 'clerk' | 'dev' | 'none';
}
```

- `clerkUserId` is resolved from the verified Clerk JWT.
- `userId`, `workspaceId`, and `role` are populated by the workspace bootstrap service (Phase 7D) on protected routes.
- `AuthContext` on public/OPTIONS routes has `isAuthenticated: false` and omits `userId`/`workspaceId`/`role`.

## Clerk env variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLERK_JWKS_URL` | **Yes** for production | Clerk JWKS endpoint (e.g. `https://<domain>/.well-known/jwks.json`) |
| `CLERK_JWT_ISSUER` | Optional | Expected JWT issuer |
| `CLERK_AUDIENCE` | Optional | Expected JWT audience |
| `CLERK_SECRET_KEY` | Optional | Clerk backend secret (for future backend API calls, not JWT verification) |
| `DEV_AUTH_ENABLED` | Optional | `true` to enable dev fallback |

`CLERK_SECRET_KEY` is not used for JWT verification in Phase 7B.1; only the public JWKS is needed.

## Error format

Auth failures return the standard API error shape:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication required.",
    "requestId": "..."
  }
}
```

Raw tokens are never logged or exposed in responses.

## Testing

Tests generate local RSA key pairs, sign test JWTs, and verify them through the same `jose` path used in production. No network calls to Clerk are made in tests.

The `createTestVerifier(getKey)` helper lets tests inject a local JWKSet so the full middleware + verifier stack can be exercised without real Clerk infrastructure.

For bootstrap integration tests, fake repositories are injected via the optional `overrides` parameter on `createAuthMiddleware` so no live Supabase is required.

## Next steps

- Phase 8A: Project CRUD (create, list, get, update, delete)
