---
name: deprecation-policy
description: Apply when a pull request removes, renames or narrows something that existing clients call, to verify the change ships with a deprecation window instead of landing as a silent break.
---

# Deprecation policy

A breaking change is not automatically a blocker — it is a blocker when it ships
**without** a deprecation path. For every breaking change you (or another skill)
found in this diff, classify it by what the diff actually ships alongside it:

- **No deprecation, immediate removal** — the old field/route disappears in the
  same diff with nothing to catch callers → **CRITICAL**.
- **Deprecated but still served** — the old field/route is kept, marked deprecated
  (a comment, a doc note, a `@deprecated` tag) and scheduled for a later removal →
  **WARNING** at most; note the stated removal date/version if one is given.
- **Versioned route** — a new path (e.g. `/v2/...`) is added alongside the
  untouched original → **not breaking on its own**; only the ORIGINAL path's
  removal, if that also happens in this diff, is.

When you flag a breaking change that another skill already caught, add one line
here: does this diff also ship a deprecation notice, a compatibility shim, or a
new versioned path for it? If none of the three is present, say so explicitly and
escalate to CRITICAL — don't let "well, it's technically breaking, but…" soften
the severity silently. A change that removes something with no deprecation window
is exactly the case this checklist exists to catch.
