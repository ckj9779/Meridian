<!--
© 2025–2026 Charles K. Johnson. All rights reserved.
Licensed under the Business Source License 1.1. See LICENSE.
-->

# Meridian Canon

This document mirrors the subset of decisions in `decisions` where `canon = TRUE`.
It is human-readable documentation of the 7 cross-project principles that govern
every design and implementation decision in Meridian and in any project that
inherits from the master CLAUDE.md.

Canon decisions cannot be silently demoted. A canon flag may only be flipped in
an explicit session decision; the decision itself becomes the next entry in the
register.

**Canon population as of 2026-04-16:** 7.

---

## D03 — Deep Context Methodology
**One-line:** Reusable skill for structured session handoff.

Deep Context is a reusable methodology and tooling for capturing session state
in a structured, complete handoff document. Every planning session ends with a
Deep Context capture. See D55 for the full three-tier capture protocol.

**Origin:** Session 01 (Meridian). **Elevated to canon:** Session 01.

---

## D43 — Universal Attribution
**One-line:** Who did it — every action carries identity.

Every recorded action carries actor identity via FK to the `identities` registry
(D59 schema). No anonymous actions cross the boundary into operational data.
Attribution is queryable as a constraint, not as a soft field.

**Origin:** Session 09 (Meridian). **Elevated to canon:** Session 09.

---

## D48 — Autonomy-Observability Cascade
**One-line:** How closely we watch — inversely proportional to human presence.

Five tiers (0–4). As human presence decreases, automated observability must
increase to compensate. Promotion to a higher autonomy tier is gated on the
next tier's observability infrastructure being demonstrably ready (D60
`observability_readiness` table). No behavior-only promotion.

**Origin:** Session 09 (Meridian). **Elevated to canon:** Session 09.

---

## D53 — Data Sovereignty at Rest
**One-line:** Where it lives — local primary sources, derived/operational may be cloud.

Irreplaceable primary sources (emails, documents, originals) live on local
disk under physical owner control. Cloud holds derived and operational data
(graph projections, audit trails, staging extractions), reconstructable from
sovereign sources plus system logic. Cloud as primary store only with owner-
held encryption key (not provider-managed).

**Origin:** Session 09 (Meridian). **Elevated to canon:** Session 09.
**Scope clarified:** Session 11 (D61 — no topology inversion required; the
canon is already satisfied by sources-local / derived-in-Railway).

---

## D54 — Observability as Knowledge Infrastructure
**One-line:** What it means — audit data feeds the knowledge graph.

Observability data is first-class knowledge, not a security byproduct. Two
consumers: security/audit and knowledge/context. Session metadata (topics,
entities, artifacts, domains, decisions) captured as structured JSONB,
eventually feeds the knowledge graph.

**Origin:** Session 09 (Meridian). **Elevated to canon:** Session 09.

---

## D55 — Deep Context as Standard Capture Protocol
**One-line:** How we remember — three-tier capture model.

Three-tier capture:
- **Event capture** — per-action, structured, machine-readable.
- **Session synthesis** — per-session-close, routing summary + insight ledger.
- **Deep context** — per-planning-session, structured metadata header
  mandatory, completeness over brevity.

**Origin:** Session 09 (Meridian). **Elevated to canon:** Session 09.

---

## D66 — Universal API Authentication
**One-line:** No data-returning API is anonymously accessible; every endpoint authenticates before handler runs.

Every data-returning route authenticates the caller before any handler code
runs. The only exception is the narrow public `/health` contract (D64) which
returns liveness only, no data. `/v1/system` and everything else requires
Clerk authentication. Applies equally to both surfaces defined in D68
(control plane and any future edge surface).

**Origin:** Session 11 (Meridian), elevated from specific decision D64.
**Elevated to canon:** Session 11.

---

## Governance

Canon decisions are tracked in two places:
- **Authoritative:** `decisions` table, `canon = TRUE` rows.
- **Mirror:** this file.

To add a new canon decision:
1. Lock it as a project decision first (specific case).
2. Observe whether the principle generalizes cross-project.
3. If yes, elevate to canon in a subsequent session decision, referencing
   the specific-case decision as origin.
4. Flip `canon = TRUE` in the seed and apply.
5. Update this file.

To flip a canon decision off (not currently anticipated for any row):
Requires explicit session decision — cannot happen silently. The flipping
decision becomes its own register entry with rationale.
