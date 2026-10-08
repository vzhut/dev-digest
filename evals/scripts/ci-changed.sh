#!/usr/bin/env bash
# Prints the repo-relative files changed by this CI event (one per line).
#   pull_request     → diff against the PR base
#   push             → diff against the previous tip (falls back to HEAD~1)
#   workflow_dispatch→ every harness artifact, i.e. "run everything that has evals"
set -euo pipefail

case "${GITHUB_EVENT_NAME:-}" in
  pull_request)
    git diff --name-only "origin/${GITHUB_BASE_REF}...HEAD" ;;
  workflow_dispatch)
    git ls-files .claude/skills .claude/agents CLAUDE.md ;;
  *)
    before="${EVENT_BEFORE:-}"
    if [[ -z "$before" || "$before" =~ ^0+$ ]] || ! git cat-file -e "$before" 2>/dev/null; then
      before="HEAD~1"
    fi
    git diff --name-only "$before" HEAD ;;
esac
