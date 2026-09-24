#!/usr/bin/env bash
# The gate itself: is there a PASS for exactly the change set that is about to be published?
#
# This script never reviews anything — it is the cheap half of the system, so it can sit in
# front of every `git push` without anyone noticing it. The expensive half (/pr-self-review)
# writes the marker; this one only reads it.
#
# Markers carry a tier, because one verdict for everything made the gate too slow to keep:
#   gates  the deterministic half only (~12s) — enough to open `git push`, since a branch push
#          is cheap and reversible and pushing early is behaviour worth keeping
#   full   gates plus the routed skill review — required for `gh pr create|merge|ready`, the
#          point at which the work is handed to someone else
# A `full` marker satisfies both. See SKILL.md -> Tiers.
#
# Usage:
#   check-marker.sh                 exit 0 if the change set has a PASS marker at `gates` or
#                                   better (this is what the git pre-push hook asks for)
#   check-marker.sh --require full  demand a full-review marker
#   check-marker.sh --hook          Claude Code PreToolUse mode: reads the tool call on stdin,
#                                   derives the required tier from the command, exits 2
#                                   (blocking, with an explanation) only for publishing commands
set -euo pipefail

# Resolve this script's own directory BEFORE changing directory: `${BASH_SOURCE[0]}` may be a
# relative path, and `cd`-ing to the repo root first makes it unresolvable when the script was
# invoked from a subdirectory. Getting this wrong made gates.sh source nothing and still exit 0
# — a gate that silently passes is the worst failure this skill has.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$REPO" ] || exit 0   # not a git repo: nothing to gate
cd "$REPO"
MARKER_DIR=".git/pr-self-review"

# Prints: <state> <fingerprint>. A marker with no "tier" predates the split and is read as
# `full` — it was written when one verdict meant the whole review.
verdict_for_current() { # required_tier
  local want="$1" fp marker tier
  fp="$(bash "$HERE/collect.sh" --fingerprint-only)"
  marker="$MARKER_DIR/$fp.json"
  [ -f "$marker" ] || { echo "MISSING $fp"; return; }
  grep -q '"verdict"[[:space:]]*:[[:space:]]*"PASS"' "$marker" || { echo "BLOCK $fp"; return; }
  tier=full
  grep -q '"tier"[[:space:]]*:[[:space:]]*"gates"' "$marker" && tier=gates
  if [ "$want" = "full" ] && [ "$tier" = "gates" ]; then echo "INSUFFICIENT $fp"; return; fi
  echo "PASS $fp"
}

explain() { # state
  case "$1" in
    MISSING) cat <<'MSG'
pr-self-review: these changes have not been reviewed yet.

Run /pr-self-review, fix anything CRITICAL, then retry this command.
(The review is bound to the exact diff, so a PASS from before your last edit does not count.)
MSG
;;
    BLOCK) cat <<'MSG'
pr-self-review: the last review of these exact changes ended in BLOCK.

Fix the CRITICAL findings and run /pr-self-review again. If a finding is wrong,
record why with:  /pr-self-review --accept <finding-id> "reason"
MSG
;;
    INSUFFICIENT) cat <<'MSG'
pr-self-review: these changes passed the deterministic gates, but opening or merging a PR
needs the full review.

Run /pr-self-review (no --gates) and fix anything CRITICAL. The gates are the fast check that
lets you push a branch; handing the work to someone else is the part worth the wait.
MSG
;;
  esac
}

REQUIRE=gates
[ "${1:-}" = "--require" ] && { REQUIRE="${2:?--require needs a tier}"; shift 2; }

if [ "${1:-}" = "--hook" ]; then
  # Only the commands that actually publish work. Everything else — including plain commits —
  # goes through untouched, because a gate that interrupts ordinary work gets switched off.
  #
  # Matching is on an *invocation*, not on the words appearing anywhere in the command: the
  # command has to start with `git push` / `gh pr create|merge|ready`, or have one right after
  # a shell separator. A plain substring match blocks writing a heredoc, a grep or a doc that
  # merely mentions `git push` — which happened the first time this hook ran.
  # The matcher prints the tier this particular command requires: `git push` -> gates,
  # `gh pr create|merge|ready` -> full.
  if ! REQUIRE="$(cat | python3 "$HERE/match-publish-command.py" 2>/dev/null)"; then
    exit 0
  fi

  read -r state _ <<EOF
$(verdict_for_current "$REQUIRE")
EOF
  [ "$state" = "PASS" ] && exit 0
  explain "$state" >&2
  exit 2   # exit code 2 blocks the tool call and shows stderr to Claude
fi

read -r state fp <<EOF
$(verdict_for_current "$REQUIRE")
EOF
if [ "$state" = "PASS" ]; then
  echo "pr-self-review: PASS for $fp (tier required: $REQUIRE)"
  exit 0
fi
explain "$state" >&2
exit 1
