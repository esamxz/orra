# orra

## Phase 10D: Real usage status frontend wiring

- Frontend usage status now reads from `GET /v1/credits`.
- Credit status is workspace-scoped.
- Credit mutations (grant, reserve, capture, refund) remain backend/internal only.
- Dodo Payments, checkout, and billing UI will come in a later phase.
- See `apps/web/src/api/credits.ts`, `apps/web/src/hooks/useCreditStatus.ts`, and `apps/web/src/components/workspace/UsageStatus.tsx`.
