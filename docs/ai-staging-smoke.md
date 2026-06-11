# AI Staging Smoke Guide

How to verify that real Gemini text planning works through the full queue path on staging.

---

## Two verification paths

**Path A: Full system smoke** — start from the frontend or API, send a real chat message, approve, trigger generation, and verify job completion through the deployed consumer.

**Path B: Consumer script smoke** — target a specific `jobId` directly using `smokeFullQueueGemini.ts`. Useful when you already have a queued job and want to test consumer behaviour in isolation.

---

## Prerequisites

The consumer must have these env vars in staging secrets (Wrangler secrets or equivalent):

| Variable | Required | Default |
|---|---|---|
| `AI_PROVIDER` | yes | `fake` — must be set to `gemini` |
| `GEMINI_API_KEY` | yes when `gemini` | — |
| `GEMINI_TEXT_MODEL` | no | `gemini-2.0-flash-lite` |
| `GEMINI_BASE_URL` | no | googleapis.com endpoint |
| `AI_PROVIDER_TIMEOUT_MS` | no | `30000` |
| `SUPABASE_URL` | yes | — |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — |
| `ENVIRONMENT` | yes | must be `staging` |

**IMPORTANT:** Never add `GEMINI_API_KEY` to `apps/api` or `apps/web` environment variables. The key belongs only in the consumer worker's staging secrets.

---

## Path A: Full system smoke

### Step 1 — Start the staging consumer

Deploy or run the consumer with `AI_PROVIDER=gemini`:

```sh
# Local wrangler dev (staging vars from .dev.vars or wrangler secrets)
pnpm --filter @orra/consumer dev
```

Verify the consumer starts without errors. A misconfigured `AI_PROVIDER=gemini` with no `GEMINI_API_KEY` will throw immediately with:
```
Consumer environment validation failed: GEMINI_API_KEY: GEMINI_API_KEY is required when AI_PROVIDER=gemini
```

### Step 2 — Create a test project

```sh
curl -X POST https://staging.orra.app/v1/projects \
  -H "Authorization: Bearer <clerk-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Smoke test project", "workspaceId": "<workspace-id>"}'
```

Copy the `id` from the response.

### Step 3 — Send a chat prompt

```sh
curl -X POST https://staging.orra.app/v1/projects/<project-id>/messages \
  -H "Authorization: Bearer <clerk-token>" \
  -H "Content-Type: application/json" \
  -d '{"content": "Create a 3 card carousel about mindful productivity."}'
```

The director should classify this as generation intent and respond with an approval card message.

### Step 4 — Approve

```sh
curl -X POST https://staging.orra.app/v1/generate \
  -H "Authorization: Bearer <clerk-token>" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "<project-id>", "approvalMessageId": "<approval-message-id>"}'
```

Copy the `jobId` from the response.

### Step 5 — Poll the job

```sh
curl https://staging.orra.app/v1/jobs/<job-id> \
  -H "Authorization: Bearer <clerk-token>"
```

Poll until `status` is `succeeded` or `failed`. Typically completes in 2–5 seconds.

### Step 6 — Verify checklist

- [ ] Job transitions: `queued` → `running` → `succeeded`
- [ ] `result_version_id` is not null
- [ ] Artifact `current_version_id` changed (GET `/v1/projects/<id>/artifact`)
- [ ] Document cards contain plan-generated text, not fake placeholder text
- [ ] `captured_credits > 0` on the job row
- [ ] Consumer logs show:
  ```
  [provider_plan] { jobId: '...', provider: 'gemini', status: 'started' }
  [provider_plan] { jobId: '...', provider: 'gemini', status: 'succeeded', durationMs: N, cardCount: N }
  ```
- [ ] No secrets in any log line (API key value must not appear)

---

## Path B: Consumer script smoke

Use this when you have a job already in `queued` status and want to process it directly.

### Prerequisites

All env vars from the prerequisites table must be set as shell environment variables.

### Run

```sh
ORRA_SMOKE_FULL_QUEUE=1 \
AI_PROVIDER=gemini \
GEMINI_API_KEY=your-staging-key \
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-staging-service-key \
ENVIRONMENT=staging \
pnpm --filter @orra/consumer smoke:gemini-job -- --jobId <job-id>
```

Optional overrides:

```sh
GEMINI_TEXT_MODEL=gemini-2.0-flash-lite \
AI_PROVIDER_TIMEOUT_MS=15000 \
```

### Expected output

```
[smoke] Config summary:
  provider: gemini
  model: gemini-2.0-flash-lite (default)
  environment: staging
  timeout_ms: 30000 (default)
  gemini_key_present: true

[smoke] Processing job: <job-id>
[smoke] WARNING: This processes a real job in the real database. Press Ctrl+C to cancel.

[provider_plan] { jobId: '...', provider: 'gemini', status: 'started' }
[provider_plan] { jobId: '...', provider: 'gemini', status: 'succeeded', durationMs: 1234, cardCount: 3 }
[smoke] Job succeeded. resultVersionId: ..., capturedCredits: 10, durationMs: 2345
[smoke] SUCCESS
```

### Safety guards built into the script

- Exits if `ORRA_SMOKE_FULL_QUEUE` is not `1`
- Exits if `ENVIRONMENT=production`
- Exits if `AI_PROVIDER` is not `gemini`
- Exits if `GEMINI_API_KEY` is missing
- Never prints the API key value — only `gemini_key_present: true/false`
- Never prints raw prompt text or raw Gemini response
- Never prints full artifact JSON

---

## Failure checklist

| Symptom | Likely cause | Fix |
|---|---|---|
| Worker startup error: `GEMINI_API_KEY is required` | `AI_PROVIDER=gemini` without key | Add `GEMINI_API_KEY` to worker secrets |
| Job fails with `PROVIDER_TIMEOUT` | Gemini response took > `AI_PROVIDER_TIMEOUT_MS` | Increase timeout or check model endpoint |
| Job fails with `PROVIDER_HTTP_ERROR` | Gemini returned HTTP 4xx/5xx | Check API key validity and quota |
| Job fails with `PROVIDER_INVALID_RESPONSE` | Gemini response JSON malformed or envelope mismatch | Check model version; try `gemini-1.5-flash` as fallback |
| Job fails with `MOCK_GENERATION_FAILED` | Document schema validation failed | Check `packages/shared` schema; compare plan output |
| Smoke script exits: `ORRA_SMOKE_FULL_QUEUE=1 required` | Guard check failed | Set the env var |
| Smoke script exits: `refused: ENVIRONMENT=production` | Pointed at production | Switch to staging Supabase URL and key |
| Credits not captured | Job had `reserved_credits: 0` | Reserve credits at job creation time |
| Job already processed | Script ran on a non-queued job | Create a fresh queued job |

---

## Provider isolation smoke (no queue)

If you only want to test that Gemini text planning works without touching the queue or database:

```sh
GEMINI_API_KEY=your-key pnpm --filter @orra/ai smoke:gemini
```

This calls `GeminiTextProvider.planText` directly and prints a safe result summary. It does not touch the queue, database, or credit ledger.
