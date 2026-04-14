#!/usr/bin/env bash
# Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

# Meridian pre-commit hook: check staged source files for copyright headers.
# Phase 0: WARN mode. Set MERIDIAN_ENFORCE_HEADERS=1 to block commits.
# Covers the hybrid union of docs/GITOPS.md:154-161 and the prompt's extension
# list: .ts .tsx .js .jsx .mjs .py .sql .md .sh .css.

ENFORCE="${MERIDIAN_ENFORCE_HEADERS:-0}"
MISSING=()

check_header() {
  local file="$1"
  if ! head -5 "$file" | grep -q "Copyright (c) 2026 ckj9779"; then
    MISSING+=("$file")
  fi
}

STAGED=$(git diff --cached --name-only --diff-filter=ACM)

for file in $STAGED; do
  case "$file" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.py|*.sql|*.md|*.sh|*.css)
      check_header "$file"
      ;;
  esac
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo "[Meridian] Missing copyright headers in ${#MISSING[@]} file(s):"
  for f in "${MISSING[@]}"; do
    echo "   - $f"
  done
  echo "   Templates: .meridian/header-{ts,py,sh,sql,md,css}.txt"
  echo ""
  if [ "$ENFORCE" = "1" ]; then
    echo "   Commit blocked. Add headers or set MERIDIAN_ENFORCE_HEADERS=0."
    exit 1
  else
    echo "   (Warning only -- enforcement begins Phase 1)"
  fi
fi

exit 0
