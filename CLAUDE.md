# MERIDIAN

Personal knowledge graph and intelligence platform.
One store, many lenses. Six layers. Human-in-the-loop is architectural.

---

## Identity

- **Codename:** Meridian — the reference line everything else is measured from.
- **Owner:** Charles K. Johnson (GitHub: ckj9779)
- **License:** BSL 1.1 — every commit GPG-signed, every source file carries a copyright header.
- **Repository:** https://github.com/ckj9779/Meridian
- **Current phase:** Phase 0 — Foundation

## Architecture (read docs/ARCHITECTURE.md for full spec)

Six layers, in order:

1. **Context** — Knowledge graph + operating context + source definitions
2. **Memory** — PostgreSQL (working: context window, declarative: graph + tables, episodic: agent_events, procedural: prompts + code)
3. **Skills** — Three retrieval lenses + source scanners + extraction pipeline + external tools, MCP-exposed via Zuplo
4. **Harness** — Budget, domain scope, action gates, mission scope, time limits, escalation (see Harness Constraints below)
5. **Orchestration** — Agents API primitives (agents, environments, sessions, events), orchestrator-worker pattern, async webhooks
6. **Self-Maintenance** — Correction tracking, prompt refinement, graph hygiene, context self-updates, insight capture

**Canonical store:** PostgreSQL + Apache AGE on Railway
**API gateway:** Zuplo (auth, rate limiting, semantic caching, MCP Server Handler)
**Agent runtime:** Anthropic Agents API (managed execution), Railway (webhooks + database)
**Frontend:** Next.js on Vercel (future)

## Four Domain Vectors

Every node in the graph carries a `domains` property. Queries can target one domain or span all.

| Domain | Scope |
|--------|-------|
| Professional | W-2 employment, ventures, career, industry relationships |
| Private | Family, friends, logistics, health, finances, kids |
| Spiritual | Faith, Bible study, church, worship, pastoral |
| Romantic | Dating, relationships, date plans |

Cross-domain queries ignore the domain filter entirely. "Is Saturday available?" scans all four.

## Hard Constraints

These are non-negotiable. Every session, every agent, every commit.

1. **Human-in-the-loop is architectural (D24).** Extractions are proposals. They land in a staging table, not the live graph, until a human reviews them. No system writes to the canonical graph without human approval.
2. **BSL 1.1 on every file (D25).** Every source file starts with the copyright header from `.meridian/header-{lang}.txt`. Every commit is GPG-signed. No exceptions.
3. **No force-push.** Ever. Rebase and resolve.
4. **No secrets in code.** Environment variables for all credentials. `.env` is gitignored. Secrets never appear in commits, logs, or issue text.
5. **Conventional Commits.** Format: `type(scope): description`. Types: feat, fix, refactor, docs, test, chore, ci. See docs/GITOPS.md.
6. **Extraction is proposal, not fact.** The extraction model cannot resolve ambiguity requiring life context. Every extraction pipeline must include a staging step and a triage conversation before graph write.
7. **Domain scope enforcement.** Agents carry allowed domains. A Professional intelligence scanner cannot read Romantic-only nodes. Harness middleware enforces this.
8. **No pre-filter on data.** Every email, notification, and transaction gets extracted. "Noise" is a data engineering bias that conflicts with total context capture (D13, D14).

## Harness Constraints

The harness wraps the orchestration layer. Every agent-to-tool call passes through it.

| Constraint | Rule |
|------------|------|
| Budget | Token/cost ceiling per session from `mission_policies`. Agent stops and reports when exhausted. |
| Domain scope | Auth token carries allowed domains. API rejects out-of-scope queries. |
| Action gates | Read = free. Stage write = free. Graph write = human approval. External send = hard gate (agent drafts, human sends). |
| Mission scope | Allowed sources and graph subsets defined per mission. Deviation flags and pauses. |
| Time | Session timeout with checkpointing. Prevents runaway loops. |
| Escalation | Low confidence, contradictory data, authority boundaries → `escalations` table for human review. |

## Environment

Known facts about the development environment. Updated by the insight protocol as new facts are discovered.

| Fact | Value | Source |
|------|-------|--------|
| OS | Windows + WSL (Ubuntu) | Session 05 |
| Machine | StarshipOne | Session 05 |
| Local repo path | `/mnt/d/Meridian/` | Session 05, verified |
| Git context | WSL is canonical for signing and push. GPG key `799AD4A789D27DA8` lives in WSL (`/home/cjohnson/.gnupg`). Git Bash available but isolated keyring — do not use for signed operations. | Git-setup ledger INS-001, INS-007 |
| GPG | v2.4.5 (WSL). Key: `rsa4096/799AD4A789D27DA8`, expires 2028. Passphrase cached via gpg-agent. | Git-setup ledger INS-001, INS-009 |
| Node.js | v22.17.0 | Git-setup ledger INS-001 |
| Python | 3.13.5 | Git-setup ledger INS-001 |
| GitHub CLI (`gh`) | Authenticated as ckj9779 | Git-setup ledger INS-001 |
| Railway CLI | TBD — confirm availability | — |
| Push method | SSH from WSL (D29). Configure SSH key if not already present. | Git-setup ledger INS-010 |

**When you discover a new environment fact, log it as an insight (type: `environment`) and propose an update to this table.**

---

## Task Routing

Before starting work, read the reference docs relevant to your task. CLAUDE.md is always loaded. These are loaded on demand.

| Task type | Read first |
|-----------|------------|
| Database, schema, migrations, SQL | `docs/DATABASE.md`, `docs/SCHEMA.md` |
| Graph queries, Cypher, AGE | `docs/SCHEMA.md`, `docs/DATABASE.md` |
| Entity extraction, ingestion pipeline | `docs/EXTRACTION.md`, `docs/SCHEMA.md` |
| API service, endpoints, Zuplo | `docs/ARCHITECTURE.md`, `docs/CODING_STANDARDS.md` |
| Frontend, UI, interface | `docs/ARCHITECTURE.md`, `docs/CODING_STANDARDS.md` |
| Git, branching, releases, signing | `docs/GITOPS.md` |
| Code style, linting, error handling | `docs/CODING_STANDARDS.md` |
| Agent design, harness, orchestration | `docs/ARCHITECTURE.md` (future: `docs/HARNESS.md`) |
| Licensing, IP, copyright | `docs/GITOPS.md`, `LICENSE`, `COPYRIGHT` |

**Future docs** (created when their layers are built): `docs/API_CONTRACTS.md`, `docs/HARNESS.md`, `docs/TESTING.md`

---

## Insight Protocol

Every Claude Code session and every agent produces observations during execution — environment discoveries, assumption validations, convention gaps, failures and fixes. These are **episodic memory**. Without a capture mechanism, they evaporate.

### The Ledger

At the start of every session, create the file:

```
.meridian/insights/YYYY-MM-DD_task-slug.md
```

Append entries as you work. Do not wait until the end. Each entry follows this format:

```markdown
### INS-NNN | type | Step N reference
**Observation:** What you found.
**Affected:** Which files, docs, tables, or decisions this touches.
**Proposed action:** What should change. Be specific — name the file, section, and the update.
**Severity:** info | warning | critical
```

### Insight Types

| Type | What it captures | Routes to |
|------|-----------------|-----------|
| `environment` | Machine, OS, tool versions, path quirks, runtime behavior | CLAUDE.md → Environment table |
| `assumption_validated` | A design decision from D01-D25 confirmed by execution | Decision register (strengthens confidence) |
| `assumption_invalidated` | A design decision that execution proved wrong | Decision register + affected doc + new issue |
| `convention_gap` | The docs don't cover something that came up during execution | Target doc (whichever should have addressed it) |
| `dependency` | Version, behavior, compatibility, or availability of external tool/service | CLAUDE.md Environment or relevant doc |
| `failure_and_fix` | Something broke and how it was resolved — the fix matters | Relevant doc (prevents re-discovery) |
| `recommendation` | A better approach discovered during execution | Next session pending actions |
| `security` | Keys, secrets, permissions, access control, exposure risk | docs/GITOPS.md or docs/ARCHITECTURE.md |

### Capture Triggers

Log an insight when any of the following occur:

- A command fails unexpectedly
- A tool version differs from what was assumed
- A design assumption is confirmed or disproven by real behavior
- You make a decision not covered by existing docs
- You discover something the next session or agent will need to know
- You work around a limitation
- A security-relevant observation surfaces
- You identify a gap between what the docs say and what reality requires

### End-of-Session Synthesis

At the end of every session, produce a **routing summary** at the bottom of the insight ledger:

```markdown
## Routing Summary

| Insight | Target file | Section | Action needed |
|---------|-------------|---------|---------------|
| INS-001 | CLAUDE.md | Environment | Add row: Node.js v22.1.0 |
| INS-003 | docs/GITOPS.md | Signing | Add WSL GPG passphrase note |
| INS-005 | — | — | New issue: MER-18 — AGE Docker image tag changed |
```

This routing summary is the handoff artifact. It tells the next session (or the owner in a project session like this one) exactly what to update and where. The owner reviews and approves changes before they're applied to docs — same human-in-the-loop principle as graph writes (D24).

---

## Agent Behavioral Rules

These rules apply to every Claude Code session and every Meridian agent.

### Informed
- Read CLAUDE.md at session start. It is always loaded automatically.
- Read task-relevant docs from the routing table before writing any code.
- If an insight ledger exists from a prior session in `.meridian/insights/`, scan it for unresolved items relevant to your task.

### Instructed
- Follow hard constraints without exception.
- Follow conventions in docs/CODING_STANDARDS.md for all code.
- Follow docs/GITOPS.md for all Git operations.
- When a decision (D01-D25+) is relevant, follow it. Do not silently override or reinterpret decisions.

### Routed
- Use the task routing table to load the right context.
- When you encounter a task that doesn't fit the routing table, log an insight (type: `convention_gap`) and propose an update.
- If a future doc is referenced that doesn't exist yet (e.g., `docs/HARNESS.md`), fall back to docs/ARCHITECTURE.md and note the gap.

### Guarded
- Never write to the canonical graph without human approval.
- Never commit without a GPG signature.
- Never skip the insight ledger — if you're executing, you're observing.
- Stop and escalate when:
  - Confidence is low on a destructive action
  - Data contradicts a recorded decision
  - A security-relevant observation surfaces
  - Scope drifts beyond the original task

### Checkpoints
- Long-running tasks include explicit **STOP and report** checkpoints.
- At each checkpoint, the agent or session reports current state, any insights captured so far, and requests confirmation before proceeding.
- Do not batch all reporting to the end. The owner needs to see what's happening as it happens.

---

## Documentation Governance

The docs in `docs/` are living documents. They evolve as the system evolves. But they evolve through a controlled process, not ad hoc edits.

### How docs get updated

1. **Insight captured** during a Claude Code session or agent run.
2. **Routing summary** maps the insight to a specific doc and section.
3. **Owner reviews** the routing summary (in a project session or directly).
4. **Update applied** — either by the owner, by Claude Code in a follow-up task, or by a future self-maintenance agent.
5. **Commit** with conventional message: `docs(target): description of update`

### What triggers a new doc

A new reference doc is created when:
- A layer of the architecture is being built and needs procedural reference (e.g., `docs/HARNESS.md` when the harness middleware is implemented).
- A convention gap insight recurs 3+ times pointing to the same missing reference.
- The owner requests it.

### What triggers a doc retirement

A doc is retired (moved to `docs/archive/`) when:
- The system it describes has been replaced.
- A decision supersedes the doc's content entirely.
- The owner requests it.

---

## Decision and Issue References

Decisions and issues are the project's memory. Reference them by ID in commits, code comments, and docs.

- **Decisions:** D01–D25 (Sessions 01–05). Full register in SAD v1.0.
- **Issues:** MER-01 through MER-17. Active issues tracked in session deep context documents.
- **Format in commits:** `Decisions: D04, D25` or `Issue references: MER-14 (resolved)`
- **Format in code comments:** `// D24: human-in-the-loop required here`

When a new decision is made during execution, log it as an insight (type: `recommendation`) with the proposed decision text. It becomes official when the owner confirms it in a session.

---

## File Structure

```
/mnt/d/Meridian/
├── .claude/
│   └── settings.local.json
├── .meridian/
│   ├── headers/              ← Copyright header templates per language
│   ├── hooks/                ← Git hooks (pre-commit, etc.)
│   └── insights/             ← Session insight ledgers (YYYY-MM-DD_task-slug.md)
├── CLAUDE.md                 ← This file. Auto-loaded every session.
├── LICENSE                   ← BSL 1.1
├── COPYRIGHT                 ← Plain-language ownership assertion
├── README.md                 ← Public-facing project description
├── .gitignore
└── docs/
    ├── ARCHITECTURE.md       ← Six-layer system, components, data flows
    ├── CODING_STANDARDS.md   ← Code style, TypeScript strict, Python hints, SQL
    ├── DATABASE.md           ← 15 tables DDL, connection patterns, migrations
    ├── EXTRACTION.md         ← Entity extraction prompt v1, pipeline notes
    ├── GITOPS.md             ← Branching, commits, signing, releases
    └── SCHEMA.md             ← Graph schema v1 (9 nodes, 13 edges, 4 domains)
```
