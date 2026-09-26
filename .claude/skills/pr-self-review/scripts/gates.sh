#!/usr/bin/env bash
# Deterministic gates: everything that can be decided without a model.
#
# These run first because they are the cheap, certain part of the review. A model is good at
# "is this component doing too much"; it is wasteful and unreliable at "does this i18n key
# exist" or "did the lockfile change for a reason". Rules live here so the verdict on them is
# reproducible and reviewable as code.
#
# Usage: gates.sh [--full] [--skip-tests]
#   --full        also run integration (.it, needs Docker) and e2e
#   --skip-tests  skip R1/R2 (for a fast re-check while iterating on other findings)
#
# Output, one finding per line:  <SEVERITY>\t<rule>\t<location>\t<message>
# Exit: 0 = no CRITICAL, 1 = at least one CRITICAL, 64+ = the gate itself failed to run.
set -uo pipefail
# Resolve this script's own directory BEFORE changing directory: `${BASH_SOURCE[0]}` may be a
# relative path, and `cd`-ing to the repo root first makes it unresolvable when the script was
# invoked from a subdirectory. Getting this wrong made gates.sh source nothing and still exit 0
# — a gate that silently passes is the worst failure this skill has.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(git rev-parse --show-toplevel)"

FULL=0; SKIP_TESTS=0
for a in "$@"; do
  case "$a" in
    --full) FULL=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    *) echo "gates.sh: unknown argument $a" >&2; exit 64 ;;
  esac
done

# shellcheck source=patterns.sh
. "$HERE/patterns.sh" || { echo "gates.sh: cannot source $HERE/patterns.sh" >&2; exit 67; }
[ -n "${P_ONION_DB:-}" ] || { echo "gates.sh: patterns.sh loaded but empty" >&2; exit 67; }

WORK=".git/pr-self-review/work"
FILES="$WORK/files.txt"; ADDED="$WORK/added-lines.txt"
[ -f "$FILES" ] || { echo "gates.sh: run collect.sh first" >&2; exit 66; }
# The base collect.sh actually used. Recomputing it here is how the two halves used to drift.
BASE_SHA="$(cat "$WORK/base.txt" 2>/dev/null || git rev-parse HEAD)"

# Findings also go to a file: most rules below run inside pipelines (subshells), so a
# shell variable counter would be lost. The file is the single source for the verdict.
FINDINGS="${FINDINGS:-$WORK/gate-findings.tsv}"
: > "$FINDINGS"
say() { # severity rule location message
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" | tee -a "$FINDINGS"
}
changed() { grep -qE "$1" "$FILES"; }
added()   { [ -f "$ADDED" ] && grep -qE "$1" "$ADDED"; }
added_in(){ [ -f "$ADDED" ] && grep -E "^$1" "$ADDED" | grep -E "$2"; }

# ---- R1/R2 typecheck + unit tests of touched packages -------------------------------
# Only touched packages: this runs on every push, and a gate people wait on is a gate they
# learn to bypass.
run_pkg() { # dir label typecheck_cmd test_cmd
  local dir="$1" label="$2" tc="$3" ts="$4" out
  if ! out="$(cd "$dir" && eval "$tc" 2>&1)"; then
    say CRITICAL R1-typecheck "$label" "typecheck fails: $(echo "$out" | grep -E 'error' | head -3 | tr '\n' ' ')"
  fi
  [ "$SKIP_TESTS" = "1" ] && return 0
  if ! out="$(cd "$dir" && eval "$ts" 2>&1)"; then
    say CRITICAL R2-tests "$label" "unit tests fail: $(echo "$out" | grep -E 'FAIL|✗|failed' | head -3 | tr '\n' ' ')"
  fi
}
if [ "$SKIP_TESTS" = "0" ] || true; then
  changed '^server/'        && run_pkg server        server        "pnpm typecheck" "pnpm exec vitest run --exclude '**/*.it.test.ts'"
  changed '^client/'        && run_pkg client        client        "pnpm typecheck" "pnpm test"
  changed '^reviewer-core/' && run_pkg reviewer-core reviewer-core "npm run build"  "npm test"
fi
if [ "$FULL" = "1" ]; then
  changed '^server/' && { (cd server && pnpm exec vitest run .it.test >/dev/null 2>&1) || say CRITICAL R2-it server "integration tests fail (or Docker is not running)"; }
  ./scripts/e2e.sh >/dev/null 2>&1 || say HIGH R2-e2e e2e "e2e flows fail"
fi

# ---- R3 migrations are generated, never hand-written --------------------------------
if changed '^server/src/db/migrations/'; then
  edited="$(git diff --name-only --diff-filter=MRD "$BASE_SHA" -- server/src/db/migrations | grep -E '\.sql$' || true)"
  [ -n "$edited" ] && say CRITICAL R3-migration "$edited" "an existing migration was edited, renamed or deleted; migrations are append-only — change server/src/db/schema/* and run pnpm db:generate"
  if ! changed '^server/src/db/schema/'; then
    say CRITICAL R3-migration server/src/db/migrations "migration changed with no schema change — it was almost certainly hand-written"
  fi
fi

# ---- R4 lockfiles move only with their package.json ---------------------------------
for lock in server/pnpm-lock.yaml client/pnpm-lock.yaml reviewer-core/package-lock.json e2e/package-lock.json; do
  pkg="$(dirname "$lock")/package.json"
  if changed "^$lock$" && ! changed "^$pkg$"; then
    say CRITICAL R4-lockfile "$lock" "lockfile changed with no change to $pkg — revert it or make the dependency change explicit"
  fi
done

# ---- R5 the two @devdigest/shared copies stay in step --------------------------------
while IFS= read -r f; do
  case "$f" in
    server/src/vendor/shared/*) twin="client/src/vendor/shared/${f#server/src/vendor/shared/}" ;;
    client/src/vendor/shared/*) twin="server/src/vendor/shared/${f#client/src/vendor/shared/}" ;;
    *) continue ;;
  esac
  if [ -f "$twin" ] && ! changed "^$twin$"; then
    sev=HIGH
    git diff "$BASE_SHA" -- "$f" | grep -qE '^-[^-].*:' && sev=CRITICAL
    say "$sev" R5-contract "$f" "changed without its twin $twin — a contract lives in both copies (AGENTS.md); a removed or renamed field breaks the other package at runtime"
  fi
done < "$FILES"

# ---- R6 reviewer prompts exist twice on purpose --------------------------------------
if changed 'system_prompt|db/seed' && ! changed '^docs/agent-prompts/'; then
  say HIGH R6-prompt server/src/db/seed.ts "agent prompt changed in the DB seed but not in docs/agent-prompts/*.md — AGENTS.md keeps both in step"
fi
if changed '^docs/agent-prompts/' && ! changed 'db/seed'; then
  say HIGH R6-prompt docs/agent-prompts "prompt doc changed but the DB seed didn't — the DB is the runtime source of truth"
fi

# ---- R7 onion dependency rule, on ADDED lines only -----------------------------------
# Repository files are exempt — that is where Drizzle belongs. The exemption has to be by
# PATH: filtering the whole `path:line:content` string on the word dropped any route-handler
# line that merely mentioned "repository", which is the sort of hole nobody notices.
added_in 'server/src/modules/[^:]*\.ts' "$P_ONION_DB" | grep -vE '^server/src/modules/[^:]*/repository(/[^:]*)?\.ts:' | while IFS= read -r l; do
  say HIGH R7-onion "${l%%:*}" "Drizzle or db/schema in a non-repository file: ${l#*:}"
done
added_in 'server/src/modules/' "$(onion_cross_module_re)" | while IFS= read -r l; do
  say HIGH R7-onion "${l%%:*}" "cross-module import: ${l#*:}"
done
added_in 'server/src/adapters/' "$P_ONION_ADAPTER" | while IFS= read -r l; do
  say CRITICAL R7-onion "${l%%:*}" "an adapter importing modules/ or db/ inverts the dependency rule: ${l#*:}"
done
added_in '(server/src/(modules|platform)|reviewer-core/src)/' "$P_ONION_ENV" | grep -v 'platform/config' | while IFS= read -r l; do
  say CRITICAL R7-onion "${l%%:*}" "process.env outside platform/config — config is read once at the edge: ${l#*:}"
done
added_in 'reviewer-core/src/' "$P_CORE_IMPURE" | while IFS= read -r l; do
  say CRITICAL R7-core "${l%%:*}" "reviewer-core is the pure core: no DB, FS or GitHub. Inject a port instead: ${l#*:}"
done

# ---- R8 secrets ----------------------------------------------------------------------
added "$P_SECRET_PEM" && say CRITICAL R8-secret diff "a private key was added"
added_in '' "$P_SECRET_KEY" | while IFS= read -r l; do
  say CRITICAL R8-secret "${l%%:*}" "looks like a live credential: ${l#*:}"
done
grep -E "$P_SECRET_ENVFILE" "$FILES" | grep -vE "$P_SECRET_ENVFILE_SAFE" | grep -q . \
  && say CRITICAL R8-secret .env "a .env file is part of this change"

# ---- R9 no linter/formatter unasked ---------------------------------------------------
changed "$P_TOOLING" && say HIGH R9-tooling "config" "a linter/formatter config appeared — AGENTS.md says not to add one unasked"

# ---- R10 a server module must be registered -------------------------------------------
for r in $(grep -E '^server/src/modules/[^/]+/routes\.ts$' "$FILES" || true); do
  m="$(echo "$r" | cut -d/ -f4)"
  grep -q "'\./$m/routes.js'" server/src/modules/index.ts || \
    say CRITICAL R10-registry "$r" "module '$m' is not registered in server/src/modules/index.ts — the routes never load at runtime"
done

# ---- R11 i18n keys resolve --------------------------------------------------------------
# A missing key renders the raw key string in the UI, and no test or typecheck catches it.
#
# Resolving a key is not a grep: next-intl keys are relative to the enclosing
# `useTranslations("<namespace>")`, so `t("finding.accept")` in a component scoped to
# "prReview" means prReview.json -> finding -> accept. Treating the first segment as the
# namespace would report a CRITICAL for every correct key in the repo. The first version of
# this gate only matched single-quoted, argument-less `t('a.b')`, which is 10 of the 312 call
# sites in client/src — it passed everything because it saw almost nothing.
python3 - "$ADDED" <<'PY' | while IFS=$'\t' read -r sev rule loc msg; do say "$sev" "$rule" "$loc" "$msg"; done
import json, os, re, sys

added = sys.argv[1]
if not os.path.exists(added):
    sys.exit(0)

CALL = re.compile(r"""\bt\(\s*["']([A-Za-z0-9_][A-Za-z0-9_.]*)["']\s*[,)]""")
SCOPE = re.compile(r"""\bt\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*["']([A-Za-z0-9_.]+)["']""")

scopes_cache = {}
def scopes(path):
    """[(line_no, namespace)] for every translation scope opened in the file."""
    if path not in scopes_cache:
        out = []
        try:
            with open(path, encoding="utf-8") as fh:
                for n, line in enumerate(fh, 1):
                    m = SCOPE.search(line)
                    if m:
                        out.append((n, m.group(1)))
        except OSError:
            pass
        scopes_cache[path] = out
    return scopes_cache[path]

def resolve(path, line_no, key):
    """Full dotted key: the nearest scope at or above this line, plus the call's own key."""
    ns = ""
    for n, name in scopes(path):
        if n <= line_no:
            ns = name
        else:
            break
    return f"{ns}.{key}" if ns else key

def lookup(full):
    head, _, rest = full.partition(".")
    msg_file = os.path.join("client", "messages", "en", head + ".json")
    if not os.path.exists(msg_file):
        return f"namespace '{head}' has no {msg_file} (key {full})"
    try:
        with open(msg_file, encoding="utf-8") as fh:
            node = json.load(fh)
    except (OSError, ValueError) as err:
        return f"{msg_file} is not readable JSON: {err}"
    for part in [p for p in rest.split(".") if p]:
        if not isinstance(node, dict) or part not in node:
            return f"i18n key '{full}' is missing from {msg_file} — the raw key renders in the UI"
        node = node[part]
    return None

seen = set()
with open(added, encoding="utf-8") as fh:
    for raw in fh:
        path, _, tail = raw.rstrip("\n").partition(":")
        if not path.startswith("client/") or not path.endswith((".ts", ".tsx")):
            continue
        line_no, _, content = tail.partition(":")
        if not line_no.isdigit():
            continue
        for key in CALL.findall(content):
            full = resolve(path, int(line_no), key)
            if full in seen:
                continue
            seen.add(full)
            problem = lookup(full)
            if problem:
                print(f"CRITICAL\tR11-i18n\t{path}:{line_no}\t{problem}")
PY

# ---- R12 new logic without a test --------------------------------------------------------
# Both architecture skills ask for pure logic to be unit-tested; this only nudges when a new
# exported function appears in a file whose test file wasn't touched at all.
for f in $(grep -E '^(client/src/lib/|server/src/modules/.*/(helpers|findings)\.ts|reviewer-core/src/)' "$FILES" | grep -E '\.ts$' | grep -v '\.test\.' || true); do
  if added_in "$f" 'export (function|const) ' >/dev/null 2>&1; then
    base="${f%.ts}"
    changed "^${base}\.test\.ts$" || grep -qE "$(basename "$base")" <(grep '\.test\.ts' "$FILES" || true) || \
      say HIGH R12-tests "$f" "new exported logic with no test touched in this change"
  fi
done

# ---- R13 spec drift ----------------------------------------------------------------------
code_lines=$(grep -cE '^(client|server|reviewer-core)/src/' "$ADDED" 2>/dev/null || echo 0)
if [ "${code_lines:-0}" -gt 200 ] && ! changed '^(specs/|.*/specs/)'; then
  say HIGH R13-spec specs "$code_lines added lines of product code and no spec change — the 5-phase workflow in AGENTS.md expects a behaviour spec plus a Delivery log"
fi

grep -q '^CRITICAL' "$FINDINGS" && exit 1
exit 0
