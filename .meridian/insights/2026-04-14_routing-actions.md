<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# Insight Ledger — Routing Actions from Git Setup

- **Date:** 2026-04-14
- **Task:** Apply approved routing actions from 2026-04-14_git-setup.md
- **Prior ledger:** `.meridian/insights/2026-04-14_git-setup.md`
- **CLAUDE.md version:** Read at session start
- **Prior commit:** `cadddfc` (Phase 0 foundation)

## Insights

### INS-004 | convention_gap | Action 1
**Observation:** Initial staged diff had `CLAUDE.md:48` (Hard Constraint 2) using `.meridian/headers/` while `docs/GITOPS.md:161` used `.meridian/header-{lang}.txt`. Flagged to owner before commit. Owner resolved Hard Constraint 2 to `.meridian/header-{lang}.txt` (matches GITOPS.md). File Structure tree at `CLAUDE.md:260` still renders `headers/` as the short tree-node label — likely intentional ASCII-tree readability, since the long `header-{ts,py,sh,sql,md,css}.txt` doesn't fit the visual style of the tree.
**Affected:** `CLAUDE.md:50` (now resolved), `CLAUDE.md:260` (possibly intentional short form).
**Proposed action:** Line 50 resolved in working tree prior to commit. Line 260 left as owner set it — flag for future review only if it becomes confusing. No doc change needed now.
**Severity:** info (resolved)

### INS-002 | convention_gap | Action 2
**Observation:** Task plan (Action 2, D26) specified adding `.sh`, `.css`, `.mjs` rows to the GITOPS.md header table. `.mjs` was already included in the existing first row (`.js, .ts, .jsx, .tsx, .mjs`) — only `.sh` and `.css` were actually missing.
**Affected:** GITOPS.md header table; this session's interpretation of D26.
**Proposed action:** Added `.sh` and `.css` only. `.mjs` was left as-is (no action needed). Flag D26 description as slightly stale for routing review — it implied three additions when only two were needed.
**Severity:** info

### INS-003 | convention_gap | Action 5
**Observation:** GITOPS.md line 152 says `The pre-commit hook at .meridian/check-headers.sh validates this on every commit.` — the path is missing the `hooks/` directory. Actual path per Phase 0 foundation is `.meridian/hooks/check-headers.sh`. Per task plan this session is insertions-only and should not replace existing content, so the broken path remains. Should be fixed in a subsequent cleanup pass.
**Affected:** `docs/GITOPS.md:152`.
**Proposed action:** Follow-up edit: change `.meridian/check-headers.sh` to `.meridian/hooks/check-headers.sh` on line 152. Out of scope for this session (task constraint: "insertions and row additions, not replacements").
**Severity:** info

### INS-001 | assumption_validated | Step 1
**Observation:** Starting state matches expected: HEAD at `cadddfc`, `.claude/settings.local.json` modified by harness permission appends, `.meridian/insights/2026-04-14_git-setup.md` modified (has the routing-summary tail appended from prior session), CLAUDE.md modified (user reverted all three prior-session amendments — re-removed the `.md` header, restored `.meridian/headers/` on line 48, restored `headers/` in the File Structure tree on line 258).
**Affected:** This session's scope for CLAUDE.md editing.
**Proposed action:** Respect the user's revert as D24 in action. Do not re-apply the header or flat-layout references to CLAUDE.md. Limit CLAUDE.md edits to the Environment table as the task plan specifies. The `.meridian/headers/` references are now a deliberate choice, not a gap.
**Severity:** info

---

## Routing Summary

This session was a pure *application* task — the routing decisions to apply came from the git-setup ledger. No new doc-update proposals were generated that require further routing, with one exception:

| Insight | Target file | Section | Action needed |
|---------|-------------|---------|---------------|
| INS-001 | — | — | No action. Starting-state validation only. |
| INS-002 | `docs/GITOPS.md` (meta) | D26 description | Minor: D26 description mentioned `.mjs` as a missing extension, but `.mjs` was already in the table. Clarify in decision register if D26 is formally recorded. |
| INS-003 | `docs/GITOPS.md:152` | File Headers intro paragraph | **Open follow-up:** change `.meridian/check-headers.sh` to `.meridian/hooks/check-headers.sh`. Out of scope this session (insertions-only rule). Suggested for a future micro-cleanup commit. |
| INS-004 | — | — | Resolved mid-session by owner (line 50 updated before commit). No action. |

**Net result:** 1 open routing item (INS-003). Ledger is primarily a record, not a proposal.

## Session Statistics

| Metric | Value |
|--------|-------|
| Total insights captured | 4 |
| Environment discoveries | 0 |
| Assumptions validated | 1 (INS-001) |
| Assumptions invalidated | 0 |
| Convention gaps found | 3 (INS-002, INS-003, INS-004) |
| Failures and fixes | 0 |
| Recommendations | 0 |
| Security observations | 0 |
| Dependencies flagged | 0 |
| Routing actions applied | 8 (Actions 1 through 8 per task plan) |
| Files modified | 5 (`CLAUDE.md`, `docs/GITOPS.md`, `.claude/settings.local.json`, `.meridian/insights/2026-04-14_git-setup.md`, `.meridian/insights/2026-04-14_routing-actions.md`) |
| Files created | 2 (`.gitattributes`, `.meridian/insights/2026-04-14_routing-actions.md`) |
| Decisions referenced | D26 (header extensions), D27 (reserved in commit msg), D28 (`.gitattributes`), D29 (SSH-from-WSL push) |
| Prior ledger committed | Yes — `.meridian/insights/2026-04-14_git-setup.md` committed with routing summary/stats intact |
| Commit hash | `2086bc9ae531ed6f5fec48e8341cc78c5ba12ce3` (short: `2086bc9`) |
| Signature verified locally | Yes — `Good signature from "Charles K. Johnson <mobile@charleskjohnson.com>"` |
| Signature verified on GitHub | Yes — `{"verified": true, "reason": "valid"}` |
| Pushed to | `github.com/ckj9779/Meridian` → `main` (`cadddfc..2086bc9`) |

