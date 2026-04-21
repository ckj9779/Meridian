#!/usr/bin/env bash
# Bridge: Git Bash → WSL gpg for commit signing and verification.
# Translates Git Bash / Windows temp paths to WSL-accessible paths.
# Required because GPG key 799AD4A789D27DA8 lives in WSL's keyring
# while Claude Code runs in Git Bash on Windows.
# Session 12 insight: INS-001 (environment mismatch).

args=()
for arg in "$@"; do
  # Detect file-like arguments that need path translation
  if [[ -f "$arg" ]]; then
    winpath=$(cygpath -w "$arg" 2>/dev/null)
    if [[ -n "$winpath" ]]; then
      wslpath=$(wsl.exe wslpath -u "$winpath" 2>/dev/null | tr -d '\r')
      args+=("$wslpath")
    else
      args+=("$arg")
    fi
  else
    args+=("$arg")
  fi
done
# --pinentry-mode loopback allows signing without a TTY when
# gpg-agent.conf has allow-loopback-pinentry. The agent cache
# must be primed from an interactive WSL terminal first.
wsl.exe gpg --pinentry-mode loopback "${args[@]}"
