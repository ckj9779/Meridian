# Insight Ledger — S20 D1 Gateway Secret Middleware
Date: 2026-04-19
Session: 20
Prompt: S20-D1-gateway-middleware.md
Issues closed: MER-26, MER-27

## Findings

- **assumption_validated** — onRequest hook fires before route handlers as
  expected. Test 2 (valid secret) returned the full decisions payload,
  confirming the hook passes control to the route when the secret is correct.
  Tests 3 and 4 (missing/wrong secret) returned 401 without reaching any
  route handler.

- **assumption_validated** — /health bypass works correctly. Test 1 returned
  {"status":"ok"} with no x-gateway-secret header present. BYPASS_PATHS
  check on request.url fires before the secret validation block.

- **assumption_validated** — src/middleware/ directory did not exist prior to
  this change. Created implicitly by writing gateway.ts. CODING_STANDARDS.md
  file structure diagram confirms this is the correct location for
  "Harness enforcement, auth, validation" files.

- **convention_gap** — CODING_STANDARDS.md is cited in CLAUDE.md's doc
  governance table as covering "middleware ordering per INS-013/INS-056" but
  neither insight ID appears in the file. The insights were not applied to the
  doc. Routing target: docs/CODING_STANDARDS.md — add a middleware ordering
  section documenting the CORS → onRequest hooks → route registrations order
  as established by D2 and D1.

- **assumption_validated** — Copyright header added to gateway.ts per
  CODING_STANDARDS.md rule 4 and D25. Prompt spec showed the implementation
  without a header; project convention requires it on every source file.
  Pre-commit hook confirmed the header is present (no warning on gateway.ts).

- **environment** — tsx watch manual restart again required before smoke tests.
  Same Windows file watcher issue observed in D3 and D2. Three occurrences now
  confirm this is a consistent environment constraint for all Claude Code
  sessions, not a one-off.

## Implementation Notes

- Hook: onRequest (first in lifecycle, before body parsing)
- Bypass: /health (per D64, Railway deploy probe must remain public)
- Header name: x-gateway-secret
- Env var: BACKEND_SECRET
- 500 on missing env var (misconfiguration, not auth failure)
- 401 on missing or wrong header
- Response envelope matches CODING_STANDARDS.md ApiError shape

## Ordering in src/index.ts

1. @fastify/cors (D2)
2. app.addHook('onRequest', gatewaySecretHook) (D1)
3. Route registrations (unchanged)

## Scope Boundaries

- No test runner added (deferred to Sprint 10a)
- /secrets/SECRETS.md updated manually by Chaz (gitignored)
- Zuplo header injection policy: separate out-of-band step (D4 prompt)
- No route handler files modified
