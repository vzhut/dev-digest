# Severity: one scale, and how each skill maps onto it

The routed skills use three different scales, or none. Merging them naively would make
"CRITICAL" mean whatever the loudest skill meant by it, and since CRITICAL blocks a push here,
that would either block everything or teach people to ignore it.

## The scale

| Level | Meaning | Blocks? |
|---|---|---|
| **CRITICAL** | Breaks at runtime, loses or corrupts data, opens an exploit, breaks a contract between packages, or violates *Do-not-touch* in `AGENTS.md` | **yes** |
| **HIGH** | A new architecture violation, or a real bug risk that doesn't break today | no |
| **MEDIUM** | Maintainability: size, placement, duplication, weak tests | no |
| **LOW** | Naming, wording, style | no |

The test for CRITICAL: *can you name what breaks, and for whom?* "This will render the raw i18n
key to every user on the PR page" passes. "This component is doing too much" doesn't, however
true it is.

## What is CRITICAL in this repo

Deterministic (from `scripts/gates.sh`):
- typecheck or unit tests fail in a touched package (R1, R2)
- an existing migration edited, renamed or deleted; a migration without a schema change (R3)
- a lockfile moved without its `package.json` (R4)
- a `@devdigest/shared` field removed or renamed in only one of the two copies (R5)
- a credential, private key or `.env` file in the diff (R8)
- a new server module missing from `modules/index.ts` — the routes never load (R10)
- an i18n key used in code but absent from `client/messages/en/*.json` (R11)

From judgement:
- an exploitable path with the attack named (`security` CRITICAL/HIGH, evidence required)
- a React hook called conditionally or in a loop; a list key that reorders (`react-best-practices`)
- server data mutated during render, or a render-phase side effect
- `process.env` outside `platform/config`; an adapter importing `modules/`; a DB/FS/GitHub call
  added to `reviewer-core` (`onion-architecture` — the four layering rules that break at runtime
  or invert the dependency rule outright)
- unparsed request input reaching SQL, the shell or the filesystem (`zod` + `security`)

Everything else from a skill's checklist starts at HIGH or below.

## Per-skill mapping

| Skill | Its scale | How to read it here |
|---|---|---|
| `security` | CRITICAL / HIGH / MEDIUM / LOW by exploitability | Keep as is — but only with the attack path stated. The skill's own rule is "report HIGH confidence only"; honour it |
| `react-best-practices` | CRITICAL / HIGH / MEDIUM | Bug-class rules (hooks, keys, derive-don't-store causing stale UI) → CRITICAL. Component design, render factories, over-engineering → MEDIUM: real advice, but not a reason to stop a push |
| `zod` | per-category impact | Never CRITICAL on its own. An unparsed request body → HIGH; CRITICAL when that value reaches SQL, shell or FS |
| `onion-architecture` | none | New violation → HIGH, except the four runtime-breaking ones above. Existing D1–D9 → not a finding |
| `frontend-architecture` | none | New violation of §11 → HIGH (fetch outside `lib/api.ts`, server data copied into `useState`, cross-route import, hard-coded user-visible string). Splitting and placement → MEDIUM. "Known debt" → not a finding |
| `next-best-practices` | none | A broken RSC/client boundary that fails at runtime → CRITICAL; the rest → HIGH or MEDIUM |
| `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` | none | HIGH when the pattern causes wrong data or a leak (missing validation, N+1 in a request path, nullable column that must not be); otherwise MEDIUM |
| `react-testing-library` | none | MEDIUM. A weak test is worth fixing, never worth blocking |
| `typescript-expert` | none | MEDIUM at most (see `routing.md`) |

## Downgrade rules (applied while merging)

1. **No `file:line` on an added line** → drop the finding. There is no such thing as a blocking
   finding you can't point at.
2. **Same problem found by two skills** → keep one, the most specific, and list both rule names.
3. **Pre-existing pattern** — the diff extends a file that already did this, and the added lines
   don't make it worse → MEDIUM note, never CRITICAL. The repo's known deviations are documented
   on purpose; re-litigating them in every review is how a gate wears out its welcome.
4. **Style disagreement with `AGENTS.md`** → `AGENTS.md` wins, and the skill needs fixing. Say so.
