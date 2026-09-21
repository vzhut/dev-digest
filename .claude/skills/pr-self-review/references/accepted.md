# Accepted false positives

Findings recorded with `/pr-self-review --accept <id> "reason"` that turned out to be wrong
often enough to be worth suppressing. A review drops a matching finding while the expiry is in
the future, and re-raises it afterwards — nothing here is permanent, because a rule that stays
wrong should be fixed in its source skill instead of muted forever.

A row lands here after the **second** time the same finding is accepted. One accept is a
judgement call about one change; two is evidence about the rule.

| id | rule | file / pattern | reason | expires | fix the source? |
|---|---|---|---|---|---|
| _(none yet)_ | | | | | |

When a row's `fix the source?` says yes, the real work is in the skill that raised it: tighten
its rule, or note the exception in its own checklist, then delete the row.
