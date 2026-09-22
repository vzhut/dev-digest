# specs — cross-package

Intended behaviour for features touching several packages (a review flow end to end, `@devdigest/shared` contract changes).
Not here: single-package behaviour → `<package>/specs/`.
Linked from `AGENTS.md` via *Use when*. Index each spec here.

- [`frontend-architecture-skill.md`](frontend-architecture-skill.md) — the `frontend-architecture` agent skill: where client code lives, splitting, promotion, import boundaries (skills + `client/AGENTS.md`).
- [`onion-architecture-skill.md`](onion-architecture-skill.md) — the `onion-architecture` agent skill: server rings, dependency rule, placement, review checklist (skills + `server/AGENTS.md`).
- [`findings-popover.md`](findings-popover.md) — severity icons + read-only "N findings in this run" popover on the PR list and the PR Timeline (contract + server + client).
- [`skills.md`](skills.md) — L02 skills: reusable markdown guidance blocks, workspace CRUD + versions, per-agent link/enable/order, `.md`/`.zip` import with preview, trust split by source (contracts + server + reviewer-core + client + seed).
- [`skills-lab-completion.md`](skills-lab-completion.md) — L02 lab completion: audit of grading criteria 1–37 against the code, gap-closing slices L1–L10, the two control experiments; committed on `lesson-02-laba` before the homework.
