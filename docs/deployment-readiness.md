# Deployment Readiness Checklist

Safety reference for staging and production deployments of Orra.

## App URLs

| Environment | API | Web |
|-------------|-----|-----|
| Staging | (set after first staging deploy) | (set after first staging deploy) |
| Production | (set before production launch) | (set before production launch) |

---

## Required Secrets — API (`orra-api`)

Set via `wrangler secret put --env staging` / `--env production`. Never commit values.

| Secret | Required in | Notes |
|--------|-------------|-------|
| `SUPABASE_URL` | staging, production | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | staging, production | Service role key — never expose to frontend |
| `CLERK_JWKS_URL` | staging, production | Clerk JWKS endpoint URL |
| `CLERK_JWT_ISSUER` | staging, production | Clerk JWT issuer URL |
| `CLERK_SECRET_KEY` | staging, production | Clerk secret key |
| `CLERK_AUDIENCE` | optional | Clerk audience claim |
| `R2_ACCESS_KEY_ID` | staging, production | R2 S3-compatible access key |
| `R2_SECRET_ACCESS_KEY` | staging, production | R2 S3-compatible secret key |
| `ALLOWED_ORIGINS` | staging, production | Comma-separated CORS origins (required) |
| `INITIAL_CREDIT_GRANT` | optional | Credits on first workspace creation; default 0 |
| `PRIVATE_ALPHA_EMAIL_ALLOWLIST` | optional | Comma-separated emails; if unset, all Clerk users allowed |

---

## Required Secrets — Consumer (`orra-consumer`)

| Secret | Required in | Notes |
|--------|-------------|-------|
| `SUPABASE_URL` | always | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | always | Service role key |
| `AI_PROVIDER` | production | Must be `gemini` (not `fake`) in production |
| `GEMINI_API_KEY` | when `AI_PROVIDER=gemini` or `IMAGE_PROVIDER=gemini` | Shared key for text and image; never expose in web or API |
| `GEMINI_TEXT_MODEL` | optional | Defaults to `gemini-2.0-flash-lite` |
| `IMAGE_PROVIDER` | production | Must be `gemini` (not `fake`) in production |
| `GEMINI_IMAGE_MODEL` | optional | Defaults to `gemini-2.5-flash-image`; override to pin a specific model |
| `ALLOW_FAKE_PROVIDER_IN_PRODUCTION` | emergency only | Set to `'true'` only for debugging; remove after |

---

## Provider Mode Policy

| Environment | AI provider | Image provider | Notes |
|-------------|-------------|----------------|-------|
| development | `fake` (default) | `fake` (default) | Dev auth, queue bypass allowed |
| staging | `fake` or `gemini` | `fake` or `gemini` | Fake allowed for smoke testing |
| production | `gemini` required | `gemini` required | Fake blocked; `validateConsumerEnv` throws on startup if fake |

**Rule:** If `ENVIRONMENT=production` and providers are unset or `fake`, the consumer Worker fails to start with a clear error — it never silently falls back to fake in production.

**Emergency escape:** `ALLOW_FAKE_PROVIDER_IN_PRODUCTION=true` bypasses the production fake-provider guard. Use only for incident debugging; remove immediately after.

---

## CORS / Allowed Origins Policy

| Environment | Localhost origins | Configured origins |
|-------------|-------------------|--------------------|
| development | Auto-added (`:5173`, `:3000`) | ALLOWED_ORIGINS (if set) |
| staging | Never included | ALLOWED_ORIGINS only |
| production | Never included | ALLOWED_ORIGINS only |

**Rule:** CORS never uses `Access-Control-Allow-Origin: *` for credentialed routes. The middleware reflects the exact origin or omits the header entirely.

**Example staging value:** `https://orra-web.pages.dev,https://*.orra-web.pages.dev`

---

## R2 CORS Configuration (staging)

Required for browser-direct presigned PUT uploads.

```json
[
  {
    "AllowedOrigins": ["https://your-staging-web-origin.pages.dev"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Configure via Cloudflare dashboard or `wrangler r2 bucket cors put orra-assets-staging --rules <file>`.

R2 CORS for production is not configured until production deployment is explicitly planned.

---

## What Must Never Be Enabled in Staging or Production

| Flag | Why |
|------|-----|
| `DEV_AUTH_ENABLED=true` | Bypasses Clerk JWT — any request would be authenticated as a stub user. `validateApiEnv` throws on startup if set. |
| `DEV_GENERATION_QUEUE_DISABLED=true` | Skips queue — generation would not work. `validateApiEnv` throws on startup if set. |
| `AI_PROVIDER=fake` (production) | Fake AI output in production is a correctness failure. Blocked by `validateConsumerEnv`. |
| `IMAGE_PROVIDER=fake` (production) | Same as above. Blocked by `validateConsumerEnv`. |
| `IMAGE_PROVIDER=flux` (any env) | Deprecated since D5.2. `validateConsumerEnv` throws on startup. Use `IMAGE_PROVIDER=gemini`. |
| `VITE_DEV_AUTH_TOKEN_ENABLED=true` in web | Frontend dev token bypass — must not be set in deployed web builds. |

---

## Private-Alpha Access Control

**Current policy (staging / private alpha):** `PRIVATE_ALPHA_EMAIL_ALLOWLIST` is optional.

- If **unset**: any valid Clerk user may access staging.
- If **set**: only listed emails (comma-separated) are allowed; all others receive `403 FORBIDDEN`.
- Matching is case-insensitive.
- The check runs after Clerk JWT verification, before DB user/workspace creation.

**For production launch:** Set `PRIVATE_ALPHA_EMAIL_ALLOWLIST` before making the URL public, or remove it only when you are ready for open access.

---

## Production Preflight Checklist

Before any production deployment:

- [ ] All required API secrets set via `wrangler secret put --env production`
- [ ] All required consumer secrets set via `wrangler secret put --env production`
- [ ] `ALLOWED_ORIGINS` contains only the production web origin (no localhost)
- [ ] `DEV_AUTH_ENABLED` is NOT set in production
- [ ] `DEV_GENERATION_QUEUE_DISABLED` is NOT set in production
- [ ] `AI_PROVIDER=gemini` with valid `GEMINI_API_KEY` in consumer
- [ ] `IMAGE_PROVIDER=gemini` with valid `GEMINI_API_KEY` in consumer (key shared with AI provider)
- [ ] `GEMINI_IMAGE_MODEL` set or confirmed to use default (`gemini-2.5-flash-image`)
- [ ] `ALLOW_FAKE_PROVIDER_IN_PRODUCTION` is NOT set (or removed after incident)
- [ ] `PRIVATE_ALPHA_EMAIL_ALLOWLIST` is set (or explicit decision to allow open access)
- [ ] Wrangler dry-run passes: `pnpm --filter @orra/api run deploy:production:dry-run`
- [ ] Wrangler dry-run passes: `pnpm --filter @orra/consumer run deploy:production:dry-run`
- [ ] All staging smoke tests pass with the build being promoted

---

## Error Response Policy

| Environment | 500-class error message | Notes |
|-------------|------------------------|-------|
| development | Generic `"An unexpected error occurred."` | Stack logged to console only |
| staging | Actual `err.message` (for debugging smokes) | No stack, no secrets |
| production | Generic `"An unexpected error occurred."` | Nothing internal exposed |

Secrets (keys, tokens, connection strings) must never appear in error responses in any environment. `ApiError` messages are controlled and safe. Unknown errors are sanitized by the error handler before returning to the client.
