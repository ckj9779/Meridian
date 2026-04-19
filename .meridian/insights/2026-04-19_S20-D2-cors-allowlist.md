# Insight Ledger — S20 D2 CORS Allowlist
Date: 2026-04-19
Session: 20
Prompt: S20-D2-cors-allowlist.md
Issues closed: MER-42

## Findings

- **assumption_validated** — `@fastify/cors@11.2.0` installed cleanly against
  Fastify v5.8.5. Zero peer dependency warnings. Zero vulnerabilities.
  Compatible with the v5 plugin API used throughout src/index.ts.

- **assumption_validated** — CORS plugin registered before all route handlers
  in src/index.ts. No existing registrations required reordering. The correct
  insertion point was immediately after the Fastify instance creation and before
  the first `await app.register(routeHandler)` call. Insert-only; no moves.

- **exception** — `@fastify/cors` returns HTTP 204 (not 400/403) for disallowed
  origins. The plugin omits `Access-Control-Allow-Origin` from the response
  rather than returning an error status code. This is correct per the CORS spec:
  browsers gate on the presence and value of the `Access-Control-Allow-Origin`
  response header, not the HTTP status. A missing header is a browser-level
  rejection. The other Allow-* headers (`Allow-Credentials`, `Allow-Methods`,
  `Allow-Headers`) are present in the disallowed-origin response but are
  inert without `Allow-Origin`. Security property holds.

- **assumption_validated** — All three smoke tests passed. Allowed-origin
  preflight returned 204. Disallowed-origin preflight returned 204 with no
  `Access-Control-Allow-Origin`. Health check returned `{"status":"ok"}`.

- **environment** — tsx watch auto-reload is unreliable for this change (same
  Windows file watcher issue observed in D3). Dev server manual restart was
  required before smoke tests. Confirmed: manual restart resolves the issue
  for CORS changes just as it did for the health route change.

## Configuration Applied

Origins allowlisted:
- https://mydatasphere.dev
- https://api.mydatasphere.dev
- http://localhost:3000 (dev only)

Methods: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS
AllowedHeaders: Content-Type, Authorization
Credentials: true

## Scope Boundaries Observed

- No test runner: absent from package.json. Deferred to D1.
- CORS registered in src/index.ts only. No per-route CORS overrides added.
- No route handler files modified.
- package.json and package-lock.json updated by npm install only.
