---
name: response-schema
description: Apply when a pull request changes a Zod response schema or the shape of data returned from an API route, to verify the new shape doesn't silently break existing clients.
---

# Response schema conformance

For every changed schema (Zod contract, DTO, or the shape of what a route returns),
diff the OLD and NEW field lists side by side and cite `path:line` for both the
removed/changed line and its replacement.

**Breaking (report as CRITICAL unless the diff also adds a version bump or a shim):**
- a field renamed — report BOTH names, e.g. `cost_usd` → `costUsd`;
- a field removed with no deprecation window;
- a field's type narrowed (`string | null` → `string`, a union losing a member,
  an array becoming non-empty);
- a field made non-nullish that clients may already treat as optional;
- snake_case ↔ camelCase drift on the same field — wire contracts are snake_case
  (AGENTS.md naming conventions); a client relying on the old casing breaks silently
  and this is easy to miss in a diff that only shows the Zod schema, not the callers.

**Not breaking:**
- a new optional field with a default that preserves old behaviour;
- a new variant added to a union, additive to what's there.

Always end with the exact pair, so a reviewer can grep for the old name in client
code straight from the comment:

```
Before: cost_usd: number
After:  costUsd: number
```
