# frontend-architecture — changelog

SemVer: MAJOR — code that complied now doesn't · MINOR — new rule or section · PATCH — wording, examples, links.

## 1.1.0 — 2026-09-20

Packaging brought in line with `onion-architecture`, and the debt list retired.

- Added `README.md` (human-facing: triggering, layout, versioning, status, sources).
- `references.md` → `references/sources.md`; added `references/placement-map.md` — every `client/src` folder,
  what lives in it, who may import it, and the two `grep` checks for the forbidden directions.
- Added `evals/evals.json`: three prompts (new screen placement, splitting a fat component, reviewing a patch
  that follows a bad precedent) with assertions.
- SKILL.md: "Known debt" replaced by "Accepted exceptions" — every v1.0.0 debt item was fixed while executing
  `client/docs/improvement-plan.md`; §9 no longer tolerates the deleted `lib/hooks/index.ts` barrel;
  bundled-file pointers now name when to read each one.

## 1.0.0 — 2026-09-19

Initial version. Placement table, component folder anatomy, layers, pages & `'use client'` boundary,
splitting signals, promotion ladder, import boundaries, `index.ts` rules, naming, review checklist, known debt.
Spec: [`specs/frontend-architecture-skill.md`](../../../specs/frontend-architecture-skill.md).
