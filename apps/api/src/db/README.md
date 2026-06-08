# API Database Boundary

Phase 7C establishes the clean Supabase DB access layer for `apps/api`.

## Principles

- **Supabase client creation is centralized** in `apps/api/src/db/client.ts`.
- **Service role key is server-only** and never leaked in errors or logs.
- **Routes must not import Supabase directly** — they receive a `DbClient` via service context.
- **Repositories own DB query details** — they depend on `DbClient` and encapsulate SQL.
- **Services own authorization and business logic** — they use repositories, not raw queries.
- **Tests use fake DB/repositories** — no network calls to real Supabase.

## Structure

```
apps/api/src/db/
  client.ts      # createDbClient / createServiceDbClient factory
  errors.ts      # mapDbError, expectSingleRow, expectRows helpers

apps/api/src/repositories/
  types.ts              # Repositories context shape
  userRepository.ts     # interface + stub
  workspaceRepository.ts# interface + stub
  projectRepository.ts  # interface placeholder

apps/api/src/services/
  service-context.ts  # carries env, auth, lazy db, lazy repositories
```

## Lazy DB Access

Health routes do not require Supabase env. DB is created lazily via `getDbClient(ctx)` and `getRepositories(ctx)` only when a service actually needs it.

## Error Mapping

| Postgres / PostgREST code | ApiError code | Meaning |
| --- | --- | --- |
| `23505` unique violation | `CONFLICT` | Resource already exists |
| `23503` foreign key violation | `VALIDATION` | Reference to missing resource |
| `23514` check violation | `VALIDATION` | Business rule violated |
| `PGRST116` zero rows | `NOT_FOUND` | No matching row |
| unknown | `INTERNAL` | Generic DB error |

## No Real CRUD Yet

Phase 7C is the boundary only. Repository stubs throw "not implemented" for every method. Real queries arrive in the user/workspace bootstrap and project CRUD phases.
