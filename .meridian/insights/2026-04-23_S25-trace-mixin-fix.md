# Insight Ledger — Session 25 Trace Mixin Fix
**Date:** 2026-04-23
**Prompt:** MERIDIAN_TRACE_MIXIN_FIX_PROMPT.md

| # | Type | Finding | Routing target |
|---|------|---------|----------------|
| INS-001 | assumption_validated | `AsyncLocalStorage` from `node:async_hooks` is a Node.js built-in — no npm install required. Available since Node 12.17.0; `enterWith()` available since Node 16. Confirmed compatible with Node 22. | — |
| INS-002 | assumption_validated | `request.callerIdentity` is declared in `fastify.d.ts` but is never assigned by any existing hook. In `audit.ts`, `callerIdentity` is a local variable in `auditHook` (onResponse), not stored on the request. `requestContext.enterWith()` in `traceHook` will correctly use `null` for callerIdentity; V4 verification expected to show `null` until a follow-up fix populates it. | — |
| INS-003 | convention_gap | `src/index.ts` line 1 copyright header reads "ckj9779" instead of "Charles K. Johnson". Out of scope this session (HC-13). | CLAUDE.md / coding standards |
| INS-004 | assumption_validated | Hook registration order confirmed: `traceHook` → `auditStartHook` → `gatewaySecretHook` (all onRequest), `auditHook` (onResponse). `traceHook` fires first — `requestContext.enterWith()` placed in `traceHook` correctly covers the full request lifecycle including gatewaySecretHook and auditHook. | — |
| INS-005 | environment | `npx tsc --noEmit` exits 0 — zero type errors after adding `src/lib/request-context.ts`, modifying `trace.ts`, and modifying `index.ts`. `@types/node` (already installed) provides `AsyncLocalStorage` types. | — |
| INS-006 | environment | `npm run build` exits 0 — dist/ compiled without errors. | — |
