# Orra API Auth Architecture

## Public routes

- `GET /health`
- `GET /v1/health`
- `OPTIONS` preflight requests

These routes do not require authentication.

## Protected routes

All other `/v1/*` routes require a valid Clerk JWT passed in the `Authorization: Bearer <token>` header.

Future route modules (projects, artifacts, brand-systems, assets, export, credits, billing) will mount under `/v1` and inherit auth automatically.

## Dev auth fallback

In development/test environments, setting `DEV_AUTH_ENABLED=true` allows protected routes to accept requests without a Bearer token. The middleware falls back to a fixed dev `AuthContext`.

Dev auth is **disabled in production** regardless of the flag.

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

- `clerkUserId` is resolved from the Clerk JWT.
- `userId`, `workspaceId`, and `role` remain undefined in Phase 7B because they require DB workspace bootstrap (a later phase).

## Clerk env variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLERK_SECRET_KEY` | For real verification | Clerk backend secret |
| `CLERK_JWKS_URL` | Optional | JWKS endpoint override |
| `CLERK_JWT_ISSUER` | Optional | JWT issuer override |
| `CLERK_AUDIENCE` | Optional | Expected audience |
| `DEV_AUTH_ENABLED` | Optional | `true` to enable dev fallback |

The production verifier skeleton exists but does not perform real JWT verification yet. Phase 7B establishes the boundary; a future phase wires the real Clerk SDK or `jose` JWKS verification.

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
