# Insight Ledger — S20 D3 Health Narrow
Date: 2026-04-19
Session: 20
Prompt: S20-D3-health-narrow.md
Issues closed: MER-43, MER-67

## Findings

- **assumption_validated** — Only `src/routes/health.ts` required modification.
  The exported function name (`healthRoute`) and Fastify plugin registration in
  `src/index.ts` are unchanged. HC-13 scope boundary held exactly.

- **assumption_validated** — After removing `testConnection`, `HealthPayload`,
  `PHASE0_VERSION`, and `PHASE0_NUMBER`, the `FastifyInstance` import is the
  sole remaining import and is still required for the plugin signature. No
  orphaned imports remain.

- **assumption_validated** — TypeScript `strict: true` does not enable
  `noUnusedParameters`. Removing `reply` from the handler parameter list
  entirely (rather than prefixing it `_reply`) is valid: a function with fewer
  parameters is assignable to a type with more in TypeScript. tsc --noEmit
  confirmed zero errors pre- and post-change.

- **environment** — `tsx watch` on Windows did not detect the file change after
  13+ seconds across three polling cycles. Smoke test could not be completed
  via Claude Code. Root cause: Windows `fs.watch` is unreliable; `tsx watch`
  may default to event-based watching rather than polling on Windows paths
  accessed through Git Bash. Mitigation for future Claude Code sessions: either
  restart the dev server manually before running smoke tests, or pass `--poll`
  to tsx watch in the dev script. Routing target: CLAUDE.md Environment section
  and/or `docs/CODING_STANDARDS.md` testing notes.

- **convention_gap** — `/health` response body does not follow the
  `ApiSuccess<T>` envelope defined in `docs/CODING_STANDARDS.md`. This is
  intentional per D64 (liveness probe must be narrow), but the deviation is not
  documented in CODING_STANDARDS.md. Future maintainers reading that doc would
  not know why `/health` diverges. Routing target: `docs/CODING_STANDARDS.md`
  — add a note that liveness/readiness probes are exempt from the envelope
  convention per D64/D66.

## Pre-Change Baseline

Health response body before change (confirmed by live smoke test):
```json
{"status":"ok","version":"0.1.0","phase":0,"timestamp":"2026-04-19T14:26:44.957Z","database":"connected"}
```

HTTP status before change: 200 on DB success, 503 on DB error.

## Post-Change Body

```json
{"status":"ok"}
```

HTTP status after change: always 200. No DB query.

## Scope Boundaries Observed

- Test runner: absent from package.json. Test infrastructure deferred to D1
  (shared-secret middleware) per HC-13 scope decision (Session 17).
- No other files modified — only `src/routes/health.ts` and this ledger.
- Smoke test blocked by tsx watch reload issue (see environment finding above).
  tsc --noEmit passed clean. Planning session authorized proceeding to commit.
