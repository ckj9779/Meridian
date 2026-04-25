# CLAUDE.md — MERIDIAN PROJECT

**Project:** Meridian — personal knowledge graph and agentic operations system
**Repos:** `ckj9779/Meridian` (primary), `ckj9779/meridian-gateway` (Zuplo configuration), `ckj9779/meridian-mcp` (planned per D72, not yet scaffolded)
**Owner:** Charles K. Johnson (`mobile@charleskjohnson.com`)
**License:** BSL 1.1, Apache 2.0 after 4-year change date (D25)
**Domain:** `mydatasphere.dev` (Cloudflare registrar, DNS-only)
**Current phase:** Phase 0 complete, Sprint 08.5 CLOSED, Sprint 09 Phase 1 unblocked (as of 2026-04-18 / Session 18)
**Active model:** Claude Sonnet 4.6

---

## ⚠ Fabrication is a project-critical violation

This project operates under zero-tolerance for fabrication. Fabrication is defined as:

- Asserting a specific UI navigation path, API endpoint shape, CLI flag, vendor procedure, or configuration detail without a verified source in the current session context.
- Presenting a plausible guess as a confirmed fact when the check was one step away.
- Reporting that a task succeeded, a command ran, or a file was modified without evidence from actual tool output in the current session.
- Reconstructing prior actions from inference rather than from session-visible evidence.

**Fabrication is not mitigated by apologizing after the fact.** The failure occurs at generation time, not at detection time. The obligation is pre-generation verification, not post-generation correction.

This clause applies equally to planning sessions (claude.ai) and execution sessions (Claude Code). It is not suspended by time pressure, task complexity, or conversational momentum.

---

## Source Attribution Requirement

**Every factual claim about vendor behavior, API contracts, framework behavior, or external system capabilities must be attributable to an authoritative source.**

Authoritative sources, in priority order:
1. **Project documentation in this session context** — CLAUDE.md, docs/, migrations/, source files read via tool in the current session.
2. **Tool output observed in the current session** — actual command output, API responses, file contents returned by tool call.
3. **Web search result retrieved in the current session** — explicit search performed and result cited.
4. **Prior session deep context loaded at session open** — cited by session number and document name.

**If none of the above applies, the correct response is a declared gap:**

> "I do not have a verified source for [specific claim] in this session. I can search for it, or you can verify directly. I will not assert it as fact."

**Search-before-assert rule:** When a claim about a vendor's current UI, API behavior, CLI flag, or configuration option is needed to proceed, perform a web search before asserting. Do not assert the claim and offer to search afterward — search first, then assert with citation. If search produces no usable result, declare the gap rather than proceeding on inference.

**The source attribution requirement extends to commit operations.** When Claude Code reports a commit was made, the report must include the exact commit hash returned by the git command. "Committed successfully" without a hash is insufficient. If the command did not return a hash, report that explicitly.

---

## Canon Inheritance

This project inherits canon from the master CLAUDE.md. **Canon is not duplicated here; it is referenced.** The master file is the source of truth for each canon principle. This file specifies how the principles are implemented in Meridian.

Seven canon principles apply, with Meridian-specific implementation notes:

| Canon | Master principle | Meridian implementation |
|-------|------------------|--------------------------|
| D03 | Deep Context Methodology | Session deep contexts in Claude.ai project; graph ingest path designed in Sprint 10b+ (MER-49) |
| D43 | Universal Attribution | `identities` FK registry per D59; full attribution record (actor, endpoint, environment, host, IP, ns-timestamp); `system:anonymous` reserved identity for pre-auth rejections |
| D48 | Autonomy-Observability Cascade | Sibling `observability_readiness` table per D60; two-table promotion evaluation; approval endpoints require session JWT per D63 |
| D53 | Data Sovereignty at Rest | **Scope clarified per D61:** sovereign sources (emails, documents) stay local; operational/derived data (graph, audit, staging) on Railway — reconstructable from sources. No topology inversion required. |
| D54 | Observability as Knowledge Infrastructure | `audit_events` + session JSONB columns feed both security and knowledge graph; AGE ingest path designed in Sprint 10b+ (MER-49) |
| D55 | Deep Context as Standard Capture Protocol | Structured metadata header on all deep contexts from Session 09 forward; skill file updated in Sprint 08.5 Track 1 per D58 (MER-29) |
| **D66** | **Universal API Authentication** | **No data-returning endpoint accessible without auth. `/health` narrow public; `/v1/system` Clerk-authenticated (D64). Webhook HMAC validation at Zuplo per D67. Drift-prevention clause: authentication mapping required pre-deployment for every new endpoint.** |

**Meridian-specific hard constraints (in addition to cross-project canon consequences):**

1. **All writes to the live graph pass through a harness** enforcing D24 (extraction is proposal, not fact). Staging tables → human review → live promotion.
2. **All commits signed with GPG key** `5B68E52AEEA21C15A7A5C868799AD4A789D27DA8` on StarshipOne (D25, D27). Branch protection enforcement on `main` enabled per D65 after Sprint 09 Phase 2.
3. **All pushes to GitHub via SSH from WSL** (D29). HTTPS-from-Git-Bash is deprecated.
4. **All API requests pass through Zuplo** (D06, scope-updated by D72). Direct Railway URL access is a security violation (MER-26/MER-27 hotfix in Sprint 09 Phase 1).
5. **All API endpoints authenticate before handling data** (D66). Exception list: `/health` only (per D64).
6. **All outbound notifications via Resend** (D41). Domain `mydatasphere.dev` with SPF/DKIM/DMARC on Cloudflare.
7. **All per-machine keys are distinct** (D42). StarshipOne and Mac Mini each have their own SSH, GPG, and Clerk M2M identities.
8. **Two Clerk JWT templates** (D62): `meridian-human-pat` (30-day PAT per D40) and `meridian-machine-m2m` (2-hour M2M per D44). Independent signing keys.
9. **Approval endpoints require session JWT, reject PAT** (D63). Approval cannot be automated from stored credentials.
10. **No secrets committed to repo.** `/secrets/` directory gitignored with three-layer enforcement (D73). Pointer registry in `/secrets/SECRETS.md`; public policy in `docs/SECRETS_POLICY.md`.
11. **Webhook receivers validate HMAC signature at Zuplo** (D67, with Cloudflare Workers fallback). Validated requests attribute to `machine:<provider>-webhook`.
12. **Edge/mobile surface architecturally reserved but not built** (D68). Reactivation triggers defined. Control plane remains single entry point until triggered.

---

## Part 1 — Full Decision Register

All 75 locked decisions (D01–D75) with full rationale. Canon decisions are marked and cross-referenced to the master file. Decisions from Sessions 01–09 carry their original rationale. Decisions from Sessions 10–11 (D56–D74) reflect the decision-lockdown synthesis. D75 from Session 13.

### Session 01 — Genesis (2026-04-12)

**D01 — CAG as primary architecture candidate**
Corpus size (~300K emails compiling to ~200 articles) fits within context window. CAG produces more consistent, coherent query results than RAG by eliminating the lossy retrieval step. pgvector and Voyage AI embeddings are no longer required.

**D02 — GraphRAG as hybrid candidate**
Email corpus is inherently relational (people → companies → topics → decisions). GraphRAG captures relationship signal that vector search misses. Recommended approach: GraphRAG POC on 6 months of email before scaling. If entity extraction quality insufficient, fall back to CAG compiled wiki.

**D03 — Deep Context Methodology formalized as reusable skill** *(CANON — see master CLAUDE.md)*
Session 33 from Perkin project served as the reference spec. Skill created, packaged, and delivered. Applicable across claude.ai, Claude Code, and Cowork. **Status: canon since Session 01; extended by D55; skill update per D58 pending Sprint 08.5.**

### Session 02 — Architecture Validation (2026-04-13)

**D04 — "One store, many lenses" replaces "many stores, one router"**
Multi-backend + router model has seven identified weaknesses: router is the hardest/most failure-prone component, most queries span backends, operational surface area grows with each backend, data consistency drifts between stores, ingestion quality is the upstream dependency that matters more than retrieval pattern, CAG staleness is unsolvable with separate stores, and upfront classification is brittle vs iterative agent reasoning. Unified architecture solves all seven.

**D05 — PostgreSQL+AGE is the sole database**
AGE provides Cypher graph queries as a Postgres extension. Combined with tsvector (FTS) and jsonb (document), Postgres becomes the multi-model canonical store. Eliminates need for separate graph database. ArcadeDB evaluated and rejected. Corpus scale (tens of thousands of nodes) doesn't require purpose-built graph engine performance.

**D06 — Zuplo as unified API/MCP layer in front of Railway**
MCP Server Handler exposes retrieval lenses as agent-discoverable tools. AI gateway features (semantic caching, token-based rate limiting, model routing) solve cost control. Observability comes free. Edge deployment with GitOps. **Scope clarified by D72 (2026-04-16):** Zuplo's responsibility narrows to unified HTTP gateway (auth, rate-limit, trace, policy pipeline). MCP hosting is NOT Zuplo's responsibility. The HTTP-gateway justification stands; MCP is now architecturally separate.

**D07 — Railway for infrastructure, Vercel only for future frontend**
Vercel can't run custom Docker containers or host persistent databases. Railway is the right platform for Postgres+AGE and API services. Vercel's role is limited to frontend/dashboard when that phase arrives.

**D08 — Project codename: Meridian**
Reference line / single source of truth metaphor. Optics metaphor (lens focus). Clean repo name, clean namespace, no ecosystem collisions.

**D09 — Kuzu eliminated from consideration**
Acquired by Apple October 2025, GitHub archived. Community forks lack corporate backing and carry abandonment risk.

### Session 03 — Schema and Extraction (2026-04-14)

**D10 — Schema and extraction prompt are model-agnostic**
JSON contract defines output shape. Any model producing conforming JSON works. No architectural coupling to a specific LLM provider.

**D11 — Multi-model routing handled at Zuplo gateway layer** *(SUPERSEDED by D22)*
Model selection as a gateway policy, not application logic. **Status: superseded by D22 — model selection is user-facing; Zuplo executes routing but doesn't decide it.**

**D12 — Validate extraction quality against Haiku first**
Haiku is the cost floor. If it handles extraction reliably, everything above it can too. Failures identify routing rules.

**D13 — No pre-filter — every email gets extracted**
Automated notifications carry employment, financial, and temporal signal. "Noise" is a data engineering bias that conflicts with total context capture.

**D14 — Source classification as metadata, not a filter**
Emails tagged with source_type at extraction time. Classification is queryable metadata for lens filtering, not a gate.

**D15 — POC scope: 2024-2025 email subset**
143,996 files (~72K emails), 26 folders, 8.74 GB. Large enough to validate entity resolution, small enough to iterate. ~$55-80 at Haiku rates.

### Session 04 — Extraction Validation and Interface (2026-04-14)

**D16 — Organization.org_type expanded: add "school" and "school_district"**
Educational institutions needed as first-class entity types for Chaz's family context.

**D17 — Extraction prompt: abbreviations stay verbatim**
Cross-email entity resolution handles abbreviation-to-full-name mapping. Guessing expansions introduces error.

**D18 — Extraction prompt: name parsing heuristic for email-only contacts**
When `firstname.lastname@domain.com` format with no display name, parse as "Firstname Lastname" title-cased. Flag `needs_review: true`.

**D19 — Calendar invites forwarded by user = personal source_type**
Forwarded calendar invite is interpersonal content even if delivery is automated. "notification" reserved for system-generated alerts with no human-authored content.

**D20 — Triage interface is conversational, not clinical**
Natural language conversation where Claude presents findings and asks questions; Chaz provides corrections that cascade across the graph.

**D21 — Three-function interface architecture**
Function 1 (Conversational Triage), Function 2 (Insight Explorer), Function 3 (Execution Layer). Functions inform each other. Recommendations engine spans all three.

**D22 — Model selection is user-facing preference, not Zuplo gateway policy (supersedes D11)**
Model selection in Meridian interface settings, changeable anytime, like Claude.ai's own model picker. Zuplo executes the routing but doesn't decide it.

**D23 — Batch-first entity triage**
Process 500 emails, stage results, present entities grouped by type. Entity-centric triage, not email-centric.

**D24 — Extraction is proposal, not fact — human-in-the-loop is architectural**
Extractions land in a staging table, not the live graph, until human review. Fundamental architectural requirement. Any system skipping this step is building on unreviewed assumptions.

### Session 05 — Intelligence and SAD (2026-04-15)

**D25 — BSL 1.1 license; owner retains full IP; GPG-signed commits, COPYRIGHT file, per-file headers**
Public repository requires explicit IP protection. BSL 1.1 permits viewing and non-production use while reserving commercial rights. Converts to Apache 2.0 after 4-year change date. GPG signing cryptographically ties each commit to the owner. **Branch protection enforcement enabled per D65 after Sprint 09 Phase 2.**

### Session 06 — Insight Protocol and Git Setup (2026-04-15)

**D26 — Header format: Hybrid — GITOPS.md 1-line text, prompt's wider extension list**
GITOPS.md's condensed single-line header is canonical. Hybrid takes broader coverage from the prompt.

**D27 — Git identity: `Charles K. Johnson` / `mobile@charleskjohnson.com` on all commits**
Aligns IP chain: COPYRIGHT → LICENSE → commit authorship → GPG signature all trace to same identity.

**D28 — `.gitattributes` with `* text=auto eol=lf`; `.claude/settings.local.json` remains tracked** *(SUPERSEDED IN PART by D71)*
`.gitattributes` line-endings assertion stands. **Status: `.claude/settings.local.json` tracking assertion reversed by D71 — file is gitignored per Sprint 08.5 Track 1. Observed three-session empirical churn confirmed machine-local state, not project-shared config.**

**D29 — SSH from WSL as canonical push method**
Signing key lives in WSL. SSH push from WSL keeps sign → commit → push chain in one environment. Eliminates WSL/Git Bash interop requirement. Future-proofs for automated agent commits. **Re-asserted in Session 09 given Mac Mini availability and pending move.**

### Session 07 — Phase 0 Infrastructure (2026-04-15)

**D30 — npm as package manager**
Ships with Node.js v22. No additional install. Solo project doesn't need yarn/pnpm monorepo features.

**D31 — Fastify as Node.js API framework**
TypeScript-first. Built-in JSON Schema validation. Plugin system maps to modular lens architecture.

**D32 — SSE for server-to-client streaming, not WebSockets**
All streaming use cases are server-to-client. SSE flows through Zuplo preserving auth/rate limiting/observability.

**D33 — system_context as versioned document, seed reshaped**
Versioned document with `version`, `content`, `change_summary`, `active`. Single active row with all K/V pairs in `content` JSON.

**D34 — Split tech inventory from tech event log**
New `stack_components` table for static inventory. `tech_watch` remains event log for Phase 1 monitoring agent.

### Session 08 — Phase 0 Completion (2026-04-15)

**D35 — Dual execution runtime (Managed Agents primary, Routines as progression) with user-controlled promotion pathway**
Managed Agents for complex/interactive work. Routines for bounded/scheduled. All missions start as Managed Agents. After 30 days meeting promotion criteria, missions surface for user-controlled promotion. Harness (Layer 4) applies identically to both runtimes. **Extended by D48: promotion gated on observability readiness per D60 sibling table — behavioral criteria alone are insufficient.**

**D36 — Cloudflare as DNS registrar and authoritative DNS**
At-cost pricing, DNSSEC, single DNS control plane. Robust API for future programmatic DNS management. DNS-only mode (no proxy) for Zuplo and Vercel records. Data sovereignty alignment.

**D37 — Separate `meridian-gateway` repo for Zuplo configuration**
Zuplo expects repo-root ownership. Different deployment targets. Prevents cross-deployment trigger noise. Same BSL 1.1 license, same conventions. **Precedent followed by D72 for `meridian-mcp` — now three repos, one project.**

**D38 — `mydatasphere.dev` as project domain**
`.dev` TLD enforces HTTPS. Descriptive of the project's scope. Clean subdomain pattern: `api.mydatasphere.dev` for Zuplo gateway, `app.mydatasphere.dev` for future Vercel frontend, `edge.` or `mobile.` reserved per D68.

### Session 09 — Security, Observability, Canon Governance (2026-04-16)

**D39 — Dedicated Meridian Clerk application in Personal workspace**
Application isolation. Perkin Discovery Tool (existing app) transferable independently without affecting Meridian.

**D40 — 30-day personal PAT via Clerk JWT Template `meridian-human-pat`, monthly rotation, Meridian-managed reminder**
Clerk JWT Templates don't support per-token revocation — token lifetime IS the worst-case exposure window. 30-day lifetime balances security with usability. Meridian tracks mint date and expiry, sends reminder on day 25 with escalation as expiry approaches. **Template validation vs Zuplo Clerk JWT Auth policy pending Sprint 08.5 Track 2 (MER-35). Template name per D62.**

**D41 — Resend for outbound system notifications**
Already in Chaz's stack. Sender domain under mydatasphere.dev with SPF/DKIM/DMARC on Cloudflare.

**D42 — Per-machine signing identities (SSH + GPG), never shared**
Each machine maintains its own SSH key and GPG key. Independent revocation if machine lost or decommissioned. Extends to non-human actors: each gets own signing identity. Initial roster: StarshipOne (`5B68E52AEEA21C15A7A5C868799AD4A789D27DA8`), Mac Mini (pending provisioning per MER-31).

**D43 — Universal Attribution Principle** *(CANON — see master CLAUDE.md)*
Every action carries identity. Identities never shared. **Meridian implementation per D59: FK to `identities` registry table with full attribution record (actor, endpoint, environment, host, IP, ns-timestamp); `system:anonymous` reserved identity for pre-auth rejections.**

**D44 — M2M per-machine Clerk identity `meridian-machine-m2m`, 2hr JWT, approve-to-mint at maturity**
Two-layer: Machine Secret Key (long-lived, 180-day rotation) and M2M Token (2hr session JWT). Mint-per-session. Maturity phase: notification → approve → mint flow. No silent renewals. Standing approval policies for Routines. **M2M availability on Clerk Pro and Zuplo validation path pending Sprint 08.5 Track 2 (MER-30, MER-36). Template name per D62.**

**D45 — claude.ai is planning-only; read access post-audit-layer; no stored credentials**
Bootstrap: no API access. Post-audit: read-only via PAT provided per-conversation. Maturity: approve-to-mint read-only session token via D44 flow. Writes permanently excluded from this surface.

**D46 — Repos stay public (BSL 1.1); security/observability gate before new data exposure**
Security posture relies on authentication (D25, D66), not obscurity. Critical sequencing gate: auth + observability must be verified operational before any new data exposed via API.

**D47 — `meridian-api` as active Clerk machine identity for outbound calls**
Meridian's own outbound calls (Anthropic API, Resend, source fetches) attributed to this identity. Single identity for Railway service; segment per-function only if trust boundaries diverge later.

**D48 — Autonomy-Observability Cascade** *(CANON — see master CLAUDE.md)*
Five-tier cascade, promotion-gated on observability readiness. **Meridian implementation per D60: sibling `observability_readiness` table for two-table promotion evaluation. Approval endpoints require session JWT per D63.**

**D49 — Local cold storage primary, encrypted cloud DR only**
Primary cold storage is local external drive under physical control. Meridian tracks storage topology. Cloud (R2) is encrypted DR only — encrypted with owner's key. Underlies D53 scope per D61.

**D50 — Pino + ULID trace IDs; OpenTelemetry deferred to agent fan-out**
Linear trace served by ULID correlation. OTel adopted when agent fan-out creates multi-service traces.

**D51 — Inbox-posture bootstrap alerts via Resend; 5 alert types**
Auth failure spike, unknown caller, write outside session, PAT expiry, Machine Secret Key expiry. Email, not pager.

**D52 — `audit_events` and `agent_events` separate, trace_id-linked**
Different cardinality, retention, primary concerns. Trace_id links them. Independent audit streams, reconcilable but not collapsed.

**D53 — Data Sovereignty at Rest** *(CANON — see master CLAUDE.md)*
Sovereign source data local; operational/derived may be cloud. **Meridian scope clarified by D61: Railway holds operational/derived; local disk holds sovereign source material (emails, documents). No topology inversion required.**

**D54 — Observability as Knowledge Infrastructure** *(CANON — see master CLAUDE.md)*
Dual consumer (security + knowledge graph). **Meridian implementation: ingest path from `audit_events` and `agent_sessions` JSONB columns into AGE graph designed in Sprint 10b+ (MER-49).**

**D55 — Deep Context as Standard Capture Protocol** *(CANON — see master CLAUDE.md)*
Three-tier capture model; structured metadata header mandatory. **Meridian implementation: skill file update per D58 in Sprint 08.5 Track 1 (MER-29). Deep contexts from Session 09 forward are D55-compliant.**

### Session 11 — Decision Lockdown (2026-04-16)

(Session 10 was diagnostic recon — no decisions locked. Findings routed to Session 11.)

**D56 — Sprint 08.5 inserted (two-track structure)**
Track 1 (Claude Code reconciliation — migration 004 fixes, secrets infrastructure, doc updates) + Track 2 (vendor confirmations — Clerk, Zuplo, Railway, Cloudflare). Sprint 09 Phase 1 hotfix does not ship until both tracks close. Contract-before-implementation pattern from Sessions 06, 07, 08 extended to Tier 2.

**D57 — Sprint 10 split into 10a and 10b**
10a: Orchestration + Audit Foundation (migration 004 apply post-fix, migration 005, Fastify audit middleware, Zuplo trace injection). 10b: Notifications + Cold Storage + Alerts + Query (Resend setup, cold storage pipeline, bootstrap alerts, audit query endpoint, docs). One-week burn-in between. Audit layer proves itself operational before downstream work depends on it.

**D58 — MER-29 (deep-context skill update per D55) moves to Sprint 08.5 Track 1**
Forward-compliance with D55 on every future session close. Skill file is canonical protocol implementation; hours-scale work, should happen before next unsupervised session.

**D59 — Attribution via `identities` FK registry, full attribution record**
Every action-recording table carries `actor_identity_id INTEGER NOT NULL REFERENCES identities(id)`. FK named `fk_<table>_actor_identity`. No `ON DELETE CASCADE` — retirement not deletion. Full record per action: `actor_identity_id`, `endpoint TEXT`, `environment TEXT`, `host TEXT`, `ip_address INET`, `occurred_at TIMESTAMPTZ` (ns precision — implementation detail in Sprint 08.5 design: paired `event_time_ns BIGINT` if PG native microsecond insufficient). `identities` registry schema: `id SERIAL PK`, `identity_string TEXT UNIQUE NOT NULL`, `class TEXT CHECK IN ('human','machine','agent','system')`, `description`, `active BOOLEAN`, `registered_at`, `retired_at`, `retired_reason`. Initial seed: `system:anonymous`, `machine:starshipone-claude-code`, `machine:meridian-api`, `human:chaz-clerk-pat`. `system:anonymous` handles pre-auth rejections.

**D60 — Sibling `observability_readiness` table for D48 promotion evaluation**
Two-table promotion check: `promotion_thresholds` (behavioral) AND `observability_readiness` (observational). Sibling table allows tier-specific readiness profiles (Tier 2, 3, 4 have structurally different requirements). Migration 004 reconciliation adds table structure with permissive defaults; Sprint 10a populates real readiness rows when audit layer is operational.

**D61 — Railway operational/derived; local disk sovereign source; no inversion**
Meridian's sovereign data at rest is source material (emails, documents) on local disk. Railway holds derived and operational data (graph projections, staging, audit, agent state) — all reconstructable from sources. D53 canon satisfied by existing design; Session 10 recon framing of "topology inversion needed" was an over-reach. **MER-48 resolved.** Master D53 canon text scope-clarified (not superseded) to reflect the sovereign-vs-operational distinction.

**D62 — Two Clerk JWT templates: `meridian-human-pat` and `meridian-machine-m2m`**
30-day lifetime on human-pat (D40); 2-hour lifetime on machine-m2m (D44). Independent signing keys. Rationale: shared template means emergency rotation of one credential class kills the other — self-inflicted agent outage on every human credential scare. **Clerk two-template-in-one-application pattern confirmation pending Sprint 08.5 Track 2.**

**D63 — Approval endpoints require session JWT; reject PAT**
Approval routes (`POST /v1/proposals/:id/approve`, `POST /v1/proposals/:id/reject`, future live-promotion endpoints) validate session JWT only. Fastify middleware inspects JWT claims (`typ`/`azp` or equivalent discriminator — exact field confirmed Sprint 08.5 Track 2) to distinguish session-origin from template-origin tokens. D48 Tier 2 "human-approved" derives meaning from presence at approval time; stored PAT cannot prove presence.

**D64 — `/health` public narrow; `/v1/system` Clerk-authenticated**
`/health` returns `{ "status": "ok" }` HTTP 200 when DB reachable, `{ "status": "degraded" }` HTTP 503 otherwise. Public, exempt from shared-secret middleware for Railway deploy probe. Narrow body prevents fingerprinting. `/v1/system` behind Zuplo Clerk JWT Auth policy (PAT or M2M accepted); rich body (version, phase, DB state, migration count, uptime, environment). No special bypass, no IP allowlist, no magic token. **Triggered D66 canon elevation.**

**D65 — Branch protection after Sprint 09 Phase 2 (SSH verified)**
Enable on both `ckj9779/Meridian` and `ckj9779/meridian-gateway` after Phase 2 SSH work closes, before Phase 3 Clerk setup. Rules: require signed commits, require linear history, disable force pushes, disable deletions, disable administrator bypass. D25 already voluntarily honored; platform enforcement tightens a known-working SSH+GPG path. Administrator bypass disabled — canon applies to operator. MER-31 (Mac Mini provisioning) urgency elevated as emergency-recovery signing identity.

**D66 — Universal API Authentication** *(CANON — see master CLAUDE.md)*
No data-returning API endpoint accessible without authentication. Shared-secret is transport integrity, not authentication. Exception list exclusive (liveness probe, readiness probe, OAuth/OIDC callback, static marketing asset). Drift-prevention clause: any new endpoint/asset maps to D66 before deployment. Webhook framing: HMAC signature validation, attribution to `machine:<provider>-webhook`. **Meridian exception: `/health` only per D64.**

**D67 — Webhook HMAC validation at Zuplo (Cloudflare Workers fallback)**
Zuplo validates inbound webhook HMAC signatures as a policy on webhook routes, attributes to `machine:<provider>-webhook` per D43 identities registry. Fallback: if Sprint 08.5 Track 2 Zuplo confirmation reveals limitations (body consumption, policy pipeline, etc.), Cloudflare Workers edge validator on dedicated subdomain. Single gateway for control plane keeps D66 enforcement consolidated.

**D68 — Dual-surface architecture adopted; edge/mobile deferred**
Control plane (`api.mydatasphere.dev` → Zuplo → Railway, Clerk auth, for Claude Code / claude.ai / Vercel / webhooks). Edge/mobile surface deferred (`edge.` or `mobile.`.mydatasphere.dev → Cloudflare Workers → Railway, scoped short-lived tokens issued by control plane, for future mobile clients). **Credential boundary:** edge surface does NOT mint own long-lived credentials; tokens issued by control plane. **Observability split:** Zuplo control-plane logs feed `audit_events`; CF Workers edge logs feed local sovereign cold storage via Logpush, both eventually feed knowledge graph per D54. **Reactivation triggers:** (1) concrete mobile use case defined, (2) Zuplo limitations force traffic off main gateway, (3) cost/latency inadequate for some class of control-plane traffic.

**D69 — Seed default `ON CONFLICT DO UPDATE` for mutable columns**
Flip from `ON CONFLICT DO NOTHING` default. Immutable columns (primary key, origin-session) preserved. Mutable columns (summary, rationale, status, related_issues, canon flag) update. `--reseed` stays as dev-only truncate path. New `--dry-run` flag prints changes without writing. Back-filling D33–D74 silently no-ops under current default.

**D70 — `canon BOOLEAN NOT NULL DEFAULT FALSE` column on `decisions` table + `docs/CANON.md` mirror**
Queryable canon flag per master CLAUDE.md Part 2.5. Boolean matches binary semantic. `docs/CANON.md` is human-readable mirror of canon subset (committed, reviewable). Seed back-fill: D03, D43, D48, D53, D54, D55, D66 → `canon = TRUE` (7 as of Session 11 close). Flag mutable in principle but flips require explicit session decision — cannot silently demote canon.

**D71 — `.claude/settings.local.json` untracked (supersedes D28 in part)**
`git rm --cached .claude/settings.local.json` in Sprint 08.5 Track 1. Add to `.gitignore`. Three sessions of observed churn (INS-006 git-setup, Session 07 synthesis, Session 10 recon INS-040) confirm machine-local state, not project-shared config. D28's `.gitattributes` line-endings assertion stands; D28's tracking assertion reverses. Future per-machine Claude Code state files default to gitignore unless explicitly justified otherwise.

**D72 — MCP architecture: own codebase (`meridian-mcp`), transport-abstracted, staggered deployment**
Drop Zuplo MCP Server Handler dependency. Build `meridian-mcp` as standalone codebase using official MCP TypeScript SDK. Transport-abstracted tool definitions. Two entry points: `src/stdio.ts` (Variant A — local subprocess on dev machines) and `src/http.ts` (Variant B — remote HTTP service). Sprint 14 deploys Variant A (StarshipOne, Mac Mini). Variant B activates when concrete remote-client use case justifies public surface (first managed agent mission, mobile client, external integration). **MER-22 closes as won't-do** (architecturally redirected, not deferred). **D06 scope updated** (not superseded): Zuplo responsibility narrows to unified HTTP gateway; MCP hosting explicitly not Zuplo. Three-repo structure: `Meridian`, `meridian-gateway`, `meridian-mcp` (following D37 precedent).

**D73 — `/secrets/` gitignored directory + three-layer enforcement**
`/secrets/` directory at repo root, gitignored (not individual files — directory-level catches future secret-adjacent artifacts). Three enforcement layers: (1) `.gitignore` with annotated entry referencing D73 and policy doc, (2) pre-commit hook `check-secrets.sh` rejects any staged file under `secrets/` path, (3) GitHub custom secret-scanning pattern `meridian-secrets-directory` with Critical severity and push protection. Split documentation: `/secrets/SECRETS.md` (gitignored, owner-only, pointer registry with 8 columns — name, purpose, stored_in, rotator, cadence_days, last_rotated, blast_radius_if_leaked, revocation_path) + `docs/SECRETS_POLICY.md` (committed, public-facing, policy and enforcement model). Pointers only, never values. Every secret row exists in registry before secret is created.

**D74 — Emergency rotation procedures per credential class**
Break-glass procedures documented in `/secrets/SECRETS.md` per D73. Specific procedures for Clerk human PAT compromise (rotate `meridian-human-pat` template signing key — kills human PATs only, D62 separation preserves M2M), Clerk machine secret key compromise (retire identity in `identities` registry per D59, mint new versioned machine name, never reuse), webhook HMAC secret compromise (coordinated rotation at sender and receiver), `GATEWAY_SECRET` compromise (Zuplo + Railway env update, seconds-scale outage), Railway `DATABASE_URL` compromise (Railway dashboard rotation). Every emergency rotation logged to `credential_rotations` table (post-migration-005 in Sprint 10a) with `reason='emergency:compromise_suspected'`. Compromised identities retired not reused. Brief outages acceptable; continuing with compromised credentials is not.

### Session 12 — Track 1 Prompt Drafting (2026-04-17)

(No decisions locked. Sprint 08.5 Track 1 Claude Code prompt produced as artifact.)

### Session 13 — Reconciliation and Vendor Confirmation (2026-04-17)

**D75 — Commit identity follows signing authority**
In git-based projects, the committer identity must match the signing authority. If a commit is GPG-signed with the owner's key, the committer identity is the owner — the GPG warmup pattern is an authorization act, not an endorsement of machine authorship. If a commit is unsigned or signed with a machine-specific key, the committer identity must be machine-specific (`claude-<hostname>` or project-specific identity like `meridian`). All Claude Code commits include session ID and prompt reference in the commit message body (e.g., `Session: 13, Prompt: MERIDIAN_SPRINT_09_PHASE1`). This creates traceability between git history and the audit layer. **Extends D43 (attribution at time of action) to the git commit identity surface. Verification corollary: when reporting a commit, always include the exact hash returned by the git command. Reporting success without a hash is insufficient.**

---

## Part 2 — Environment

### Machines

| Machine | OS | Role | Git/Sign identity | Claude Code M2M |
|---------|----|----|-------------------|-----------------|
| StarshipOne | Windows 11 + WSL Ubuntu | Primary development | SSH: `starshipone-wsl`; GPG: `5B68E52AEEA21C15A7A5C868799AD4A789D27DA8` | `claude-code-starshipone` (pending D44 setup Sprint 09 Phase 3) |
| Mac Mini | macOS | Secondary development | Pending provisioning (MER-31, urgency elevated by D65) | `claude-code-macmini` (pending) |

Canonical repo path on StarshipOne: `/mnt/d/Meridian/` (WSL) = `D:\Meridian\` (Windows).

**Execution environment:** Claude Code runs in Git Bash on Windows (`/d/Meridian/`), not WSL (`/mnt/d/Meridian/`). Git operations (commit, push) happen in Git Bash. GPG signing uses a WSL bridge: `.meridian/gpg-wsl-bridge.sh` calls `wsl.exe gpg` from Git Bash, with `allow-loopback-pinentry` configured in WSL gpg-agent. SSH push uses WSL per D29 — this is the only operation that requires switching to the WSL terminal.

**Deep-context skill file path (INS-008):** `C:\Users\Charles\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin\...\skills\deep-context\SKILL.md`

### Runtime versions

| Component | Version |
|-----------|---------|
| Node.js (local) | v22.17.0 |
| Node.js (Railway) | v22.22.2 |
| npm | 11.5.2 |
| PostgreSQL (Railway) | 18.3 |
| Fastify | 5.8.5 |
| TypeScript | 6.0.2 |
| Zuplo | v6.68.9 (runtime) |

### Infrastructure inventory

| Component | Status | URL / identifier | Notes |
|-----------|--------|------------------|-------|
| GitHub — Meridian | Public, main @ `3283f9e` | `github.com/ckj9779/Meridian` | Sprint 10 Phases 1–5 complete. Branch protection pending D65 (after Sprint 09 Phase 2). |
| GitHub — Gateway | Public | `github.com/ckj9779/meridian-gateway` | 2 commits; 10 proxy routes. Branch protection pending D65. |
| GitHub — MCP | Not yet created | `github.com/ckj9779/meridian-mcp` | Scaffold in Sprint 14 per D72 (MER-60). |
| Railway — PostgreSQL | Online | PG 18.3 | Migrations 001–003 applied; 004 uncommitted and **broken on disk** (MER-33/34). |
| Railway — Meridian API | Online | `meridian-production-1a97.up.railway.app` | Fastify; authenticated, audit middleware live. Sprint 10 Phases 1–5 complete. |
| Zuplo gateway | Online | `api.mydatasphere.dev` → `cname.zuplo.app` | Rebuilt Session 13; 2 routes (`/v1/health` unauthenticated, `/v1/system/context` with Clerk JWT auth). Remaining 8 data routes pending Sprint 09 Phase 1. |
| Cloudflare DNS | Active | `mydatasphere.dev` | DNS-only for api subdomain. `edge.` or `mobile.` reserved per D68, not yet provisioned. |
| Clerk | Pro, Personal workspace | Meridian app created Session 13; `clerk-jwt-auth-inbound` policy deployed on Zuplo | M2M availability + two-template support pending Sprint 08.5 Track 2 (MER-30, MER-39). |
| Resend | Available | Sending domain pending verification (MER-28) | Stack component, not yet configured. |

### Environment variables (Railway Meridian service)

| Variable | Purpose | Status |
|----------|---------|--------|
| `DATABASE_URL` | Railway PostgreSQL connection | Set |
| `NODE_ENV` | Node environment | Set |
| `PORT` | Fastify listen port | Set |
| `BACKEND_SECRET` | Shared secret from Zuplo (Layer A) | Set |
| `CLERK_SECRET_KEY` | Server-side Clerk operations | **Pending Sprint 09 Phase 3** |
| `CLERK_FRONTEND_API_URL` | Clerk JWT validation | **Pending Sprint 09 Phase 3** |
| `RESEND_API_KEY` | Resend sending API key (`notifications.mydatasphere.dev`) | Set |
| `COLD_STORAGE_PATH` | Cold storage output directory override (optional) | Optional |

`.env.example` does not yet exist in repo — pending Sprint 08.5 Track 1 (MER-40).

### On-disk files (uncommitted as of 2026-04-16 / Session 11 close)

- `migrations/004_orchestration_layer.sql` — **broken: missing BEGIN/COMMIT, missing schema_migrations INSERT, missing IF NOT EXISTS, missing D43 attribution columns per D59, missing `observability_readiness` table per D60. Fixed in Sprint 08.5 Track 1 (MER-33, MER-34, MER-47).**
- Session 08 insight ledger (6 insights) — routing actions pending (MER-25).

### Secrets infrastructure (pending Sprint 08.5 Track 1 per D73)

- `/secrets/` directory (gitignored) — scaffold on StarshipOne; Mac Mini at provisioning.
- `/secrets/SECRETS.md` — pointer registry, owner-only.
- `docs/SECRETS_POLICY.md` — committed, public-facing policy.
- `.meridian/hooks/check-secrets.sh` — pre-commit enforcement.
- GitHub custom secret-scanning pattern `meridian-secrets-directory` on both active repos.

---

## Part 3 — Task Routing

When a request arrives, route based on intent:

| Intent | Route to | Example |
|--------|----------|---------|
| Design a decision, evaluate trade-offs, lock a rationale | Project session (claude.ai) | "Should we use X or Y for Z?" |
| Produce a prompt for Claude Code | Project session | "Write a prompt to add middleware" |
| Execute code changes on disk | Claude Code | "Add the gateway-secret middleware to Fastify" |
| Produce a deep context | Project session + deep-context skill | "Let's capture this session" |
| Query project state (decisions, issues, sessions) | Meridian API (Tier 2+) or seed JSON (current) | "What's the status of MER-22?" |
| Run a one-off database query | Claude Code (via `psql` or script) | "Count rows in decisions table" |
| Propose schema changes | Project session (design) → Claude Code (migration) | "Add canon flag to decisions" |
| Research vendor documentation | Project session with web access | "Does Clerk M2M count against MAU?" |
| Commit and push | Claude Code (WSL, SSH, signed) | — |
| Emergency credential rotation | Project session (decision) + Claude Code (execution) + /secrets/SECRETS.md update | Per D74 procedures |

---

## Part 4 — Insight Protocol

Established in Session 06. Every substantive session produces an insight ledger. Ledgers are captured in `.meridian/insights/YYYY-MM-DD_S##-task-slug.md` (filename convention updated in Sprint 08.5 per MER-54).

### Insight taxonomy (8 types, each with a default routing target)

| Type | Routes to |
|------|-----------|
| `environment` | CLAUDE.md Environment table |
| `assumption_validated` | Decision register (strengthens confidence) |
| `assumption_invalidated` | Decision register + affected doc + new issue |
| `convention_gap` | Target doc (whichever should have addressed it) |
| `dependency` | CLAUDE.md Environment or relevant doc |
| `failure_and_fix` | Relevant doc (prevents re-discovery) |
| `recommendation` | Next session pending actions |
| `security` | docs/GITOPS.md or docs/ARCHITECTURE.md or docs/SECRETS_POLICY.md |

### Ledger format

```
INS-###  | <type>  | <severity: critical|high|medium|low|info>  | <one-line summary>  | <routing target>  | <affected decisions>  | <affected sprint phases>
```

### Capture discipline

- **Capture liberally.** Routing is a downstream decision. If you notice something, log it. Do not prune during capture.
- **End-of-session routing summary** proposes a disposition per insight (Apply / No action / Defer / Bundle). Routing summary is a proposal, not an automatic edit — extends D24 to documentation governance.
- **Routing actions are separate artifacts.** The ledger captures; the routing session applies changes and commits.

---

## Part 4A — Agent Behavioral Rules

These rules govern all Claude activity in this project — planning sessions (claude.ai) and execution sessions (Claude Code) equally. They are not suggestions. Written constraints in this file beat verbal overrides in conversation.

### Rule 1 — Informed

Read CLAUDE.md and all task-relevant docs before acting. Do not rely on training knowledge for project facts. Training knowledge about vendor UIs, API shapes, CLI flags, or configuration procedures is not a source — it is an approximation that may be stale. Project documentation in this session context is a source.

### Rule 2 — Instructed

Follow constraints and conventions in the written prompt. Written constraints beat verbal overrides. If a constraint in this file conflicts with a constraint in a prompt, surface the conflict before proceeding.

### Rule 3 — Routed

Use the task routing table in Part 3. Don't invent new routing.

### Rule 4 — Guarded

Escalate on uncertainty. Never skip the insight ledger. Specific escalation triggers:
- Task requires a decision not yet in the register.
- Written constraints conflict with each other.
- Task would violate canon (stop and log).
- Required information is genuinely absent.

### Rule 5 — HC-13: Surgical changes only

Every Claude Code execution is scoped to the exact change specification in the prompt. No additional changes, no preemptive refactors, no unasked-for improvements. If Sonnet 4.6's tendency toward thoroughness surfaces additional issues, log them as insights — do not fix them in the same execution. HC-13 compliance means the change surface matches the prompt surface exactly.

### Rule 6 — HC-15: Pre-generation verification gate (zero-tolerance fabrication)

Before asserting any specific vendor UI navigation path, API endpoint shape, CLI flag, configuration option, or external system behavior, the model MUST have one of the following in the current session context:

- A web search result explicitly retrieved this session confirming the claim.
- Actual tool output from this session (command output, file read, API response) confirming the claim.
- Project documentation in this file or docs/ confirming the claim.
- A prior session deep context explicitly loaded at session open, cited by session and document name.

**"It feels like it should work that way" is not a source.** If none of the above applies, the required response pattern is:

> "I do not have a verified source for [specific claim] in this session. I can search for it now, or you can verify directly. I will not assert it as fact."

Search-before-assert is mandatory for vendor-specific claims. Do not assert and offer to search afterward — search first, then assert with citation. If search returns no usable result, declare the gap.

**HC-15 applies on every individual claim.** A prior correction in the same session does not inoculate subsequent claims. Each claim is evaluated independently against the source requirement.

### Rule 7 — Correction persistence

If this session's context contains a prior HC-15 violation or a prior fabrication event, treat that as a signal that the failure mode is active in this session — not as a resolved event. Increase the verification threshold for subsequent vendor-specific or procedural claims. One correction does not reset the risk.

### Rule 8 — Over-eager initiative (Sonnet 4.6 specific)

Sonnet 4.6 has a documented tendency to take additional initiative in agentic coding tasks — acquiring resources, fixing adjacent issues, or taking steps the user did not request. At every checkpoint, confirm that work performed matches the exact change specification. Any action outside the specification must be reported to Chaz before proceeding, not executed and disclosed afterward.

### Checkpoint protocol

For long-running Claude Code sessions, checkpoint the insight ledger at natural breakpoints (every 30 minutes or after each sub-task). This prevents total loss if the session ends early.

**Checkpoint calibration (Sonnet 4.6).** At non-mandatory checkpoints, report status and continue unless unexpected state is encountered. Do not pause for confirmation at non-mandatory checkpoints — these are status reports, not gates. Mandatory checkpoints (defined in the prompt) remain mandatory. If Sonnet 4.6's thoroughness instinct surfaces a question at a non-mandatory checkpoint, log it as an insight and continue; surface it at session close.

---

## Part 5 — Active Issue Register

The authoritative register lives in the database (`issues` table) and is queryable via the Meridian API (Tier 2+). Currently the seed is stale (MER-23 — Sprint 08.5/Sprint 09 Phase 5 will backfill D33–D74, Sessions 07–11, issue statuses). This CLAUDE.md carries the current known state as of Session 11 close.

### Critical / blocking

| ID | Summary | Sprint |
|----|---------|--------|
| MER-26 | API live and unauthenticated — shared-secret hotfix | Sprint 09 Phase 1 (after Sprint 08.5 closes) |
| MER-27 | Railway direct URL bypasses Zuplo | Sprint 09 Phase 1 |
| MER-33 | Migration 004 BEGIN/COMMIT/schema_migrations INSERT fix | Sprint 08.5 Track 1 |
| MER-34 | Migration 004 IF NOT EXISTS + D43 attribution per D59 | Sprint 08.5 Track 1 |
| MER-35 | Clerk JWT-template PAT validation spike vs Zuplo | Sprint 08.5 Track 2 |
| MER-36 | Clerk M2M token validation spike vs Zuplo | Sprint 08.5 Track 2 |

### High severity

| ID | Summary | Sprint |
|----|---------|--------|
| MER-23 | Seed data stale (D33–D74, Sessions 07–11) | Sprint 09 Phase 5 + Sprint 08.5 reconciliation |
| MER-24 | D29 vs reality — SSH configuration on WSL | Sprint 09 Phase 2 |
| MER-29 | Deep context skill update per D55 | **Sprint 08.5 Track 1 per D58** |
| MER-37 | Fastify middleware ordering + rejection trace coverage | Sprint 09 Phase 1 design |
| MER-38 | `/secrets/` infrastructure per D73 (gitignored + enforcement + docs) | Sprint 08.5 Track 1 |
| MER-39 | Two Clerk JWT templates per D62 | Sprint 08.5 Track 2 + Sprint 09 Phase 3 |
| MER-42 | `@fastify/cors` with strict allowlist | Sprint 09 Phase 1 |
| MER-44 | Audit dead-letter path (audit-of-audit) | Sprint 10a |
| MER-45 | Zuplo rate-limit identity extractor verification | Sprint 08.5 Track 2 |
| MER-56 | Railway private networking — if available, Layer A obsolete | Sprint 08.5 Track 2 |

### Medium severity

| ID | Summary | Sprint |
|----|---------|--------|
| MER-08 | Extraction prompt v1.2 not applied to docs/EXTRACTION.md | Sprint 11 (TD-08) |
| MER-25 | INS-001–006 routing review (Session 08 ledger) | Sprint 09 Phase 5 |
| MER-28 | Resend domain verification for mydatasphere.dev | Sprint 10b Phase 5 |
| MER-31 | Mac Mini provisioning checklist (urgency elevated by D65) | Sprint 09 Phase 6 |
| MER-43 | `/health` body narrow + `/v1/system` endpoint per D64 | Sprint 09 Phase 1 |
| MER-46 | Seed `ON CONFLICT DO UPDATE` per D69 | Sprint 08.5 Track 1 |
| MER-47 | D48 observability-readiness criterion per D60 | Sprint 08.5 Track 1 (structure) + Sprint 10a (populate) |
| MER-49 | D54 agent_events → AGE graph ingest path | Sprint 10b+ |
| MER-51 | Canon back-fill (D33–D74 + canon flag per D70) | Sprint 08.5 Track 1 |
| MER-52 | Capability manifest endpoint `/api/v1/capabilities` | Sprint 12 |
| MER-55 | Identity bootstrapping documentation (in `docs/SECRETS_POLICY.md`) | Sprint 08.5 Track 1 |
| MER-60 | `meridian-mcp` repo scaffold + Variant A deployment per D72 | Sprint 14 |
| MER-62 | GitHub custom secret-scanning pattern per D73 | Sprint 08.5 Track 1 |
| MER-63 | Pre-commit hook `check-secrets.sh` per D73 | Sprint 08.5 Track 1 |

### Low severity

| ID | Summary | Sprint |
|----|---------|--------|
| MER-18 | SSH key on WSL | Resolves with MER-24 |
| MER-19 | gh CLI in WSL | SSH eliminates primary need |
| MER-20 | 5 low-severity Session 07 insights | Sprint 09 bundle |
| MER-21 | DATABASE.md maintenance burden; docs/OPERATIONS.md | Sprint 10 |
| MER-32 | D11 supersession by D22 not reflected in seed | Bundle with MER-23 |
| MER-40 | `.env.example` commit | Sprint 08.5 Track 1 |
| MER-41 | `railway.toml` commit | Sprint 10a |
| MER-53 | CI pipeline | Sprint 10 or 11 |
| MER-54 | Insight ledger filename convention (`_S##-`) | Sprint 08.5 Track 1 |
| MER-57 | D06 scope-narrowing insight per D72 | Sprint 08.5 Track 1 (doc only) |
| MER-58 | D48 retention behavior on session-promoted audit rows | Sprint 10a design detail |

### Deferred

| ID | Summary | Reactivation |
|----|---------|--------------|
| MER-61 | MCP Variant B (remote HTTP) activation | First managed agent mission OR mobile client OR external integration |

### Resolved

| ID | Summary | Resolution |
|----|---------|-----------|
| MER-22 | MCP Server Handler on Zuplo | **Won't-do** per D72. Zuplo MCP dependency dropped; standalone `meridian-mcp` codebase replaces. |
| MER-30 | Clerk Pro M2M availability | **Resolved Session 13.** Confirmed available on Clerk Pro plan. |
| MER-48 | D53 live-DB topology scope | **Resolved by D61.** Ambiguity was interpretive — Railway operational + local sovereign satisfies canon without inversion. |
| MER-50 | D55 deep-context skill update | **Duplicate of MER-29; merged.** |
| MER-59 | Webhook validation surface | **Resolved by D67.** Zuplo HMAC primary, CF Workers fallback (contingent on Sprint 08.5 Track 2). |

### Carry forward (future phases)

| ID | Summary | Phase |
|----|---------|-------|
| MER-01 | AGE deployment on Railway | Phase 2 |
| MER-03 | Ingestion pipeline design | Phase 3 |
| MER-07 | Entity resolution quality | Phase 3 |
| MER-09 | Entity resolution secondary matching | Phase 3 |
| MER-12 | Recommendations engine design | Phase 4 |
| MER-16 | Intelligence source list | Phase 1 |

---

## Part 6 — Documentation Governance

Docs live in `docs/` and are the source of truth for their respective domains:

| Doc | Scope |
|-----|-------|
| `docs/ARCHITECTURE.md` | System architecture, component map, deploy topology, dual-surface reservation per D68 |
| `docs/CODING_STANDARDS.md` | TypeScript conventions, file headers, middleware ordering per INS-013/INS-056 |
| `docs/DATABASE.md` | Schema, migration log, table documentation |
| `docs/EXTRACTION.md` | Extraction prompt v1.x, schema contract, examples |
| `docs/GITOPS.md` | Git workflow, signing, SSH setup, branching, branch protection per D65 |
| `docs/SCHEMA.md` | Graph schema (nodes, edges, properties) |
| `docs/CANON.md` *(pending Sprint 08.5 per D70 / MER-51)* | Project-local canon mirror of master CLAUDE.md (committed) |
| `docs/SECRETS_POLICY.md` *(pending Sprint 08.5 per D73 / MER-38)* | Public-facing secrets policy, enforcement model, emergency procedures reference |
| `docs/OPERATIONS.md` *(pending Sprint 10b per MER-21)* | Runbooks, alert response, cold storage procedures |

**Outside the committed repo:**

| Location | Scope |
|----------|-------|
| `/secrets/SECRETS.md` (gitignored per D73) | Pointer registry of all secrets (owner-only, never committed, per D73) |

**Rule:** CLAUDE.md is identity and governance. Docs are operational detail. If a fact appears in both, docs are authoritative for the operational detail; CLAUDE.md is authoritative for identity/governance.

**Doc updates flow from insights.** Insight ledger → routing summary → approved edits → doc commit. Docs are not edited speculatively; they are edited in response to captured insights or decisions.

---

## Part 7 — Session Index

Sessions captured as deep contexts with D55 structured metadata header (from Session 09 forward):

| # | Date | Theme | File |
|---|------|-------|------|
| 01 | 2026-04-12 | Genesis — CAG vs RAG vs GraphRAG, deep-context skill (D01–D03) | `The_Genesis___The_First_Deep_Context` |
| 02 | 2026-04-13 | Architecture validation (D04–D09) | `MERIDIAN_SESSION_02_ARCHITECTURE_VALIDATION.md` |
| 03 | 2026-04-14 | Schema and extraction (D10–D15) | `MERIDIAN_SESSION_03_SCHEMA_AND_EXTRACTION.md` |
| 04 | 2026-04-14 | Extraction validation, interface (D16–D24) | `MERIDIAN_SESSION_04_EXTRACTION_VALIDATION_AND_INTERFACE.md` |
| 05 | 2026-04-15 | Intelligence layer, SAD (D25) | `MERIDIAN_SESSION_05_INTELLIGENCE_AND_SAD.md` |
| 06 | 2026-04-15 | Insight protocol, git setup (D26–D29) | `MERIDIAN_SESSION_06_INSIGHT_PROTOCOL_AND_GIT_SETUP.md` |
| 07 | 2026-04-15 | Phase 0 infrastructure (D30–D34) | `MERIDIAN_SESSION_07_PHASE0_INFRASTRUCTURE.md` |
| 08 | 2026-04-15 | Phase 0 completion (D35–D38) | `MERIDIAN_SESSION_08_PHASE0_COMPLETION.md` |
| 09 | 2026-04-16 | Security, observability, canon governance (D39–D55; 5 canon) | `MERIDIAN_SESSION_09_SECURITY_OBSERVABILITY_TIER2.md` |
| 10 | 2026-04-16 | Sprint plan diagnostic recon — 56 insights, 26 candidate issues | `MERIDIAN_SESSION_10_SPRINT_PLAN_RECON.md` |
| 11 | 2026-04-16 | Decision lockdown — 18 decisions (D56–D74), D66 canon | `MERIDIAN_SESSION_11_DECISION_LOCKDOWN.md` |
| 12 | 2026-04-17 | Track 1 prompt drafting — Sprint 08.5 Claude Code prompt | `MERIDIAN_SESSION_12_TRACK1_PROMPT_DRAFTING.md` |
| 13 | 2026-04-17 | Reconciliation, vendor confirmation, Opus 4.7 analysis (D75) | `MERIDIAN_SESSION_13_RECONCILIATION_AND_VENDOR_CONFIRMATION.md` |
| 14–16 | 2026-04-17/18 | Skills work, verification, Sprint 09 Phase 1 opening | (See session files) |
| 17 | 2026-04-18 | Sprint 09 Phase 1 opening — sequencing locked, D3 prompt drafted, credential rotation, HC-15 event | `MERIDIAN_SESSION_17_SPRINT_09_PHASE_1_OPENING.md` |

**Decision count:** 75 locked decisions.
**Canon population:** 7 principles (D03, D43, D48, D53, D54, D55, D66).

---

## Part 8 — Revision Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-16 | Master CLAUDE.md established. All 55 decisions captured with full rationale (D01–D55). Canon inheritance documented (6 canon). Issue register synced with Session 10 recon output. |
| 1.1 | 2026-04-16 | Added D56–D74 to full decision register with full rationale. Canon inheritance table updated — D66 (Universal API Authentication) added as seventh canon. D28 marked superseded-in-part by D71. D06 scope-updated by D72. D53 scope-clarified by D61. Meridian-specific hard constraints expanded from 6 to 12 items. Environment table updated — three-repo structure (Meridian + meridian-gateway + meridian-mcp), secrets infrastructure pending, dual-surface reservation. Issue register refreshed: 5 resolved (MER-22, MER-48, MER-50, MER-59, plus MER-29 bundled into D58), 28 new locked MER-33 through MER-63 (with gaps). Session index extended to Session 11. Documentation governance updated — `docs/CANON.md`, `docs/SECRETS_POLICY.md`, `/secrets/SECRETS.md` added with D73 split model. |
| 1.2 | 2026-04-18 | Added D75 (commit identity follows signing authority) to decision register (Session 13). Environment section updated: Claude Code executes in Git Bash (`/d/Meridian/`), GPG signing via WSL bridge (`.meridian/gpg-wsl-bridge.sh`), `allow-loopback-pinentry` in WSL gpg-agent, deep-context skill file path documented (INS-008). Checkpoint calibration note added for Opus 4.7 over-asking tendency — non-mandatory checkpoints report-and-continue. Session index extended to Session 13. Decision count 74 → 75. Model upgrade from Opus 4.6 to Opus 4.7. |
| 1.3 | 2026-04-18 | **Sonnet 4.6 refactor.** Model downgraded from Opus 4.7 to Sonnet 4.6 following Session 17 HC-15 fabrication event and system card analysis. Added top-level fabrication zero-tolerance clause. Added Source Attribution Requirement section with search-before-assert rule and declared-gap protocol. Refactored agent behavioral rules into standalone Part 4A with eight numbered rules: Informed, Instructed, Routed, Guarded, HC-13 (surgical changes), HC-15 (pre-generation verification gate), Correction Persistence, and Over-Eager Initiative (Sonnet 4.6 specific). Removed Opus 4.7 checkpoint calibration; replaced with Sonnet 4.6 calibration. D75 updated with commit-hash verification corollary. Session index extended to Session 17. |

This file is updated at every session close as part of the deep-context routing protocol.
