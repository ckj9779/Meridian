#!/usr/bin/env bash
# Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.
# D73 — Pre-commit secrets gate. Rejects any staged file under secrets/.
# Exit non-zero to block commit.
# MER-63.

set -euo pipefail

staged=$(git diff --cached --name-only --diff-filter=AM | grep -E '^secrets/' || true)

if [ -n "$staged" ]; then
  echo "BLOCKED: attempt to commit file(s) under secrets/ (D73 violation):"
  echo "$staged" | sed 's/^/  - /'
  echo ""
  echo "The secrets/ directory is gitignored and must stay that way. See"
  echo "docs/SECRETS_POLICY.md for the policy and secrets/SECRETS.md for"
  echo "the pointer registry."
  echo ""
  echo "If you believe this is a false positive, verify the files are not"
  echo "secrets, move them out of secrets/, and retry."
  exit 1
fi

exit 0
