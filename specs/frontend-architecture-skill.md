# `frontend-architecture` skill — where client code lives and how it is split

Status: implemented (lesson-02) · Scope: `.claude/skills/frontend-architecture/` (new) +
`.claude/skills/react-best-practices/` (trimmed) + `.claude/skills/README.md` + `client/AGENTS.md`.
No runtime code changes.

Source research: [`docs/research/react-nextjs-architecture-sources.md`](../docs/research/react-nextjs-architecture-sources.md).

## Problem

The existing skills answer *how to write* React (`react-best-practices`) and *how Next.js works*
(`next-best-practices`). Neither answers *"I have this piece of code — where does it go, and how do I split it?"*.
`react-best-practices` covers it in six generic lines ("shared utilities go in `utils/`"), which don't
match this repo (there is no `utils/`; shared non-UI code is `src/lib/<kebab>.ts`).

## Behaviour — what the skill must give an agent

1. **Placement table** — for each kind of code (page, route component, sub-component, shared component,
   constant, helper, type, component hook, data hook, API call, business rule, style, i18n key, test)
   the exact DevDigest path.
2. **Component folder anatomy** — which files a component folder may hold and what is allowed in each.
3. **Layers** — view (component) → state (hook) → pure logic (helpers / `lib/*.ts`) → API (`lib/api.ts`).
4. **Pages and the server/client boundary.**
5. **When to split a component** — signals, not a line limit.
6. **Promotion ladder** — when code moves from a folder to route level to `src/components` / `src/lib`.
7. **Import boundaries** — direction, alias vs relative, no cross-route `_components` imports.
8. **`index.ts` rules.**
9. **Naming** — consistent with `AGENTS.md` → *Naming conventions*.
10. **Review checklist** and a **known-debt list** so agents don't copy existing violations.

Out of scope: how to write components/hooks (→ `react-best-practices`), Next.js API mechanics
(→ `next-best-practices`), tests (→ `react-testing-library`). The skill links to them instead of repeating.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Name | `frontend-architecture` |
| 2 | Imports | Relative only inside the component's own folder tree; everything else via `@/…`. Existing deep relative paths are tolerated and fixed when a file is touched. |
| 3 | `'use client'` | `page.tsx` is a thin server component that renders a `<Name>View` from `_components` (like `app/agents/page.tsx`). Every file that uses hooks, state, events or browser APIs keeps its own `'use client'` (current practice). Fat client pages are debt, fixed when touched. |
| 4 | `index.ts` / barrels | `index.ts` = the folder's public API, named re-exports only. No new `export *` barrels. `lib/hooks/index.ts` is tolerated; new code imports the domain file (`@/lib/hooks/reviews`). |
| 5 | Feature-first `features/` folder vs colocation in `app/` | Keep the current "split by feature or route" strategy from the Next.js docs: route-local code in `app/**/_components/`, shared in `src/components/` and `src/lib/`. No `features/` migration. |
| 6 | Versioning | `metadata.version` (SemVer) + `updated` + `stack` in frontmatter, `CHANGELOG.md` next to `SKILL.md`. MAJOR = previously compliant code becomes non-compliant; MINOR = new rule; PATCH = wording/examples/links. |
| 7 | Overlap with `react-best-practices` | Its *Code Organization* section is replaced by a pointer to this skill. |

## Files

- `.claude/skills/frontend-architecture/SKILL.md` — rules, placement table, checklist.
- `.claude/skills/frontend-architecture/examples.md` — before/after on real client code.
- `.claude/skills/frontend-architecture/references/sources.md` — the sources the rules are based on.
- `.claude/skills/frontend-architecture/references/placement-map.md` — the current `client/src` inventory and the allowed-import lookup (added in v1.1.0).
- `.claude/skills/frontend-architecture/README.md` — the human-facing overview; `evals/evals.json` — eval prompts (both added in v1.1.0).
- `.claude/skills/frontend-architecture/CHANGELOG.md`.

## Delivery log

| Phase | Record |
|---|---|
| Initiation | Surveyed `client/src` (all files), existing skills, `AGENTS.md` / `client/AGENTS.md`. Found: `react-best-practices` has only a generic 6-line *Code Organization*; `next-best-practices` covers private folders as syntax only. Traps: mixed `@/` vs `../../../../../` imports, `'use client'` on almost every file, two fat client pages (`pulls/page.tsx`, `pulls/[number]/page.tsx`), `export *` barrel in `lib/hooks/index.ts`, a few default-exported components. |
| Planning | Research plan in `docs/research/`; this spec; decisions 2–4 agreed with the user, 1, 5–7 agreed earlier in the session. |
| Implementation | `frontend-architecture/{SKILL,examples,references,CHANGELOG}.md` (v1.0.0); `react-best-practices` *Code Organization* → pointer; catalog row in `.claude/skills/README.md`; *Use when* line in `client/AGENTS.md`; index in `specs/README.md`. Reviewed with the `skill-creator` skill: pushier trigger `description`, a 4-step quick procedure, "when to read examples.md", rationale added to the page / promotion / alias / `export *` rules. Commits: `d0ddfd1` (research + spec), then the skill itself. The eval run (with/without skill on 3 prompts) was proposed but not run. |
| Validation | No runtime code → no tests/typecheck affected. Every `client/src` path the skill names exists; all relative markdown links resolve; examples checked against the real files (`filterAgents`, `lib/severity.ts` consumers, `CreateAgentModal` state, `RunSummary.status`). Claude Code picked the skill up with its description. Known divergence left: `react-best-practices` still says "max 200 lines per component", this skill treats length as a prompt only. |
| Completion | No insights recorded — nothing non-obvious cost debugging time. |
