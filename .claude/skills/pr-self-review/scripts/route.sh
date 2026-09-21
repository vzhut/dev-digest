#!/usr/bin/env bash
# Map each changed file to the review group and the skills that apply to it.
#
# Routing is deterministic on purpose: a model re-deciding "which skill fits this file"
# on every run is the part that silently drifts. Reasons per row: ../references/routing.md.
#
# Usage: route.sh [files.txt]     (default: .git/pr-self-review/work/files.txt)
# Output, one line per file:  <group>\t<path>\t<skill,skill,...>
#   group = ui | backend | rules-only   (`security` is a skill, not a group; it rides along
#   on the file's own line so a reviewer sees the file once, with every rubric that applies)
#
# Written for bash 3.2 (macOS default), so no `;;&` fall-through and no globstar.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

LIST="${1:-.git/pr-self-review/work/files.txt}"
[ -f "$LIST" ] || { echo "route.sh: no file list at $LIST (run collect.sh first)" >&2; exit 66; }

like() { case "$1" in $2) return 0 ;; *) return 1 ;; esac; }
has()  { [ -f "$1" ] && grep -qE "$2" "$1"; }

while IFS= read -r f; do
  [ -n "$f" ] || continue
  skills=""; group="rules-only"
  add() { case ",$skills," in *",$1,"*) ;; *) skills="${skills:+$skills,}$1" ;; esac; }

  # ---- client ----------------------------------------------------------------
  if like "$f" 'client/*'; then
    group="ui"
    like "$f" '*.tsx' && { add frontend-architecture; add react-best-practices; }
    like "$f" '*.ts'  && { add frontend-architecture; add typescript-expert; }
    like "$f" 'client/src/app/*' && add next-best-practices
    { like "$f" '*.test.tsx' || like "$f" '*.test.ts'; } && add react-testing-library
    like "$f" 'client/messages/*' && { skills=""; add frontend-architecture; }
    like "$f" '*.tsx' && add typescript-expert
  fi

  # ---- server / reviewer-core -------------------------------------------------
  if like "$f" 'server/src/*' || like "$f" 'reviewer-core/src/*'; then
    group="backend"
    add onion-architecture; add typescript-expert
    { like "$f" '*/routes.ts' || like "$f" 'server/src/platform/*'; } && add fastify-best-practices
    { like "$f" '*repository*.ts' || like "$f" '*.repo.ts' || like "$f" 'server/src/db/*'; } && add drizzle-orm-patterns
    like "$f" 'server/src/db/*' && add postgresql-table-design
  fi

  # ---- cross-cutting ----------------------------------------------------------
  if like "$f" '*.ts' || like "$f" '*.tsx'; then
    { has "$f" "from ['\"]zod['\"]" || like "$f" '*/vendor/shared/*'; } && add zod
    # A file earns a security read when it can carry an attack path: it takes outside
    # input, runs a process, touches secrets, or injects HTML.
    if like "$f" '*/routes.ts' || like "$f" 'server/src/adapters/*' || like "$f" 'server/src/platform/*' \
       || has "$f" "dangerouslySetInnerHTML|child_process|[^a-z]exec\(|spawn\(|simple-git|process\.env|sql\.raw"; then
      add security
      [ "$group" = "rules-only" ] && group="ui"
    fi
  fi

  printf '%s\t%s\t%s\n' "$group" "$f" "${skills:--}"
done < "$LIST"
