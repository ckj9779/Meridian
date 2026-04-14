<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# Session 07 — Insight Synthesis

Cross-ledger analysis of the five Claude Code execution ledgers spanning Sessions 06 and 07. Source ledgers (chronological):

1. `2026-04-14_git-setup.md` — Session 06, git/GPG repo bootstrap (10 insights)
2. `2026-04-14_routing-actions.md` — Session 06, applies routing actions from #1 (4 insights)
3. `2026-04-14_phase0-scaffold.md` — Session 07, Fastify + migration 001 + initial seed (14 insights)
4. `2026-04-14_migration-002.md` — Session 07, `stack_components` + `system_context` reshape (4 insights)
5. `2026-04-14_migration-003.md` — Session 07, schema/seed alignment + DATABASE.md cleanup (2 insights)

## Overview

| Metric | Value |
|---|---|
| Sessions covered | 2 (Session 06 → Session 07) |
| Ledgers analyzed | 5 |
| Total insights | **34** |
| Resolution rate | **29 of 34 (85%) closed**; 5 still open (3 owner-decisions, 2 operational) |
| Critical insights raised | 2 (both resolved by migration 002) |
| Net commits driven by insight routing | 4 (`2086bc9` routing-actions, `8c56bbd` mig 002, `d040b59` mig 003, plus inline fixes during scaffold `799ae70`) |

### Insight counts by type

| Type | Count | Share |
|---|---:|---:|
| `convention_gap` | 20 | 59% |
| `failure_and_fix` | 5 | 15% |
| `environment` | 4 | 12% |
| `assumption_validated` | 2 | 6% |
| `dependency` | 1 | 3% |
| `security` | 1 | 3% |
| `recommendation` | 1 | 3% |
| `assumption_invalidated` | 0 | 0% |

**Headline:** Six in ten insights are convention gaps — the dominant problem this period was misalignment between docs, prompts, and reality, not bugs or surprises. Zero `assumption_invalidated` is notable: every recorded design decision (D01–D34) that came up under load held; what failed was the *expression* of those decisions across docs and prompts.

### Insight counts by severity

| Severity | Count | Share |
|---|---:|---:|
| critical | 2 | 6% |
| warning | 14 | 41% |
| info | 18 | 53% |

### Insights per ledger

| Ledger | Session | Insights | Density vs. workload |
|---|---|---:|---|
| git-setup | 06 | 10 | High — discovery + setup |
| routing-actions | 06 | 4 | Low — pure application |
| phase0-scaffold | 07 | 14 | Highest — first contact with seed JSON |
| migration-002 | 07 | 4 | Low — locked design + execution |
| migration-003 | 07 | 2 | Lowest — pure cleanup |

Density correlates with novelty: discovery sessions generate 10–14 insights, application sessions generate 2–4. Three of the five sessions were "pure application" — design locked in advance, execution mechanical — and they consistently produced single-digit insight counts.

---

## Pattern Analysis

### 2a. Documentation Drift

**`docs/DATABASE.md` is the dominant drift surface.** Cited 17 times across all ledgers as a target for correction. By category:

| Drift category | Count | Insights |
|---|---:|---|
| DDL ↔ seed-JSON column-name mismatches | 5 | scaffold INS-007/008/009/010/011 |
| DDL ↔ seed-JSON conceptual mismatches | 2 | scaffold INS-012, INS-013 (CRITICAL) |
| Convention statements (`.sql` vs JSON seed; uuid vs serial PK) | 2 | scaffold INS-004; mig-002 INS-001 |
| Path references (seed location) | 1 | scaffold INS-001 |
| Version numbers (PG 16 → 18) | 1 | scaffold INS-005 |
| Counts ("15 Tables" — actually 16) | 1 | mig-002 INS-004 |
| Connection requirements (Railway SSL workaround undocumented) | 1 | scaffold INS-006 |
| Doc bug — broken in-doc path | 1 | routing-actions INS-003 (`docs/GITOPS.md:152`) |
| `stack_components` not in table listing | 1 | mig-002 INS-004 |
| New columns from migration 003 not documented | 1 | mig-003 (Step 6 work) |
| Severity enum value mismatch (`"normal"` not in canonical set) | 1 | scaffold INS-008 |

**`docs/GITOPS.md` is the second drift surface.** 8 routing items targeted it across git-setup → routing-actions:

| Drift category | Insights |
|---|---|
| Header-table extension coverage (missing `.sh`, `.css`) | git-setup INS-002 |
| Hook installation procedure (NTFS symlink fallback) | git-setup INS-008 |
| Signing environment (WSL canonical; key fingerprint) | git-setup INS-007 |
| GPG-agent TTY workflow | git-setup INS-009 |
| WSL push strategy (D29) | git-setup INS-010 |
| Email-verification scope requirement | git-setup INS-005 |
| Stale path on `:152` | routing-actions INS-003 |
| `--reseed` workflow now in DATABASE.md but missing operational notes in GITOPS | (implicit, none filed) |

**`CLAUDE.md` is the third drift surface, but smaller.** 3 routing items:
- Environment table needed expansion with empirically discovered tool versions and the WSL-vs-Git-Bash split (git-setup INS-001, INS-007).
- Header constraint and File Structure tree referenced `.meridian/headers/` instead of the canonical `.meridian/header-{lang}.txt` (git-setup INS-004; routing-actions INS-001/INS-004 — eventually resolved by user to flat-file convention on the Hard Constraint, kept short label in the tree).

**Drift signature:** the gaps cluster around docs that were written **once at session 05** then not maintained as code/data caught up to them. DATABASE.md was the worst offender because its DDL section is the closest equivalent to a contract — when seed JSON shape diverged, every column became a contract violation.

### 2b. Prompt vs Reality Gaps

Five categories observed, all in Session 07's scaffold prompt (the longest, most complex prompt of the period):

| Category | Examples |
|---|---|
| **Prompt assumed wrong path** | scaffold INS-001 (`data/seed/...` vs actual `.meridian/data/seed/...`) |
| **Prompt assumed wrong schema** | scaffold INS-007 through INS-013 — JSON/DDL vocabulary and conceptual mismatches; specifically the seed JSON used `session`/`title`/`number`/`task`/`model` while DDL expected `session_number`/`summary`/`session_number`/`task_type`/`model_id` |
| **Prompt omitted a dependency** | scaffold INS-003 (zod required by CODING_STANDARDS env-validation pattern but not in prompt's prod-deps list) |
| **Prompt contradicted a doc** | scaffold INS-002 (tsconfig in prompt was weaker than CODING_STANDARDS); git-setup convention conflict (header text 2-line vs docs 1-line); migration-002 prompt's `serial` PK conflicting with DATABASE.md's uuid convention |
| **Prompt referenced something already done** | routing-actions INS-002 (D26 said "add `.mjs`" but `.mjs` was already in the table) |

A meta-observation: the prompts had escape clauses ("If the doc and this prompt conflict, follow the doc and log as `assumption_invalidated`"), and they worked — but the gaps still represent friction the operator paid for in real time. Every gap caused a stop-and-decide branch in execution.

### 2c. Convention Gaps

Conventions discovered or clarified during execution that weren't (or weren't fully) written down beforehand:

| Convention | First surfaced | Now documented? |
|---|---|---|
| `.meridian/data/` is the infrastructure-artifact namespace (alongside `.meridian/headers/`, `.meridian/hooks/`, `.meridian/insights/`) | scaffold INS-001 | ✅ DATABASE.md Seed Data section now points here |
| Seed pattern is JSON + adapter `seed.ts`, not `.sql` files under `seeds/` | scaffold INS-004 | ✅ DATABASE.md rewritten in mig-003 |
| Header-template extension coverage includes `.sh` and `.css` (D26) | git-setup INS-002 | ✅ GITOPS.md updated |
| `core.hooksPath .meridian/hooks` is the NTFS-safe hook activation pattern | git-setup INS-008 | ✅ GITOPS.md updated |
| WSL is the canonical signing environment; Git Bash keyring is empty | git-setup INS-007 | ✅ CLAUDE.md Environment + GITOPS.md |
| `serial` PK is acceptable for small static inventory tables | mig-002 INS-001 | ✅ DATABASE.md notes the exception |
| `package-lock.json` must be committed (pre-existing convention; .gitignore violated it) | scaffold INS-014 | ✅ `.gitignore` fixed; CODING_STANDARDS:335 was already authoritative |
| Smoke-test discipline: kill the dev server explicitly via TaskStop | mig-003 INS-002 | ❌ tribal — needs scripts/kill-dev.sh or pre-session guard |
| WSL `/usr/bin/gh` is `gitsome` (not GitHub CLI) | git-setup INS-010 | ❌ tribal — only in INS-010 narrative, not in any user-facing doc |
| `gh` token needs `user` scope to verify email addresses programmatically | git-setup INS-005 | ❌ tribal — workaround in place, not documented |
| `.claude/settings.local.json` gets harness-appended every session | git-setup INS-006 | ❌ tribal — tracking decision still pending |

**Eight conventions captured into docs; four still tribal.** All four tribal ones are about WSL/operational-hygiene, not about the codebase itself.

### 2d. Environment Discoveries

Empirically discovered facts and their documentation status:

| Fact | Discovered | Documentation status |
|---|---|---|
| Two-shell-world: Git Bash + WSL with separate keyrings/configs | git-setup INS-001 | ✅ CLAUDE.md Environment table |
| GPG `rsa4096/799AD4A789D27DA8`, fingerprint `5B68E52AEEA21C15A7A5C868799AD4A789D27DA8`, expires 2028-04-13 | git-setup INS-007 | ✅ CLAUDE.md + GITOPS.md |
| Node v22.17.0, Python 3.13.5 | git-setup INS-001 | ✅ CLAUDE.md (npm 11.5.2 still missing) |
| GitHub CLI v2.74.2, authenticated as ckj9779 | git-setup INS-001 | ✅ CLAUDE.md |
| **PostgreSQL 18.3** on Railway (not 16 as DATABASE.md assumed) | scaffold INS-005 | ✅ DATABASE.md updated |
| Railway SSL requires `rejectUnauthorized: false` | scaffold INS-006 | ✅ DATABASE.md updated |
| WSL+NTFS does not support `ln -s` — need `core.hooksPath` | git-setup INS-008 | ✅ GITOPS.md |
| gpg-agent default TTL 600s; pinentry needs TTY when invoked via wsl.exe -e | git-setup INS-009 | ✅ GITOPS.md (recommends `default-cache-ttl 7200`) |
| WSL `/usr/bin/gh` is **gitsome**, not GitHub CLI | git-setup INS-010 | ❌ tribal |
| GPG 2.4 uses `keyboxd` daemon (`use-keyboxd` in `common.conf`) | git-setup INS-001 | ❌ tribal — mentioned in INS but no doc |
| npm 11.5.2 specifically | scaffold INS-005 | ❌ not in CLAUDE.md Environment table |
| Stale Fastify processes survive Claude Code session ends and hold port 3000 | mig-003 INS-002 | ❌ tribal |
| `.claude/settings.local.json` CRLF + churn behavior | git-setup INS-006 | ❌ tribal |

**Eight documented; five still tribal.** All five tribal items are operational, not architectural.

### 2e. Insight Protocol Effectiveness

**Density per session:** 10, 4, 14, 4, 2. Mean 6.8/session. Discovery sessions (git-setup, scaffold) generated 4–7× the insights of pure application sessions (routing-actions, mig-003).

**Routing→follow-up effectiveness:**
- git-setup's 10 insights → 8 of them targeted GITOPS.md → routing-actions session applied them all in commit `2086bc9`. **100% routing follow-through.**
- scaffold's 14 insights → 2 critical to migration-002 (`8c56bbd`); 8 warning to migration-003 (`d040b59`); 4 closed as info-only/already-resolved. **100% routing follow-through.**
- migration-002's 4 insights → mig-003 picked up INS-004 (table count) immediately; INS-001 (serial PK) resolved via DATABASE.md exception in mig-003; INS-002 and INS-003 still open.
- migration-003's 2 insights — both unresolved/operational (synthesis surfaces them now).

**Resolution velocity:** the Phase 0 scaffold ledger went from 14 insights → 0 actionable insights in 2 follow-up sessions. That's a 3-session arc per insight cohort, which suggests the insight protocol has a working feedback loop.

**Insights that almost got missed:**
- scaffold INS-014 (`package-lock.json` in `.gitignore`) was caught at staging time, just before commit. Would have shipped silently otherwise.
- mig-003 INS-002 (zombie server on port 3000) was caught only because `curl /health` returned 200 *before* the new tsx server bound to the port. The 200 came from the *old* PID 77212 still running from scaffold session's smoke test. Without sharper attention, the smoke test would have appeared to pass and the commit would have shipped without ever validating the new code path.
- Both are arguments for **a pre-commit "summary of staged changes" review step** (caught INS-014) and **a pre-smoke-test "check port is free" guard** (caught INS-002).

**Insights that should have been caught earlier:**
- scaffold INS-002 / INS-003 (tsconfig and zod gaps) — these were doc-vs-prompt conflicts that pre-flight inspection of CODING_STANDARDS.md before writing the prompt would have prevented.
- scaffold INS-007 through INS-011 (vocabulary mismatches) — these would have been caught by a pre-flight `node -e "console.log(Object.keys(seed.decisions[0]))"` against the JSON before writing seed.ts. The prompts described the JSON shape *as it was supposed to be*, not as it actually was.

---

## Recommendations

### 3a. Documentation Changes (still outstanding)

| Doc | Section | Change |
|---|---|---|
| `CLAUDE.md` | Environment table | Add row: `npm` v11.5.2. Add row: `gpg-agent` daemon `keyboxd` (GPG 2.4 default; affects key listing — keys live in `~/.gnupg/public-keys.d/pubring.db`, not `pubring.gpg`). |
| `docs/GITOPS.md` | "Pushing — SSH from WSL" or new "WSL pitfalls" subsection | Document that WSL's `/usr/bin/gh` is **gitsome**, not GitHub CLI. Recommend `apt remove gitsome && install gh` from the official GitHub repo *or* explicit acceptance of "sign in WSL, push from Git Bash" split until SSH push (D29) is set up. |
| `docs/GITOPS.md` | "Signing — Email verification" | Note that `gh api user/emails` requires `gh auth refresh -h github.com -s user` (extra `user` scope). Default `gh` install doesn't have it. |
| `docs/GITOPS.md` | "Smoke testing" (new section, or under "Setup") | Document the kill-stale-server pattern. Suggest `scripts/kill-dev.sh` helper that takes a port number. |
| `docs/DATABASE.md` | Seed Data section | Note that `tech_watch` JSON array still contains legacy inventory data (now redundant with `stack_components`). Recommend removing on next seed JSON revision (mig-002 INS-002). |
| `docs/DATABASE.md` | Seed Data section | Document `severity` semantics: 4 CAG-* legacy issues have `null` severity in JSON; script defaults to `medium` (mig-003 INS-001). Either assign explicit severities in JSON or document the default. |

### 3b. Prompt Engineering Improvements

Based on what generated insight noise vs. what didn't:

1. **Pre-flight schema inspection.** Any prompt that touches a JSON-driven seed should include a Step 0 that prints `Object.keys()` of the JSON and compares to expected DDL columns. Would have caught scaffold INS-007 through INS-011 before they generated work.

2. **Pre-flight path verification.** Prompts referencing files at specific paths should verify the files exist before writing scripts that depend on them. The scaffold prompt referenced `data/seed/...` that didn't exist; my Step 0 already does this opportunistically — formalize it into a "pre-flight checks" section at the top of every prompt.

3. **Reference docs by section, don't restate.** scaffold prompt restated tsconfig with weaker flags than `docs/CODING_STANDARDS.md:19-37`. mig-002 prompt specified `serial` PK while `docs/DATABASE.md:53` says uuid. These conflicts forced operator decisions mid-execution. Prompts should say "see CODING_STANDARDS.md:N-M for tsconfig" rather than including a stale snippet.

4. **List dependencies the docs imply.** scaffold prompt omitted `zod` from prod deps even though `docs/CODING_STANDARDS.md:178-188` mandates the zod env-validation pattern. Future prompts should grep the relevant doc for `import` statements and surface them.

5. **Don't mix "insertions only" with "fix existing bug."** The routing-actions prompt explicitly forbade replacements, which prevented fixing `docs/GITOPS.md:152`'s broken hook path (routing-actions INS-003). Either allow fixes in the same commit or route them to a follow-up — the prohibition created a no-op insight.

6. **Add "kill listener on port X" preamble to smoke-test sections.** Would prevent the zombie-server confusion from mig-003 INS-002.

7. **Avoid prompts that list non-existent items as missing.** routing-actions INS-002 (`.mjs` already in table — no action). When the prompt-author can't easily verify the current state, prompts should say "if X is missing, add it; otherwise skip and log."

### 3c. Process Improvements

1. **Apply the gpg-agent.conf TTL config now.** Three sessions hit the 10-minute passphrase prompt loop. One-line config change, eliminates ~6 minutes of friction per multi-step session.

2. **Insight ledger filenames should include session number.** `2026-04-14_phase0-scaffold.md` is fine, but `2026-04-14_migration-002.md` and `2026-04-14_migration-003.md` would benefit from `2026-04-14_S07-migration-002.md` ordering when multiple ledgers per day exist. Sessions 06 and 07 both produced a `2026-04-14_*.md` ledger; chronological sort by filename only works because of alphabetic ordering of the topic slug.

3. **The "pure application session" pattern is working — keep using it.** Migration 002 (4 insights) and migration 003 (2 insights) showed that locking design decisions before execution drops insight density to a manageable level. Discovery sessions should be deliberately scoped narrower.

4. **Formalize "post-commit synthesis" as a step.** Both routing-actions and migration-003 sessions appended their routing summary to the prior session's ledger *after* the commit went through, leaving the working tree dirty until the next commit. This is fine in practice but should be acknowledged as a pattern: the routing summary is a *proposal* at the time of writing, not a record, so it being uncommitted is correct semantically.

5. **Consider splitting "create scaffold" from "load seed" in future scaffold-style sessions.** The Phase 0 scaffold prompt produced 14 insights — almost half were vocabulary mismatches surfaced when the seed actually ran. A "scaffold-only" session followed by a "load-seed" session would have separated structural work from data work and reduced cognitive load per session.

6. **`scripts/kill-dev.sh` (or equivalent) should be added.** Would have prevented mig-003 INS-002 and would help any future session that runs the dev server. ~5 lines of bash, value is instant.

---

## Unresolved Items

5 insights are still actionable as of commit `d040b59`:

| ID | Source Ledger | Finding | Remaining Action |
|---|---|---|---|
| INS-005 | git-setup | `gh` token lacks `user` scope; can't verify GitHub-verified emails programmatically. | Either: (a) `gh auth refresh -h github.com -s user`, or (b) accept manual verification and document in GITOPS.md. |
| INS-006 | git-setup | `.claude/settings.local.json` is tracked but auto-appended every session, causing churn + CRLF warnings. | Decide: (a) `git rm --cached .claude/settings.local.json` and add to `.gitignore`, or (b) accept churn. (`.gitattributes` was added in routing-actions; LF/CRLF half is resolved.) |
| INS-002 | migration-002 | Seed JSON `tech_watch` array still contains legacy inventory data (now redundant with `stack_components`). | Decide: (a) remove `tech_watch` array from JSON and add `stack_components` array (single source of truth), or (b) leave JSON alone (live with duplication). |
| INS-003 | migration-002 | gpg-agent passphrase TTL not yet configured (still defaults to 600s). | Apply `default-cache-ttl 7200` and `max-cache-ttl 14400` to `~/.gnupg/gpg-agent.conf` in WSL; reload with `gpgconf --kill gpg-agent`. |
| INS-001 | migration-003 | 4 `legacy_issues` (CAG-01..CAG-04) have `severity: null` in seed JSON. Script defaults them to `medium`. | Decide: (a) assign explicit severities, or (b) document `medium` as the default behavior in DATABASE.md. |

**All other 29 insights are closed** — either resolved by a subsequent commit, validated as no-action-needed, or absorbed into the doc updates that landed in commits `2086bc9`, `8c56bbd`, or `d040b59`.

---

## Statistics

| Metric | Value |
|---|---|
| Sessions | 2 (06, 07) |
| Ledgers | 5 |
| Total insights | 34 |
| Resolved | 29 (85%) |
| Open (actionable) | 5 (15%) |
| Critical | 2 (both resolved by mig-002) |
| Convention gap share | 59% (20/34) |
| Failure-and-fix share | 15% (5/34) |
| Environment-discovery share | 12% (4/34) |
| Conventions added to docs this period | 8 |
| Conventions still tribal | 4 (all WSL/operational) |
| Doc updates routed → applied | 17 (all targeting `docs/DATABASE.md` and `docs/GITOPS.md`) |
| Commits in period | 5 (`cadddfc`, `2086bc9`, `799ae70`, `8c56bbd`, `d040b59`) |
| All commits GPG-verified on GitHub | Yes |
| Branch state | `main` is at `d040b59`, in sync with `origin/main` |
| Smoke tests passed | 2 (scaffold session + mig-003 — both `200 database:connected`) |
| Migrations applied to Railway | 3 (`001_phase0_tables`, `002_stack_components`, `003_schema_seed_alignment`) |
| Tables now live | 9 (8 application + `schema_migrations`) |
| Rows seeded | 78 (32 decisions + 23 issues + 6 sessions + 4 model_preferences + 1 system_context + 8 stack_components + 4 schema metadata) |
