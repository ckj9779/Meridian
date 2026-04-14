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

**WSL (Ubuntu on StarshipOne) is canonical.**

The GPG secret key (`rsa4096/799AD4A789D27DA8`, fingerprint
`5B68E52AEEA21C15A7A5C868799AD4A789D27DA8`, expires 2028-04-13) lives at
`/home/cjohnson/.gnupg`. Git Bash on Windows has an isolated GPG keyring
and **must not** be used for signed commits — the key does not exist there.

All `git commit`, `git tag`, and `git push` operations that require signing
must run from a WSL terminal.

### GPG agent caching

To avoid repeated passphrase prompts during development sessions, configure
`~/.gnupg/gpg-agent.conf`:

```
default-cache-ttl 7200
max-cache-ttl 14400
```

Reload after changes: `gpgconf --kill gpg-agent`

**Agent warmup:** Before a batch of commits (especially when commits will be
issued by tools or scripts that lack a TTY), run once in an interactive
terminal:

```bash
echo "test" | gpg --clearsign > /dev/null
```

This primes the passphrase cache for the session. Without it, non-TTY
commit attempts fail with `Inappropriate ioctl for device`.

## Pushing — SSH from WSL (D29)

SSH from WSL is the canonical push strategy.

The signing key lives in WSL. Pushing from WSL via SSH keeps the entire
sign → commit → push chain in a single environment with no Windows/WSL
credential-helper interop.

### Setup (one-time)

```bash
# Generate SSH key if not present
ssh-keygen -t ed25519 -C "mobile@charleskjohnson.com"

# Start agent and add key
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Copy public key to clipboard (install xclip if needed)
cat ~/.ssh/id_ed25519.pub
```

Add the public key to GitHub at **Settings → SSH and GPG keys → New SSH key**.

Switch the remote to SSH:

```bash
git remote set-url origin git@github.com:ckj9779/Meridian.git
```

### Verify

```bash
ssh -T git@github.com
# → "Hi ckj9779! You've successfully authenticated..."
```

All future `git push` and `git pull` operations should run from WSL.

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

## CI/CD Pipeline (Planned)

Not yet established. When implemented, the pipeline should:

- Run on every push and PR to main.
- Verify: GPG signature present, copyright headers on all source files, TypeScript strict mode passes, Python type checks pass, all tests pass, no secrets in committed files (use a scanner like gitleaks).
- Block merge if any check fails.
- Deploy to Railway (API service) and Vercel (frontend) on merge to main.
