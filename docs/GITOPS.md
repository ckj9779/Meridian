<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# Meridian — GitOps Playbook

> Derived from SAD Section 12. Read this for all Git operations, branching, commits, and releases.

## Repository

- **Remote:** github.com/ckj9779/Meridian
- **Default branch:** `main`
- **License:** BSL 1.1 (see LICENSE at repo root)
- **Visibility:** Public

## Commit Signing — Non-Negotiable (D25)

Every commit MUST be GPG-signed. Unsigned commits will be rejected by branch protection.

### Required Git config
```
user.name          = {owner's legal name}
user.email         = {owner's GitHub-verified email}
user.signingkey    = {GPG key ID}
commit.gpgsign     = true
tag.gpgsign        = true
gpg.program        = gpg
```

### Verification
```bash
# Verify config
git config --list | grep -E "user\.|commit\.|tag\.|gpg\."

# Verify last commit signature
git log --show-signature -1

# GitHub must show "Verified" badge on every commit
```

### If signing fails
- Check `gpg --list-secret-keys --keyid-format=long` — key must exist.
- Check `git config user.signingkey` — must match key ID.
- On macOS, you may need: `export GPG_TTY=$(tty)` in your shell profile.
- Ensure the GPG key email matches `user.email` and your GitHub verified email.

### Email verification check (run before GPG key generation)

```bash
gh api user/emails --jq '.[] | select(.email=="mobile@charleskjohnson.com")'
```

If empty, the email is not verified on GitHub. Add and verify it at
https://github.com/settings/emails before generating the GPG key —
signatures won't show as "Verified" otherwise.

If `gh` lacks the `user` scope, refresh first: `gh auth refresh -s user`.

### Canonical signing environment

**Signing architecture.** The GPG key `5B68E52AEEA21C15A7A5C868799AD4A789D27DA8` is the identity anchor for all commits authored on StarshipOne (D27, D43). The private key and `gpg-agent` both live in WSL at `/home/cjohnson/.gnupg`. Signing operations reach the keyring regardless of which shell runs `git commit`:

- **Native WSL path.** `git commit` / `git tag` in a WSL terminal — signing is local to the shell.
- **Git Bash via WSL bridge.** `git commit` / `git tag` in Git Bash (including Claude Code sessions) delegates the GPG operation to WSL through `.meridian/gpg-wsl-bridge.sh`. The resulting signed commit is byte-identical to the native WSL path.

**Pushing.** `git push` must run from a WSL terminal. The SSH key `starshipone-wsl` lives at `/home/cjohnson/.ssh/id_ed25519` (WSL only) per D29. Git Bash has no SSH key for GitHub — push attempts there fail with `Permission denied (publickey)`.

**Attribution invariant (D43).** The shell is execution context; the key is identity. A commit signed with `799AD4A789D27DA8` attributes to Charles K. Johnson regardless of which shell invoked `git commit`. Per D75, this extends to the git attribution surface — commit authorship traces to the GPG key, not to the shell environment.

### GPG-agent cache TTL (StarshipOne WSL)

`~/.gnupg/gpg-agent.conf` sets `default-cache-ttl 7200` (2 hours) and
`max-cache-ttl 28800` (8 hours). This supports the "warmup" pattern:
an interactive terminal primes the cache, then subsequent Claude Code
commits within the TTL window sign without reprompting.

```
default-cache-ttl 7200
max-cache-ttl 28800
```

Reload after changes: `gpgconf --kill gpg-agent && gpgconf --launch gpg-agent`

The Mac Mini provisioning checklist (MER-31) should apply the same config. For the authoritative machine register (SSH identifiers, GPG fingerprints, provisioning status), see CLAUDE.md Part 2 — Machines table.

**Agent warmup:** Before a batch of commits (especially when commits will be
issued by tools or scripts that lack a TTY), run once in an interactive
WSL terminal:

```bash
echo "test" | gpg --clearsign > /dev/null
```

This primes the passphrase cache for the session. Without it, non-TTY
commit attempts fail with `Inappropriate ioctl for device`.

### Claude Code GPG bridge (Git Bash → WSL)

Claude Code runs in Git Bash on Windows, not directly in WSL. The GPG
secret key lives only in WSL's keyring. A bridge script at
`.meridian/gpg-wsl-bridge.sh` delegates signing to `wsl.exe gpg`,
translating file paths between Git Bash and WSL as needed.

Local git config (per-clone, not committed):
```bash
git config --local gpg.program ".meridian/gpg-wsl-bridge.sh"
git config --local user.signingkey 799AD4A789D27DA8
git config --local commit.gpgsign true
```

This config must be set once per fresh clone when working from Git Bash.
When working directly from WSL, `gpg.program = gpg` is sufficient.

**Sibling repos (meridian-gateway, meridian-mcp).** These repos have no `.meridian/` directory, so the relative path above won't resolve. Use the absolute path to the bridge instead:

```bash
git config --local gpg.program "/d/Meridian/.meridian/gpg-wsl-bridge.sh"
git config --local user.signingkey 799AD4A789D27DA8
git config --local commit.gpgsign true
```

This must be set once per fresh clone of any sibling repo. The signing key and bridge are shared; only the path changes.

## Pushing — SSH from WSL (D29)

**Operational status (2026-04-19):** SSH is fully operational on StarshipOne. The ed25519 key `starshipone-wsl` is registered on GitHub; `ssh -T git@github.com` returns "Hi ckj9779!". The origin URL is `git@github.com:ckj9779/Meridian.git`.

### Setup (one-time, per new machine)

```bash
# Generate SSH key (label format: <hostname>-<env> per D42)
ssh-keygen -t ed25519 -C "mobile@charleskjohnson.com"
# Default path: ~/.ssh/id_ed25519. Passphrase recommended.

# Start agent and add key
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Print public key — add to GitHub Settings → SSH and GPG keys → New SSH key
# Label: starshipone-wsl (or <hostname>-<env> for new machines per D42)
cat ~/.ssh/id_ed25519.pub
```

Switch the remote to SSH:

```bash
git remote set-url origin git@github.com:ckj9779/Meridian.git
```

### Verify

```bash
ssh -T git@github.com
# → "Hi ckj9779! You've successfully authenticated..."
```

### Session agent priming

The SSH agent does not persist across WSL sessions. Before each session that will require a `git push`, prime the agent in an interactive WSL terminal:

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

Without this, `git push` from WSL will fail with `Permission denied (publickey)` even after one-time setup is complete. The agent exits when the WSL session closes; priming is required each time.

### Split-terminal pattern

Claude Code executes in Git Bash on Windows. `git push` from Git Bash will fail with `Permission denied (publickey)` — Git Bash has no SSH key for GitHub.

**Canonical workflow:**
1. Claude Code (Git Bash) authors and GPG-signs the commit via WSL bridge.
2. Owner opens a WSL terminal: `cd /mnt/d/Meridian && git push origin main`.
3. GitHub shows "Verified" on the commit.

This pattern expresses D43 (attribution lives with the key) and D29 (push from WSL where the SSH identity lives) in combination — each credential is reached from where it lives, and no identity crosses environment boundaries.

### HTTPS fallback (deprecated)

HTTPS push from Git Bash (via Windows credential manager) was used prior to Phase 2a (2026-04-19). It is **deprecated** and retained only as an emergency fallback when WSL is unavailable. To re-enable temporarily:

```bash
git remote set-url origin https://github.com/ckj9779/Meridian.git
# Push, then restore SSH URL immediately:
git remote set-url origin git@github.com:ckj9779/Meridian.git
```

## Machine Provisioning Checklist

> The canonical machine register is CLAUDE.md Part 2 — Machines table. This checklist documents the *procedure*; the register documents the *result*.

Complete these steps in order when provisioning a new development machine for Meridian.

1. **Prerequisites.** Git, GPG (v2.4+), OpenSSH, WSL Ubuntu (Windows machines). Node.js per `engines` field in `package.json`.

2. **Generate GPG key.** Run in WSL (or native terminal on non-Windows machines):
   ```bash
   gpg --full-generate-key
   # Choose: RSA and RSA, 4096 bits, 3 years expiry
   # Identity: Charles K. Johnson / mobile@charleskjohnson.com (per D27)
   ```
   Interactive — passphrase prompt required. Cannot be scripted from an agent session.

3. **Add GPG public key to GitHub.** Settings → SSH and GPG keys → New GPG key. Export with:
   ```bash
   gpg --armor --export mobile@charleskjohnson.com
   ```

4. **Generate SSH key in WSL.**
   ```bash
   ssh-keygen -t ed25519 -C "mobile@charleskjohnson.com"
   # Default path: ~/.ssh/id_ed25519. Passphrase recommended.
   ```

5. **Add SSH public key to GitHub.** Settings → SSH and GPG keys → New SSH key. Label format: `<hostname>-<env>` (e.g., `starshipone-wsl`, `macmini-native`). Print key with:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

6. **Verify SSH auth.**
   ```bash
   ssh -T git@github.com
   # → "Hi ckj9779! You've successfully authenticated..."
   ```

7. **Configure git identity.**
   ```bash
   git config --global user.name "Charles K. Johnson"
   git config --global user.email "mobile@charleskjohnson.com"
   git config --global user.signingkey <KEY_ID>   # short key ID, e.g. 799AD4A789D27DA8
   git config --global commit.gpgsign true
   git config --global tag.gpgsign true
   ```

8. **Clone repo via SSH.**
   ```bash
   git clone git@github.com:ckj9779/Meridian.git
   cd Meridian
   git config core.hooksPath .meridian/hooks
   ```

9. **Install WSL GPG bridge (Windows / Git Bash only).** Required when Claude Code or other tools run in Git Bash:
   ```bash
   git config --local gpg.program ".meridian/gpg-wsl-bridge.sh"
   ```
   Skip this step on native WSL or macOS terminals where `gpg` is already reachable.

10. **Test: signed empty commit.**
    ```bash
    # Author commit from WSL terminal (or Git Bash after bridge is configured):
    git commit --allow-empty -S -m "test: signing and SSH push from <hostname>"
    # Push from WSL terminal:
    git push origin main
    ```
    Verify on GitHub that the commit shows the "Verified" badge.

> Provisioning is complete only when a signed test commit from the new machine pushes successfully and shows "Verified" on GitHub. This is D43 at the verification layer — the attribution chain is not trusted until it is end-to-end verifiable.

## Branching Strategy

### Branch naming convention
```
main                          # Production-ready. Protected. Signed commits only.
feature/{issue-id}-{slug}     # New features. e.g. feature/MER-01-age-dockerfile
fix/{issue-id}-{slug}         # Bug fixes. e.g. fix/MER-09-entity-resolution
docs/{slug}                   # Documentation only. e.g. docs/api-contracts
infra/{slug}                  # Infrastructure changes. e.g. infra/railway-deploy
refactor/{slug}               # Code restructuring with no behavior change.
```

### Rules
- `main` is always deployable. Never commit directly to main (use PRs).
- Feature branches are short-lived — merge within days, not weeks.
- Delete branches after merge.
- Rebase feature branches on main before PR to keep history linear.

### When working solo (current phase)
During early development with a single contributor, direct commits to main are acceptable for rapid iteration. Switch to branch+PR workflow when:
- A second contributor joins, OR
- CI/CD pipeline is established, OR
- Phase 2 (AGE deployment) is complete.

## Commit Message Format

Conventional Commits format, enforced by convention (linter TBD):

```
type(scope): description

[optional body]

[optional footer: Ref: D25, MER-09]
```

### Types
| Type | Use when |
|------|----------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `schema` | Database schema change (migration) |
| `infra` | Infrastructure, Docker, Railway, Zuplo config |
| `refactor` | Code change with no behavior change |
| `test` | Adding or updating tests |
| `chore` | Maintenance, dependency updates, tooling |
| `style` | Formatting, lint fixes (no logic change) |

### Scopes
| Scope | Covers |
|-------|--------|
| `db` | PostgreSQL tables, migrations, AGE schema |
| `api` | API service endpoints, middleware, routes |
| `graph` | AGE/Cypher queries, graph operations |
| `extraction` | Entity extraction prompt, pipeline, validation |
| `harness` | Budget, domain, scope, action, time, escalation constraints |
| `frontend` | Next.js app, interface components, styles |
| `zuplo` | Zuplo gateway config, MCP handler, caching policies |
| `agent` | Agent definitions, orchestration, worker logic |
| `scanner` | Source scanning adapters (YouTube, RSS, Reddit, etc.) |
| `docs` | Documentation files |
| `deps` | Dependency updates |

### Examples
```
feat(db): add staged_extractions table with batch_id support

Implements SAD Section 7.1.4. Includes status enum, corrections_applied
jsonb column, and GIN index on extracted_json for entity queries.

Ref: D24, MER-11

---

fix(extraction): handle missing display name in email-only contacts

Applies D18 name parsing heuristic: parse firstname.lastname@domain
as "Firstname Lastname" with needs_review flag.

Ref: D18, MER-08

---

infra(db): write Dockerfile extending apache/age with Railway config

Custom image from apache/age official. Includes SSL, shared_preload_libraries,
and connection initialization script for LOAD 'age'.

Ref: D05, MER-01

---

docs: add API_CONTRACTS.md for lens endpoints

Defines request/response schemas for graph traversal, full-text search,
and compiled views lenses. Aligned to SAD Section 8.
```

### Commit message rules
- Subject line: max 72 characters. Imperative mood ("add" not "added").
- Body: wrap at 80 characters. Explain *what* and *why*, not *how*.
- Footer: reference SAD decisions (D##) and issues (MER-##) when the commit addresses them.
- One logical change per commit. Don't bundle unrelated changes.

## File Headers — Pre-Commit Enforcement

Every source file must have a copyright header as its first line(s). The pre-commit hook at `.meridian/hooks/check-headers.sh` validates this on every commit.

| File type | Header |
|-----------|--------|
| .js, .ts, .jsx, .tsx, .mjs | `// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.` |
| .sh | `# Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.` |
| .py | `# Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.` |
| .sql | `-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.` |
| .md (schema/prompt docs) | `<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->` |
| .css | `/* Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. */` |

Templates are stored in `.meridian/header-{lang}.txt`.

If the hook rejects your commit, add the appropriate header and re-stage.

### Hook installation

Git hooks live in `.meridian/hooks/` and are activated via:

```bash
git config core.hooksPath .meridian/hooks
```

Do not use `.git/hooks/` symlinks — NTFS-mounted paths from WSL do not
reliably support symlinks (`ln` fails with "Operation not permitted"). The
`core.hooksPath` approach works across all environments.

This setting is **per-clone** — each fresh clone must run the config
command once.

Current hooks:
- `check-headers.sh` — pre-commit, verifies copyright headers on staged
  source files. WARN mode by default; set `MERIDIAN_ENFORCE_HEADERS=1`
  to block commits missing headers.

## .gitignore — What Never Gets Committed

The `.gitignore` excludes:
- **Personal data:** `data/`, `emails/`, `corpus/`, `*.mbox`, `*.eml`, `*.pst`
- **Environment secrets:** `.env`, `.env.local`, `.env.*.local`
- **Build artifacts:** `dist/`, `build/`, `.next/`, `out/`, `node_modules/`
- **OS files:** `.DS_Store`, `Thumbs.db`
- **IDE config:** `.vscode/`, `.idea/`
- **GPG keys:** `*.gpg`, `*.asc`

**Never add to .gitignore bypass:** email archives, personal corpus files, API keys, database credentials, or any file containing PII. If you're unsure, don't commit it.

## Insight Ledger Convention

Insight ledgers live in `.meridian/insights/` and capture observations, findings,
and routing actions during Claude Code sessions. See CLAUDE.md Insight Protocol
for the full taxonomy and routing discipline.

**Insight ledger filename convention (from 2026-04-16 forward):**

`YYYY-MM-DD_S##-theme.md` where:
- `YYYY-MM-DD` is the date the ledger is opened.
- `S##` is the two-digit session number (project session, not Claude Code execution number).
- `theme` is a short kebab-case label (1–4 words) describing the sprint or task.

Example: `2026-04-16_S12-sprint-08.5-track-1.md`.

Rationale (MER-54): prior convention `YYYY-MM-DD_theme.md` sorted by date only. The `S##`
segment preserves chronological sort while surfacing session membership in directory listings.
Existing ledgers (pre-2026-04-16) are not retroactively renamed — forward-only scope.

## Tagging and Releases

Version tags follow semantic versioning and are GPG-signed:

```bash
git tag -s v0.1.0 -m "Phase 0: Persistence layer and MCP exposure"
git push origin v0.1.0
```

### Version scheme
| Version | Meaning |
|---------|---------|
| v0.x.y | Pre-release. Active development. Breaking changes expected. |
| v1.0.0 | First stable release. All six layers operational. |

### Phase-to-version mapping (planned)
| Phase | Target tag | Milestone |
|-------|-----------|-----------|
| 0 | v0.1.0 | PostgreSQL + API + Zuplo MCP live |
| 1 | v0.2.0 | Tech stack monitoring agent |
| 2 | v0.3.0 | AGE graph with project knowledge |
| 3 | v0.5.0 | Email ingestion + triage operational |
| 4 | v0.7.0 | Intelligence agent fleet + briefings |
| 5 | v1.0.0 | Self-maintenance active, all layers running |

## GitHub Repository Settings

These are configured in the GitHub web UI, not via CLI:

1. **Vigilant mode:** Settings → SSH and GPG keys → "Flag unsigned commits as unverified" = ON
2. **Branch protection on main:**
   - Require signed commits = ON
   - Require pull request before merging = ON (when multi-contributor)
   - Require status checks = ON (when CI is established)
3. **Topics:** `knowledge-graph`, `agentic-os`, `personal-ai`, `postgresql`, `apache-age`, `graph-database`
4. **Description:** "Personal agentic operating system — one store, many lenses, your context."

## Sensitive Data Protocol

Meridian processes deeply personal data across four life domains. The repository must never contain any of it.

### What goes in the database (Railway), never in the repo:
- Email content, headers, metadata
- Person names, email addresses, phone numbers
- Graph entities with personal context
- Source scan results and intelligence briefings
- Model preferences and cost data

### What goes in the repo:
- Schema definitions (table DDL, graph schema)
- Extraction prompts (the template, not extracted data)
- Application code, configuration templates
- Documentation and architecture specs
- Migration files (DDL only, no data)
- Test fixtures with synthetic/fabricated data only

### If you accidentally commit sensitive data:
1. Do NOT just delete the file in a new commit — it's still in Git history.
2. Use `git filter-branch` or BFG Repo-Cleaner to purge from all history.
3. Force-push to remote.
4. Rotate any exposed credentials immediately.
5. Document the incident.

## Sibling Repository Configuration

When configuring GPG signing in a sibling repository (e.g., `meridian-gateway`,
future `meridian-mcp`), the `gpg.program` path must use the WSL path format, not
the Windows path format. These repos have no `.meridian/` directory, so the
relative path used in the primary Meridian repo does not resolve.

**Correct (WSL path — use when running git from WSL):**
```bash
git config --local gpg.program /mnt/d/Meridian/.meridian/gpg-wsl-bridge.sh
```

**Incorrect (Windows path — WSL cannot resolve this format):**
```bash
git config --local gpg.program D:/Meridian/.meridian/gpg-wsl-bridge.sh
```

This applies to any git operation run from WSL. The bridge script is located in
the primary Meridian repo and shared across all project repos.

For git operations run from Git Bash (not WSL), use the Git Bash-style absolute
path `/d/Meridian/.meridian/gpg-wsl-bridge.sh` instead (see "Claude Code GPG
bridge" section above for the per-clone setup).

Always set the signing key and enforce signed commits in each sibling repo:
```bash
git config --local user.signingkey 799AD4A789D27DA8
git config --local commit.gpgsign true
```

### SSH Remote for All Project Repos

All project repositories must use SSH remotes, not HTTPS. D29 applies to all
Meridian project repos, not only the primary repo.

**Set SSH remote:**
```bash
git remote set-url origin git@github.com:ckj9779/<repo-name>.git
```

**Verify:**
```bash
git remote -v
```

HTTPS remotes will fail for signed pushes from WSL because the GPG agent and SSH
agent are WSL-native. Both root causes were discovered during Sprint 10 Phase 4
(Session 24) when configuring `meridian-gateway`. GPG signing and SSH push both
require WSL-native tooling; Git Bash has neither GitHub SSH key nor the keyring
for GPG.

---

## CI/CD Pipeline (Planned)

Not yet established. When implemented, the pipeline should:

- Run on every push and PR to main.
- Verify: GPG signature present, copyright headers on all source files, TypeScript strict mode passes, Python type checks pass, all tests pass, no secrets in committed files (use a scanner like gitleaks).
- Block merge if any check fails.
- Deploy to Railway (API service) and Vercel (frontend) on merge to main.
