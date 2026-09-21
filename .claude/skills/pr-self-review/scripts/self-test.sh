#!/usr/bin/env bash
# Self-test for the pattern-based gates. Run it from the repo root; it touches nothing.
#
# Two kinds of assertion, because the gates failed in two different ways:
#
#   reach  — how many lines of the REAL tree a pattern matches. R11 shipped seeing 10 of 312
#            `t(` call sites and passed every diff; nothing caught it, because the fixture
#            used to verify it was written in the same style as the pattern. A floor on reach
#            turns "this pattern has gone blind against the codebase" into a failing test.
#
#   table  — fixture lines the pattern must fire on, and lines it must stay silent on. R8
#            shipped matching `sk-[A-Za-z0-9]{20,}`, which no modern OpenAI or Anthropic key
#            matches, in a repo that integrates both. Formats belong in a table, not a guess.
#
# Adding a pattern to patterns.sh without adding rows here is the bug this file exists to stop.
set -uo pipefail
# Resolve this script's own directory BEFORE changing directory: `${BASH_SOURCE[0]}` may be a
# relative path, and `cd`-ing to the repo root first makes it unresolvable when the script was
# invoked from a subdirectory. Getting this wrong made gates.sh source nothing and still exit 0
# — a gate that silently passes is the worst failure this skill has.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(git rev-parse --show-toplevel)"
# shellcheck source=patterns.sh
. "$HERE/patterns.sh"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }

# reach <name> <min> <regex> <paths...>
reach() {
  local name="$1" min="$2" re="$3"; shift 3
  local n; n="$(grep -rhoE "$re" "$@" 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${n:-0}" -ge "$min" ]; then ok "reach $name: $n matches in the real tree (floor $min)"
  else bad "reach $name: only $n matches in the real tree, expected at least $min — the pattern has gone blind against this codebase's style"; fi
}

# fires <name> <regex> <sample>   /   silent <name> <regex> <sample>
fires()  { if printf '%s\n' "$3" | grep -qE "$2"; then ok "fires  $1"; else bad "fires  $1 — pattern did not match: $3"; fi; }
silent() { if printf '%s\n' "$3" | grep -qE "$2"; then bad "silent $1 — pattern matched but should not: $3"; else ok "silent $1"; fi; }

echo "== R7 onion =="
reach "R7 db-in-module"   20 "$P_ONION_DB"          server/src/modules
reach "R7 cross-module"    1 "$(onion_cross_module_re)" server/src
fires  "R7 drizzle single-quoted" "$P_ONION_DB" "import { eq } from 'drizzle-orm';"
fires  "R7 drizzle double-quoted" "$P_ONION_DB" 'import { eq } from "drizzle-orm";'
fires  "R7 container.db"          "$P_ONION_DB" "const rows = await app.container.db"
silent "R7 plain fastify import"  "$P_ONION_DB" "import type { FastifyInstance } from 'fastify';"
fires  "R7 cross-module ../"      "$(onion_cross_module_re)" "import { X } from '../repo-intel/constants.js';"
fires  "R7 cross-module ../../"   "$(onion_cross_module_re)" "import { X } from '../../modules/repo-intel/constants.js';"
silent "R7 same-module import"    "$(onion_cross_module_re)" "import { deriveReviewStatus } from './status.js';"
fires  "R7 adapter reaches in"    "$P_ONION_ADAPTER" "import { X } from '../../modules/repo-intel/constants.js';"
fires  "R7 core impurity"         "$P_CORE_IMPURE" "import fs from 'node:fs';"
silent "R7 core pure import"      "$P_CORE_IMPURE" "import { z } from 'zod';"

echo "== R8 secrets =="
# Every provider this repo actually talks to, plus the shapes a contributor is likely to paste.
#
# The bodies are assembled from variables on purpose. A literal `sk-ant-api03-<40 chars>` in
# this file is matched by the very pattern it tests, so R8 fired twelve CRITICALs on its own
# test table and blocked the push that introduced it. Splitting the prefix from the body means
# the SOURCE LINE carries no credential-shaped literal — `${B}` breaks the character class —
# while the string the shell hands to grep is complete, so the assertion still tests the real
# thing. An exemption for this path would have worked too, and would have been a place to hide
# a real key.
B='abcdefGHIJKL0123456789mnopQRSTUV0123456789wxyzABCD'
fires  "R8 openai sk-proj"      "$P_SECRET_KEY" "const k = \"sk-proj-$B\";"
fires  "R8 openai sk-svcacct"   "$P_SECRET_KEY" "const k = \"sk-svcacct-$B\";"
fires  "R8 openai legacy sk-"   "$P_SECRET_KEY" "const k = \"sk-$B\";"
fires  "R8 anthropic sk-ant"    "$P_SECRET_KEY" "const k = \"sk-ant-api03-$B\";"
fires  "R8 github classic ghp_" "$P_SECRET_KEY" "const k = \"ghp_$B\";"
fires  "R8 github fine-grained" "$P_SECRET_KEY" "const k = \"github_pat_11ABCDEFG0${B}_${B}\";"
fires  "R8 github oauth gho_"   "$P_SECRET_KEY" "const k = \"gho_$B\";"
fires  "R8 aws akia"            "$P_SECRET_KEY" "const k = \"A${_K:-K}IAIOSFODNN7EXAMPLE\";"
fires  "R8 aws asia"            "$P_SECRET_KEY" "const k = \"A${_S:-S}IAIOSFODNN7EXAMPLE\";"
N='123456789012-1234567890123'   # digits alone already satisfy the 20-char body, so they move out too
fires  "R8 slack xoxb"          "$P_SECRET_KEY" "const k = \"xoxb-$N-$B\";"
fires  "R8 google AIza"         "$P_SECRET_KEY" "const k = \"AIza$B\";"
silent "R8 env var reference"   "$P_SECRET_KEY" 'const key = process.env.OPENAI_API_KEY;'
silent "R8 placeholder"         "$P_SECRET_KEY" 'OPENAI_API_KEY=sk-your-key-here'
silent "R8 prose about keys"    "$P_SECRET_KEY" 'Set OPENAI_API_KEY in .env before running the server.'
fires  "R8 pem block"           "$P_SECRET_PEM" "-----${_P:-BEGIN} RSA PRIVATE KEY-----"
fires  "R8 env file path"       "$P_SECRET_ENVFILE" 'server/.env.local'
silent "R8 env in a doc name"   "$P_SECRET_ENVFILE" 'docs/environment.md'

# The table above must not itself look like a leak, or this gate blocks every change to it.
if grep -qE "$P_SECRET_KEY|$P_SECRET_PEM" "$HERE/self-test.sh"; then
  bad "self-test.sh contains a literal that R8 matches — the secret gate will block its own test table"
else
  ok "self-test.sh carries no credential-shaped literal of its own"
fi

echo "== R9 tooling =="
fires  "R9 eslint config"   "$P_TOOLING" 'client/eslint.config.mjs'
fires  "R9 prettier config" "$P_TOOLING" '.prettierrc'
silent "R9 unrelated file"  "$P_TOOLING" 'server/src/platform/config.ts'

echo "== R11 i18n =="
# The floor is what makes this gate honest: the first version saw 10 of these.
reach "R11 t() calls"   250 "$P_I18N_CALL"  client/src
reach "R11 scopes"       20 "$P_I18N_SCOPE" client/src
fires  "R11 double-quoted"    "$P_I18N_CALL" 'return <b>{t("finding.accept")}</b>;'
fires  "R11 single-quoted"    "$P_I18N_CALL" "return <b>{t('finding.accept')}</b>;"
fires  "R11 with arguments"   "$P_I18N_CALL" 'return <b>{t("runCost.label", { cost: 1 })}</b>;'
silent "R11 not a t() call"   "$P_I18N_CALL" 'const formatted = format("finding.accept");'
fires  "R11 scope useTranslations" "$P_I18N_SCOPE" 'const t = useTranslations("prReview");'
fires  "R11 scope getTranslations" "$P_I18N_SCOPE" 'const t = await getTranslations("prReview");'

echo
printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
