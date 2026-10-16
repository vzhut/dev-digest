#!/usr/bin/env bash
# Checks the GitHub token the DevDigest server actually uses (same lookup order
# as LocalSecretsProvider: ~/.devdigest/secrets.json, then env). Prints only the
# token KIND (prefix), HTTP codes and GitHub's own error message. Never the token.
set -u
REPO="${1:-vzhut/conventions-demo}"
BRANCH="${2:-main}"
SECRETS="$HOME/.devdigest/secrets.json"

TOKEN="$(python3 -I - "$SECRETS" <<'PY'
import json, os, sys
tok = ""
try:
    tok = json.load(open(sys.argv[1])).get("GITHUB_TOKEN", "") or ""
except Exception:
    pass
print(tok or os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_PAT") or "")
PY
)"

if [ -z "$TOKEN" ]; then echo "No token found in $SECRETS or env"; exit 1; fi
case "$TOKEN" in
  github_pat_*) echo "token kind: fine-grained (github_pat_...)";;
  ghp_*)        echo "token kind: classic (ghp_...)";;
  *)            echo "token kind: other (${TOKEN:0:4}...)";;
esac
echo "source: $( [ -n "$(python3 -I -c "import json,sys;print(json.load(open(sys.argv[1])).get('GITHUB_TOKEN',''))" "$SECRETS" 2>/dev/null)" ] && echo "$SECRETS (Settings)" || echo "environment")"

call() { # label, path
  local out code
  out="$(curl -s -D /tmp/.devdigest-hdr -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "https://api.github.com$2")"
  code="${out##*$'\n'}"
  msg="$(printf '%s' "${out%$'\n'*}" | python3 -I -c "import json,sys
try: print(json.load(sys.stdin).get('message',''))
except Exception: print('')")"
  printf '%-34s HTTP %s  %s\n' "$1" "$code" "$msg"
}

call "repo visible"                 "/repos/$REPO"
call "base branch ref ($BRANCH)"    "/repos/$REPO/git/ref/heads/$BRANCH"
call "ci branch ref (devdigest/ci)" "/repos/$REPO/git/ref/heads/devdigest/ci"
call "open PRs list"                "/repos/$REPO/pulls?state=open&per_page=1"
call "actions workflows (read)"     "/repos/$REPO/actions/workflows"
echo "--- scopes (classic tokens only):"
grep -i '^x-oauth-scopes' /tmp/.devdigest-hdr || echo "(none: fine-grained token, or no header)"
echo "--- repo default branch / push permission:"
curl -s -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$REPO" | python3 -I -c "import json,sys
d=json.load(sys.stdin); print('default_branch =', d.get('default_branch'), '| permissions =', d.get('permissions'))"
rm -f /tmp/.devdigest-hdr
