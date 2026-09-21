#!/usr/bin/env bash
# Collect every open change and fingerprint it.
#
# Why a fingerprint: the verdict is only meaningful for the exact bytes that were reviewed.
# Any edit after a PASS changes the fingerprint, so the gate re-opens by itself and nobody
# has to remember to invalidate anything.
#
# Usage:
#   collect.sh [--base <ref>]        full collection; writes the work dir, prints a summary
#   collect.sh --fingerprint-only    prints just the fingerprint (used by the hooks; fast, no writes)
#
# Outputs (in .git/pr-self-review/work/):
#   files.txt        one changed path per line (tracked + untracked, filtered)
#   diff.patch       the full diff of tracked changes vs the base
#   added-lines.txt  "path:line:content" for every ADDED line — the only lines a review may flag
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

BASE_REF=""
FP_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE_REF="$2"; shift 2 ;;
    --fingerprint-only) FP_ONLY=1; shift ;;
    *) echo "collect.sh: unknown argument $1" >&2; exit 64 ;;
  esac
done

sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 | cut -d' ' -f1; else sha256sum | cut -d' ' -f1; fi; }

# The base is the merge base with main: everything this branch adds is "the change".
if [ -z "$BASE_REF" ]; then
  if git rev-parse --verify -q origin/main >/dev/null; then BASE_REF=origin/main; else BASE_REF=main; fi
fi
BASE_SHA="$(git merge-base HEAD "$BASE_REF" 2>/dev/null || git rev-parse HEAD)"
HEAD_SHA="$(git rev-parse HEAD)"

# Paths that are runtime artefacts or binaries: never worth reviewing, and they make diffs huge.
EXCLUDE_RE='^(server/clones/|e2e/test-results/|node_modules/|.*\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|woff2?)$)'

tracked_files() { git diff --name-only --diff-filter=ACMR "$BASE_SHA" -- ; git diff --name-only --diff-filter=ACMR HEAD -- ; }
untracked_files() { git ls-files --others --exclude-standard; }

all_files() { { tracked_files; untracked_files; } | sort -u | grep -Ev "$EXCLUDE_RE" || true; }

# Untracked files are invisible to `git diff`. Hashing their contents keeps a brand-new
# folder (a new skill, a new module) from sneaking past a PASS that never saw it.
#
# `|| true` on the filter matters: with `pipefail`, a grep that matches nothing exits 1,
# so a change set with no untracked files at all (the common case — a branch of tracked
# edits) would abort the script before it printed or wrote anything, and the gate could
# then never be satisfied.
untracked_reviewable() { untracked_files | { grep -Ev "$EXCLUDE_RE" || true; }; }

fingerprint() {
  { echo "base:$BASE_SHA"; echo "head:$HEAD_SHA"
    git diff HEAD --
    untracked_reviewable | while IFS= read -r f; do
      [ -f "$f" ] && { echo "untracked:$f"; cat "$f"; }
    done
  } | sha256
}

FP="$(fingerprint)"
if [ "$FP_ONLY" = "1" ]; then echo "$FP"; exit 0; fi

WORK=".git/pr-self-review/work"
mkdir -p "$WORK"
# gates.sh needs the SAME base this run resolved. It used to recompute its own with
# `git merge-base HEAD main`, while this script prefers `origin/main` — so on any clone whose
# local `main` lags the remote, the two halves disagreed about what "the change" is and R3/R5
# reported on commits that were never part of the reviewed diff.
echo "$BASE_SHA" > "$WORK/base.txt"
all_files > "$WORK/files.txt"
{ git diff "$BASE_SHA" --; untracked_reviewable | while IFS= read -r f; do
    [ -f "$f" ] && git diff --no-index -- /dev/null "$f" || true
  done; } > "$WORK/diff.patch" 2>/dev/null || true

# Added lines only. A finding must point at one of these: a change is not responsible for
# code it didn't touch, and the repo's known debt (onion D1-D9, the client's "Known debt")
# would otherwise block every branch that goes near it.
awk '
  /^\+\+\+ b\// { path = substr($0, 7); next }
  /^@@/ { match($0, /\+[0-9]+/); n = substr($0, RSTART+1, RLENGTH-1) + 0; next }
  /^\+/ && !/^\+\+\+/ { print path ":" n ":" substr($0, 2); n++; next }
  /^[ ]/ { n++ }
' "$WORK/diff.patch" > "$WORK/added-lines.txt"

echo "base=$BASE_SHA"
echo "head=$HEAD_SHA"
echo "fingerprint=$FP"
echo "files=$(wc -l < "$WORK/files.txt" | tr -d ' ')"
echo "added_lines=$(wc -l < "$WORK/added-lines.txt" | tr -d ' ')"
echo "work=$WORK"
