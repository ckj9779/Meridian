<!--
© 2025–2026 Charles K. Johnson. All rights reserved.
Licensed under the Business Source License 1.1. See LICENSE.
-->

# Meridian Secrets Policy (D73)

## Overview

Meridian handles authentication credentials, signing keys, and connection strings
across multiple classes of actor (human, machine, agent, system — see D43 canon).
This policy documents **how** secrets are handled in this repo. The pointer
registry naming **which** secrets exist and where they live is intentionally
private — see "Split documentation model" below.

## Three-layer enforcement

1. **`.gitignore` directory rule.** The `/secrets/` directory at repo root is
   gitignored. Any file created under it is invisible to git.

2. **Pre-commit hook.** `.meridian/hooks/check-secrets.sh` runs on every commit
   attempt (via the `pre-commit` dispatcher). If any staged file path matches
   `^secrets/`, the commit is rejected with exit code 1 and an explanatory
   message. This catches `git add -f` attempts that bypass `.gitignore`.

3. **GitHub custom secret-scanning pattern** (enforced by GitHub after Chaz
   configures it per MER-62). Pattern name: `meridian-secrets-directory`.
   Severity: Critical. Push protection: enabled. Applies to `Meridian` and
   `meridian-gateway` repos; extends to `meridian-mcp` at creation (MER-60).

## Split documentation model

- **`secrets/SECRETS.md`** — gitignored, owner-only. Pointer registry:
  eight-column table (name, purpose, stored_in, rotator, cadence_days,
  last_rotated, blast_radius_if_leaked, revocation_path). Pointers to where
  the secret actually lives (1Password vault, Railway env, etc.), never the
  values themselves. Also contains emergency rotation procedures (D74).

- **`docs/SECRETS_POLICY.md`** — this file. Committed, public-facing.
  Documents that a registry exists and how the enforcement layers work.
  Does not name specific secrets.

Rationale: the public doc tells a reviewer *that the project has a secrets
policy*. The gitignored doc tells the owner *what the secrets are*. Split by
audience.

## Identity bootstrapping (MER-55)

Initial identities registered in the `identities` table (migration 004, D59):

- `anonymous` — reserved for pre-authentication rejections.
- `machine:starshipone-claude-code` — Claude Code on StarshipOne WSL (D42).
- `machine:meridian-api` — Meridian API service on Railway (D47).
- `human:chaz-clerk-pat` — Human identity, Clerk PAT authenticated (D40).

Adding a new machine identity (e.g. Mac Mini provisioning per MER-31):

1. Generate the machine's GPG key on the machine (never export private keys).
2. Add the public key to GitHub under a machine-specific label.
3. Create the Clerk machine identity (after Sprint 09 Phase 3 when Clerk
   Meridian app is live).
4. Insert row into `identities` table with `identity_string =
   'machine:<hostname>-claude-code'`, `class = 'machine'`, description
   referencing the machine's role.
5. Add a row to `secrets/SECRETS.md` documenting where the machine's
   credentials are stored.
6. Never reuse a retired identity string. If a compromised machine is
   re-provisioned, use a versioned string (`...-v2`).

## Emergency rotation

See `secrets/SECRETS.md` for per-credential-class procedures (D74).

## GitHub configuration steps (Chaz, manual)

To complete the three-layer enforcement, configure GitHub custom
secret-scanning (MER-62):

1. Navigate to repo Settings → Code security and analysis.
2. Enable secret scanning if not already enabled.
3. Under "Secret scanning", click "New pattern".
4. Name: `meridian-secrets-directory`.
5. Secret format (regex): `(^|[\s/])secrets/[^\s]+` — matches any path
   reference beginning with `secrets/` in committed content.
6. Severity: Critical.
7. Enable push protection.
8. Save, then repeat for the `meridian-gateway` repo.

## References

- D43 — Universal Attribution (canon)
- D66 — Universal API Authentication (canon)
- D73 — /secrets/ gitignored directory + three-layer enforcement
- D74 — Emergency rotation procedures per credential class
- MER-38, MER-55, MER-62, MER-63
