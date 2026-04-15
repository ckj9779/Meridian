# Insight Ledger: Phase 0 API Routes

## Session Info
- Date: 2026-04-15
- Prompt: MERIDIAN_CLAUDE_CODE_PHASE0_API_ROUTES.md
- Scope: Add read-only query endpoints for Phase 0 tables (decisions, issues, sessions, system_context, stack_components, model_preferences)

## Insights

### INS-001 | assumption_invalidated | Step 2
**Observation:** The prompt specifies a response envelope shape of `{ data, meta: { total, limit, offset } }` and 404 errors as `{ error: "not_found", message }`. `docs/CODING_STANDARDS.md:148-171` mandates `{ ok: true, data, meta }` / `{ ok: false, error: { code, message, details? } }`, and `src/types/index.ts` already exports `ApiSuccess<T>` / `ApiError` matching the doc. Per prompt Constraint #1 ("If CLAUDE.md or any doc contradicts this prompt, the doc governs"), I am following the doc envelope.
**Affected:** `src/utils/query.ts`, all `src/routes/*.ts` files produced in this session.
**Proposed action:** Update the prompt template for future sessions to reference the doc envelope, or explicitly call out that the doc governs.
**Severity:** info

### INS-002 | assumption_validated | Step 3a, 3b
**Observation:** The prompt describes friendly-ID lookup for `D01`/`MER-01` as requiring a row-number or sequence-position computation. DATABASE.md confirms `decisions.id` is `varchar(10) PRIMARY KEY` storing values like `D01` directly, and `issues.id` is `varchar(20) PRIMARY KEY` storing `MER-01` directly. No row-number logic is needed; a case-insensitive equality on the primary key column (`upper(id) = upper($1)`) is both simpler and correct.
**Affected:** `src/routes/decisions.ts`, `src/routes/issues.ts`.
**Proposed action:** Future prompt iterations should describe these IDs as "primary-key strings" rather than "friendly ID lookup requiring row-number logic".
**Severity:** info

### INS-003 | convention_gap | Step 3f
**Observation:** The prompt directs `GET /api/models` ordering by `created_at ASC`, but `model_preferences` (per DATABASE.md / migration 001) does not have a `created_at` column — only `updated_at` and the natural columns `task_type`, `provider`, `is_default`. Ordering by `updated_at ASC` is possible but unstable for the use case (defaults should appear first within a task type). I am ordering by `task_type ASC, is_default DESC, updated_at ASC`.
**Affected:** `src/routes/models.ts`, future `docs/DATABASE.md` if a `created_at` column is desired for symmetry.
**Proposed action:** Either (a) accept the substitute ordering, or (b) add `created_at timestamptz NOT NULL DEFAULT now()` to `model_preferences` in a future migration for consistency with the other Phase 0 tables.
**Severity:** info

### INS-004 | convention_gap | Step 3e
**Observation:** The prompt names the stack_components ordering column as `name`, but the table has no such column. Per DATABASE.md and migration 002, the human-readable column is `component varchar(100) NOT NULL UNIQUE`. Ordering by `phase ASC NULLS LAST, component ASC`.
**Affected:** `src/routes/stack.ts`.
**Proposed action:** Minor — prompt template should refer to the column as `component`.
**Severity:** info

### INS-005 | recommendation | Step 4
**Observation:** All six new endpoints emit stable, cacheable JSON representations of state that changes only on migration or seed — excellent candidates for ETag/If-None-Match caching at the Zuplo layer. Since Zuplo already offers semantic caching, the Fastify service can stay dumb about this, but if caching ever moves origin-side we should add `ETag` headers computed over `max(updated_at|created_at)` per table.
**Affected:** Future Zuplo configuration; no immediate code change.
**Proposed action:** Note in Zuplo policy design to set `Cache-Control: public, max-age=60` (or similar) on `/api/*` proxied routes.
**Severity:** info

### INS-006 | recommendation | Step 2
**Observation:** The shared `ApiSuccess<T>.meta` type in `src/types/index.ts:139-143` exposes `total`, `page`, `per_page` — but the pagination contract this session adopts uses `limit`/`offset`. Rather than introducing a parallel `page/per_page` translation, I am extending `meta` to allow `limit?: number; offset?: number;` alongside the existing fields (additive, non-breaking).
**Affected:** `src/types/index.ts` (narrow additive edit).
**Proposed action:** Either standardize on `limit`/`offset` project-wide (recommended — matches OFFSET/LIMIT SQL directly and what agents already pass as query params) and drop `page`/`per_page`, or document both pagination styles in `docs/CODING_STANDARDS.md`.
**Severity:** info

## Routing Summary

| # | Type | Insight | Routes to | Action needed |
|---|------|---------|-----------|---------------|
| INS-001 | assumption_invalidated | Response envelope mismatch (prompt vs CODING_STANDARDS) | Phase-0 prompt template | Update prompt to reference `ApiSuccess<T>` / `ApiError` from `src/types/index.ts` so future sessions don't relitigate |
| INS-002 | assumption_validated | `decisions.id` / `issues.id` are varchar PKs storing `D01`/`MER-01` directly | Phase-0 prompt template | Revise "row-number lookup" wording to "PK match via `upper(id) = upper($1)`" |
| INS-003 | convention_gap | `model_preferences` lacks `created_at` | `docs/DATABASE.md` or future migration | Either accept current ordering (task_type ASC, is_default DESC, updated_at ASC) or add `created_at` column in a future migration for consistency |
| INS-004 | convention_gap | `stack_components` column is `component`, not `name` | Phase-0 prompt template | Correct column name in future prompt templates |
| INS-005 | recommendation | Phase-0 read endpoints are cacheable | Zuplo policy design | When configuring Zuplo, add `Cache-Control: public, max-age=60` on `/api/*` proxied routes; consider origin ETag later |
| INS-006 | recommendation | `ApiSuccess<T>.meta` carried `page`/`per_page`, new routes use `limit`/`offset` | `docs/CODING_STANDARDS.md` | Standardize on `limit`/`offset` project-wide and drop `page`/`per_page`, OR document both styles. Additive edit to `src/types/index.ts` already in place |

### Files produced this session

```
src/utils/query.ts                                      (NEW)
src/routes/decisions.ts                                 (NEW)
src/routes/issues.ts                                    (NEW)
src/routes/sessions.ts                                  (NEW)
src/routes/context.ts                                   (NEW)
src/routes/stack.ts                                     (NEW)
src/routes/models.ts                                    (NEW)
src/index.ts                                            (MODIFIED — route registration only)
src/types/index.ts                                      (MODIFIED — additive meta.limit/offset fields, INS-006)
.meridian/insights/2026-04-15_phase0-api-routes.md      (NEW — this ledger)
```

### Verification checkpoint

Table row counts at session start: decisions=32, issues=23, sessions=6, system_context=1, model_preferences=4, stack_components=8.

All endpoint tests passed on localhost:3001 against Railway PG:
- List routes return correct `{ ok: true, data: [...], meta: { total, limit, offset } }`
- Single-resource routes return `{ ok: true, data: {...} }`
- 404s return `{ ok: false, error: { code: 'not_found', message } }` with HTTP 404
- `limit=300` clamps silently to 200
- Filters (`session`, `severity`, `phase`) correctly narrow results
- Case-insensitive ID lookup works (`D01` and `d01` both resolve)
- `npx tsc --noEmit` reports zero errors

