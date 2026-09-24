# frontend-architecture skill

An agent skill that keeps the DevDigest **client** (`client/src`) predictable: every piece of code has one
obvious place, components split along real seams, and code is promoted to the shared layer only when a
second consumer appears.

This README is for **people**. Agents load [`SKILL.md`](SKILL.md) automatically from its `description`.

## When it triggers

Claude Code loads the skill when a task adds or moves a page, component, hook, constant, helper, type or API
call in `client/`, when a component or `page.tsx` has grown and needs splitting, when code from one route is
needed by another, and when reviewing a client change for structure. It triggers on plain phrasings too —
"where should this go?", "this file is too big" — without the word *architecture*.

It does **not** cover how to write React itself (→ `react-best-practices`), Next.js mechanics such as RSC and
special files (→ `next-best-practices`), or tests (→ `react-testing-library`).

Invoke it explicitly with `/frontend-architecture`. Agents other than Claude Code (Cursor, Codex, Copilot)
read `SKILL.md` as plain markdown.

## What's inside

```
frontend-architecture/
├── README.md                    this file (for humans)
├── SKILL.md                     the rules: map, placement table, folder anatomy, layers, page boundary,
│                                splitting signals, promotion ladder, imports, index.ts, naming, checklist
├── examples.md                  before/after on real client code (fat page, split, promotion, imports)
├── references/
│   ├── placement-map.md         every client/src folder → what lives there → who may import it
│   └── sources.md               the article or doc behind each rule
├── evals/evals.json             test prompts + assertions for the skill-creator eval loop
└── CHANGELOG.md
```

Progressive disclosure: `SKILL.md` is what loads on every trigger and stays around 240 lines. `examples.md`
and `references/*` load only when the agent actually needs them — a placement question rarely needs the
sources, and a "why is this rule like that" question rarely needs the inventory.

## The rule in one picture

```
app/<route>/page.tsx  (server, thin)
      └─▶ _components/<Name>View/   client entry: URL state + data hooks
             └─▶ _components/<Child>/        local UI
                     │
      promote when a 2nd consumer appears
                     ▼
        components/<kebab>/        UI used by 2+ routes
        lib/<concept>.ts           pure logic used by 2+ routes
        lib/hooks/<domain>.ts ──▶ lib/api.ts ──▶ Fastify API
```

Dependencies point one way: `app → components → lib → vendor`. A route never imports another route's
`_components`; when it needs them, they get promoted instead.

## Versioning

SemVer in the `SKILL.md` frontmatter (`metadata.version`, `metadata.updated`, `metadata.stack`) plus
[`CHANGELOG.md`](CHANGELOG.md):

| Bump | When | Example |
|---|---|---|
| **MAJOR** | code that followed the skill now doesn't | `page.tsx` may no longer hold hooks |
| **MINOR** | a new rule, section or reference file | adding `references/placement-map.md` |
| **PATCH** | wording, examples, links, map rows for new files | a renamed folder in the placement map |

To change the skill:
1. Edit it, bump `metadata.version` and `metadata.updated` (`date +%F`), add a CHANGELOG entry.
2. Validate the frontmatter (the `description` must stay ≤ 1024 characters):
   `python -m scripts.quick_validate <repo>/.claude/skills/frontend-architecture` from the skill-creator
   directory (needs PyYAML).
3. For rule changes, rerun the eval loop (skill-creator) starting from `evals/evals.json`.
4. Keep the catalog row in [`.claude/skills/README.md`](../README.md) and the pointer in
   [`client/AGENTS.md`](../../../client/AGENTS.md) in sync.

## Status and known gaps

- **v1.1.0** — the "Known debt" list from v1.0.0 is gone: every item in it (fat pages, deep relative imports,
  the `lib/hooks` barrel, default-exported components, `'use client'` on a thin page) was fixed while
  executing [`client/docs/improvement-plan.md`](../../../client/docs/improvement-plan.md). The section is now
  a short list of *accepted* exceptions instead, which is the only kind of debt worth carrying in a skill.
- The rules aren't enforced automatically. The checklist uses `grep`, because `AGENTS.md` says not to add a
  linter unasked.
- `evals/evals.json` has never been run through the full benchmark. The onion-architecture skill's first run
  showed 100% pass with *and* without the skill, so prompts that merely ask for correct code don't
  discriminate; the prompts here deliberately include one that extends a file with a bad precedent.
- Open gaps in the rules themselves, inherited from the improvement plan's review: where a *non-data* hook
  shared by 2+ routes belongs, and where a new UI primitive goes while `vendor/ui` is frozen.

## Sources

Per-rule mapping in [`references/sources.md`](references/sources.md); the full research (52 sources) in
[`docs/research/react-nextjs-architecture-sources.md`](../../../docs/research/react-nextjs-architecture-sources.md).
Spec: [`specs/frontend-architecture-skill.md`](../../../specs/frontend-architecture-skill.md).

**Structure and placement**
- [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure)
- [bulletproof-react — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/)
- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)
- [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/)

**Layers and splitting**
- [Juntao Qiu — Modularizing React Applications](https://martinfowler.com/articles/modularizing-react-apps.html)
- [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) · [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Kent C. Dodds — When to break up a component](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) · [AHA Programming](https://kentcdodds.com/blog/aha-programming)
- [Dan Abramov — Before You memo()](https://overreacted.io/before-you-memo/)

**Boundaries**
- [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) · [Practical React Query](https://tkdodo.eu/blog/practical-react-query)
- [Feature-Sliced Design — layers](https://feature-sliced.design/docs/get-started/overview)
