#!/usr/bin/env bash
# The regexes every pattern-based gate matches with, in one place.
#
# Why they live here and not inline in gates.sh: a grep gate can be silently dead. R11 shipped
# matching only single-quoted, argument-less `t('a.b')` — 10 of the 312 call sites in
# client/src — and reported everything as clean, because the fixture used to "verify" it was
# written in the same style as the pattern. R8 shipped matching `sk-[A-Za-z0-9]{20,}`, which
# no modern OpenAI or Anthropic key matches, in a repo that integrates both.
#
# So every pattern here is exercised by `self-test.sh`, which asserts two things per rule:
#   reach   — how many lines of the real tree it matches, so a pattern that has gone blind
#             against the codebase's actual style fails the test instead of passing silently
#   table   — fixture lines it must fire on and fixture lines it must stay silent on
#
# Add a pattern here and add its rows to self-test.sh in the same commit.

# ---- R7 onion dependency rule ------------------------------------------------------------
# Server source is single-quoted throughout (0 double-quoted imports at the time of writing),
# but matching both costs nothing and removes a whole class of silent miss.
P_ONION_DB="from ['\"]drizzle-orm['\"]|db/schema|container\.db"

# The module list is read off disk rather than hard-coded: a lesson that adds a module would
# otherwise be exempt from the cross-module rule without anyone noticing. Both `../<mod>/` and
# `../../modules/<mod>/` are real forms in this tree.
onion_cross_module_re() {
  local mods
  mods="$(ls -1 server/src/modules 2>/dev/null | grep -vE '^(_shared|index\.ts)$' | paste -sd'|' -)"
  [ -n "$mods" ] || mods='agents|reviews|repos|pulls|polling|workspace|settings|repo-intel'
  printf "from ['\"](\\.\\./(%s)|\\.\\./\\.\\./modules/(%s))/" "$mods" "$mods"
}

P_ONION_ADAPTER="from ['\"][^'\"]*(modules|db)/"
P_ONION_ENV='process\.env'
P_CORE_IMPURE="from ['\"](pg|postgres|drizzle-orm|fs|node:fs|octokit|simple-git)"

# ---- R8 secrets ---------------------------------------------------------------------------
# Provider key formats, not one guessed shape. The dash-segmented prefixes matter: `sk-proj-`,
# `sk-ant-api03-` and `sk-svcacct-` all break a naive `sk-[A-Za-z0-9]{20,}` on the first dash,
# and those are exactly the two providers this repo calls.
P_SECRET_KEY='(sk-(proj|svcacct|ant-api[0-9]{2})-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{50,}|A[SK]IA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[A-Za-z0-9_-]{30,})'
P_SECRET_PEM='BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY'
P_SECRET_ENVFILE='(^|/)\.env($|\.)'
# Committed templates are meant to be tracked: `.env.example` is documentation, not a secret.
P_SECRET_ENVFILE_SAFE='(^|/)\.env\.(example|sample|template)$'

# ---- R9 linter/formatter configs ----------------------------------------------------------
P_TOOLING='(eslint|prettier|biome|\.editorconfig)'

# ---- R11 i18n -----------------------------------------------------------------------------
# Used by the Python block in gates.sh; kept here so self-test.sh can measure reach.
# The scope must be assigned to a variable named `t`: CALL only matches `t(...)`, so a second
# translator (`const tType = useTranslations("other")`) must not change what `t` resolves to.
P_I18N_CALL="\\bt\\(\\s*[\"'][A-Za-z0-9_][A-Za-z0-9_.]*[\"']\\s*[,)]"
P_I18N_SCOPE="\\bt\\s*=\\s*(await\\s+)?(useTranslations|getTranslations)\\(\\s*[\"'][A-Za-z0-9_.]+[\"']"
