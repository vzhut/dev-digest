#!/usr/bin/env python3
"""Does this Bash tool call actually publish work to GitHub, and at what tier?

Reads the PreToolUse payload on stdin. Exit 1 = not a publishing command, let it through.
Exit 0 = gate it, and print the tier the command requires on stdout:

    gates   `git push` — a branch push is cheap and reversible, so the deterministic gates
            (~12s) are enough to open it. Pushing early and often is the behaviour we want.
    full    `gh pr create` / `gh pr merge` / `gh pr ready` — this is the moment work is handed
            to someone else, and it is the one worth waiting the full review for.

Splitting the tiers is what keeps the gate usable. A single verdict meant every push waited
four to six minutes on a model review, and this skill's own gates.sh says it: "a gate people
wait on is a gate they learn to bypass".

The hook sees one raw string for the whole composite command, so a naive substring or even a
separator-anchored match fires on text that merely *quotes* a command: a heredoc that writes
documentation, a commit message, a grep pattern. That is not a hypothetical — both variants
blocked real edits to AGENTS.md and INSIGHTS.md while this gate was being built, and a gate
that blocks unrelated work is one people switch off.

So: remove the parts of the command that are data (heredoc bodies, quoted strings), then look
for an invocation in what's left — at the start, or right after a shell separator.

Erring towards letting a command through is deliberate. A missed push costs one unreviewed
change; a false block costs trust in every verdict this skill produces.
"""
import json
import re
import sys

HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1.*?^\s*\2\s*$", re.S | re.M)
QUOTED = re.compile(r"'[^']*'|\"[^\"]*\"")
SEPARATOR = r"(?:^|[;&|(]|\bthen\b|\bdo\b|\belse\b|&&|\|\|)\s*"
PUSH = re.compile(SEPARATOR + r"git(?:\s+-\S+(?:\s+\S+)?)*\s+push\b")
PR = re.compile(SEPARATOR + r"gh\s+pr\s+(?:create|merge|ready)\b")
# The user opting out explicitly. `--no-verify` is git's own way of saying "skip my hooks",
# and honouring it keeps the escape hatch in git rather than in someone deleting this file.
OPT_OUT = ("--dry-run", "--no-verify")


def required_tier(command: str) -> str | None:
    """None = not a publishing command. Otherwise the tier that command needs."""
    if any(flag in command for flag in OPT_OUT):
        return None
    stripped = QUOTED.sub(" ", HEREDOC.sub(" ", command))
    # A command doing both (`git push && gh pr create`) is held to the stricter tier.
    if PR.search(stripped):
        return "full"
    if PUSH.search(stripped):
        return "gates"
    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 1  # unreadable payload: never block on our own parsing failure
    command = (payload.get("tool_input") or {}).get("command") or ""
    tier = required_tier(command)
    if tier is None:
        return 1
    print(tier)
    return 0


if __name__ == "__main__":
    sys.exit(main())
