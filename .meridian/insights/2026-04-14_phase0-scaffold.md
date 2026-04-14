<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# Insight Ledger — Phase 0 Infrastructure Scaffold

- **Date:** 2026-04-14
- **Prompt:** Phase 0 Fastify service scaffold, migration, seed
- **Session:** 07
- **Prior commit:** `2086bc9`
- **Decisions referenced:** D30 (npm), D31 (Fastify + TypeScript strict), D32 (SSE — deferred), MER-17

## Insights

### INS-005 | environment | Step 1
- **Finding:** Railway PostgreSQL server reports `PostgreSQL 18.3`. `docs/DATABASE.md:9` states "PostgreSQL 16". Connection succeeded (via SSL, `rejectUnauthorized: false`). Node v22.17.0, npm 11.5.2 confirmed.
- **Routes to:** `docs/DATABASE.md:9` Overview section; CLAUDE.md Environment table (add npm 11.5.2).
- **Action:** Update `docs/DATABASE.md:9` to "PostgreSQL 18 (Railway)" and add a sub-note validating Apache AGE compatibility with PG 18 before Phase 2 — `apache/age` image support for PG 18 is unverified.
- **Severity:** warning (compatibility risk for Phase 2 AGE rollout)

### INS-006 | security | Step 1
- **Finding:** Railway connection requires `ssl: { rejectUnauthorized: false }` (Railway uses a cert chain that Node.js default CA bundle doesn't trust end-to-end). This is standard Railway practice but worth noting — the SSL is not end-to-end validated.
- **Routes to:** `docs/DATABASE.md` Connection section.
- **Action:** Document the `rejectUnauthorized: false` requirement explicitly in DATABASE.md connection example (currently shown, but not called out as a Railway-specific workaround). Future hardening: pin Railway's CA cert.
- **Severity:** info

### INS-014 | failure_and_fix | Step 7
- **Finding:** The Phase 0 `.gitignore` (from commit `cadddfc`) listed `package-lock.json` in the ignore set. `docs/CODING_STANDARDS.md:335` explicitly states "Lock file (package-lock.json) is committed." These conflict; CODING_STANDARDS wins.
- **Routes to:** `.gitignore` (fixing in this session), and routing summary for the prior session's ledger in case it missed this.
- **Action:** Removed `package-lock.json` from `.gitignore`; replaced with a comment pointing at CODING_STANDARDS:335. `package-lock.json` will now be tracked starting this commit.
- **Severity:** warning

### INS-007 | convention_gap | Step 5
- **Finding:** Seed JSON `decisions` uses `session`, `date`, `related_issues` — none of which are in DATABASE.md's `decisions` DDL. DDL expects `session_number`, `components_affected`, `layers_affected`. Mapped `session`→`session_number`; dropped `date` and `related_issues` (no columns).
- **Routes to:** `docs/DATABASE.md` decisions table OR seed JSON maintenance process.
- **Action:** Either add `date`, `related_issues` columns to `decisions` DDL, or extend seed JSON with `components_affected`/`layers_affected` and rename `session`→`session_number`. Current mapping loses `date` and `related_issues`.
- **Severity:** warning

### INS-008 | convention_gap | Step 5
- **Finding:** Seed JSON `issues` uses severity value `"normal"` (not in DATABASE.md's documented set `critical|high|medium|low`). Mapped to `medium` in the seed script.
- **Routes to:** `docs/DATABASE.md` severity values OR seed JSON.
- **Action:** Reconcile. Either add `normal` to the canonical severity set, or rewrite seed JSON values to use canonical names. Current scripted mapping is a local workaround.
- **Severity:** warning

### INS-009 | convention_gap | Step 5
- **Finding:** Seed JSON `issues` uses `title` + `description` (separate fields) + `phase` + `related_decisions` + `notes`. DDL has `summary` + `resolution` + `blocked_by` + `blocks` + `component`. Mapped `title` → `summary`, `notes` → `resolution`. Dropped `phase` and `related_decisions` (no columns). `blocked_by`/`blocks` left null.
- **Routes to:** `docs/DATABASE.md` issues table OR seed JSON.
- **Action:** Owner decision needed — either extend DDL (add `title`, `description`, `phase`, `related_decisions`), or standardize seed JSON to match DDL. Phase/related_decisions data is lost in current seed.
- **Severity:** warning

### INS-010 | convention_gap | Step 5
- **Finding:** Seed JSON `sessions` uses `number` (not `session_number`), `key_deliverables` (text, not array), and `summary` (no DB column). DDL expects `session_number`, `artifacts_produced` (text[]), `deep_context_ref`. Mapped `number` → `session_number`; `key_deliverables` wrapped into single-element text[]; `summary` dropped.
- **Routes to:** `docs/DATABASE.md` sessions table OR seed JSON.
- **Action:** Standardize on one shape. `summary` content is currently lost in seed.
- **Severity:** warning

### INS-011 | convention_gap | Step 5
- **Finding:** Seed JSON `model_preferences` uses `task` / `model` (short names) and has `notes` but no `is_default`. DDL expects `task_type` / `model_id` and `is_default` (boolean). Mapped short names to long; defaulted `is_default=true` for every seed row (each represents the default for its task in the JSON).
- **Routes to:** `docs/DATABASE.md` or seed JSON.
- **Action:** Align field names. Confirm `is_default=true` assumption is correct for all seed rows.
- **Severity:** info

### INS-012 | convention_gap | Step 5 (CRITICAL)
- **Finding:** Seed JSON `system_context` is an array of `{key, value}` dictionary entries (flat K/V). DATABASE.md DDL defines `system_context` as a **versioned document** with `version`, `content`, `change_summary`, `active` columns. These are conceptually different: K/V config vs. versioned long-form document. Cannot map without redesigning.
- **Routes to:** `docs/DATABASE.md` system_context DDL AND seed JSON shape AND `docs/ARCHITECTURE.md` (what is system_context *actually* supposed to be?).
- **Action:** **SKIPPED seeding this table in Phase 0.** Owner must decide: (a) is `system_context` a K/V config table (redesign DDL), or (b) a versioned document (redesign seed to contain one row with a consolidated document), or (c) both (split into two tables). Flagged and deferred.
- **Severity:** critical

### INS-013 | convention_gap | Step 5 (CRITICAL)
- **Finding:** Seed JSON `tech_watch` entries carry `component`, `technology`, `version`, `status`, `phase`, `notes` — describing *technology inventory* (what's in the stack). DDL defines `tech_watch` as an *event log* with `event_type`, `title`, `detected_at` (when was a release / deprecation / breaking change observed). These are different concepts — a static registry vs. a monitoring stream.
- **Routes to:** `docs/DATABASE.md` tech_watch DDL AND `docs/ARCHITECTURE.md` AND seed JSON.
- **Action:** **SKIPPED seeding this table in Phase 0.** Owner must decide whether (a) to split the concepts — add a `tech_stack` inventory table + keep `tech_watch` for events; (b) redefine `tech_watch` to be the inventory table and rename; or (c) reshape seed rows into events. Flagged and deferred.
- **Severity:** critical

### INS-001 | convention_gap | Step 0 (pre-flight) / Step 3
- **Finding:** Prompt Step 5 specifies seed file at `data/seed/meridian-seed-data.json` (repo root). Actual location is `.meridian/data/seed/meridian-seed-data.json` (inside the `.meridian/` infrastructure folder). User clarified mid-session. 37KB JSON, 760 lines, top-level keys: `_meta, decisions, decisions_pending_session_07, issues, legacy_issues, sessions, system_context, model_preferences, tech_watch` — matches prompt's described shape exactly.
- **Routes to:** Session 07 plan for next revision; `docs/DATABASE.md` Seed Data section.
- **Action:** Updated `src/scripts/seed.ts` to use `.meridian/data/seed/...`. Document the `.meridian/data/` convention in DATABASE.md (seed data lives alongside other infrastructure artifacts, not at repo root).
- **Severity:** info (resolved)

### INS-002 | convention_gap | Step 0 (pre-flight)
- **Finding:** `docs/CODING_STANDARDS.md:34` specifies TypeScript `module: "NodeNext"` and a stricter compiler option set (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, etc.) than the prompt's Step 2 tsconfig (`module: "Node16"`, fewer strict flags).
- **Routes to:** Session 07 plan.
- **Action:** Follow CODING_STANDARDS.md per prompt's escape valve ("If the doc and this prompt conflict, follow the doc"). Use `NodeNext` + full strict flag set.
- **Severity:** info

### INS-003 | convention_gap | Step 0 (pre-flight)
- **Finding:** `docs/CODING_STANDARDS.md:178-188` specifies **zod** for env validation (`env.ts` pattern). The prompt's dependency list omits zod — only `fastify pg dotenv` for prod. Also prompt says "throw on missing DATABASE_URL" without prescribing a mechanism.
- **Routes to:** Session 07 plan.
- **Action:** Add `zod` to production dependencies and follow the CODING_STANDARDS.md pattern verbatim. Log the additional dependency.
- **Severity:** info

### INS-004 | convention_gap | Step 0 (pre-flight)
- **Finding:** `docs/DATABASE.md:484-497` prescribes `.sql` seed files under `seeds/` ("001_decisions.sql", "002_issues.sql" etc.) with `INSERT ... ON CONFLICT DO NOTHING`. The prompt says to use `src/scripts/seed.ts` consuming `data/seed/meridian-seed-data.json`. Two different seed patterns in play.
- **Routes to:** `docs/DATABASE.md` Seed Data section + the project session.
- **Action:** Follow the prompt (single TS script reading JSON) per "make the best choice — do not halt". Log for routing so owner can decide which pattern wins and update the non-canonical doc.
- **Severity:** warning

