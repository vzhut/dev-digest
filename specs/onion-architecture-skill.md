# `onion-architecture` skill: layering and dependency direction for the server

Status: implemented (lesson-02) · Scope: `.claude/skills/onion-architecture/` (new), `.claude/skills/README.md`,
`server/AGENTS.md`. No runtime code changes.

Source research: [`docs/research/onion-architecture-skill-plan.md`](../docs/research/onion-architecture-skill-plan.md).

## Problem

The backend skills explain *how to use* Fastify, Drizzle and Zod, but none of them says *which ring code belongs to and which way
imports may point*. The server already has ports (`vendor/shared/adapters.ts`), adapters (`src/adapters/*`) and a
composition root (`platform/container.ts`), but nothing stops new code from querying Drizzle in a route handler, constructing an SDK inline,
or importing another module's internals. Several existing modules already do this.

## Behaviour: what the skill must give an agent

1. The onion rings mapped onto real `server/src` paths, where the file role decides the ring.
2. The dependency rule as an import matrix, plus three corollaries (no cross-module, no adapter → module, no outer data formats inward).
3. A placement table: "I have X → it goes to Y".
4. Per-tool rules for Fastify, Zod, Drizzle, the SDK adapters, and jobs/SSE/time.
5. Recipes for a new module, a new service constructor and a new integration.
6. Testing by ring (unit for the pure core; mock only unmanaged dependencies; `.it` for repositories; `inject` for routes).
7. When NOT to add a layer (CRUD pragmatism, no DDD/CQRS unasked).
8. A known-deviations baseline, so agents neither copy nor refactor existing violations unasked.
9. A review checklist with grep gates.

Out of scope: Fastify/Drizzle/Zod API mechanics (neighbouring skills), the client (`frontend-architecture`), and automated enforcement.

## Decisions

| # | Question | Decision |
|---|---|---|
| O1 | Strictness | New and touched code only. D1–D8 are recorded as the baseline; boy-scout rule when touching a file |
| O2 | Folders | Keep modules flat (`routes/service/repository/helpers/constants`); the ring is decided by file role |
| O3 | Service dependencies | New services take narrow deps `{ repo, github, … }`; existing `constructor(container)` stays |
| O4 | Transactions | The service opens `db.transaction`, and repository methods accept `Db \| Tx` |
| O5 | Automated check | Checklist + grep only; no dependency-cruiser config (`AGENTS.md`: no linter unasked) |
| O6 | Clock/UUID injection | Recommended for pure functions whose output is asserted in tests, not mandatory |
| O7 | `reviewer-core` | The reference pure core only; no separate rules |
| O8 | Row types in services | `import type` from `db/rows.ts` is tolerated; `db/schema` values and `drizzle-orm` aren't |
| O9 | Versioning | `metadata.version` (SemVer) + `updated` + `stack` in frontmatter, plus `CHANGELOG.md`, same as `frontend-architecture` |

## Files

- `.claude/skills/onion-architecture/SKILL.md`: rules, matrix, placement, checklist.
- `.claude/skills/onion-architecture/examples.md`: before/after on real server code.
- `.claude/skills/onion-architecture/references/sources.md`: sources per rule.
- `.claude/skills/onion-architecture/references/layer-map.md`: every `server/src` file → ring → status.
- `.claude/skills/onion-architecture/README.md`: the human-facing overview, versioning procedure and source links.
- `.claude/skills/onion-architecture/CHANGELOG.md`.
- `.claude/skills/onion-architecture/evals/evals.json`: test prompts and assertions (skill-creator loop).

## Delivery log

| Phase | Record |
|---|---|
| Initiation | Surveyed `server/src` (modules, adapters, platform, container), the existing backend skills and `server/AGENTS.md`. Found deviations D1–D8 using the grep gates now in SKILL.md §9. |
| Planning | Research plan with 42 verified links in `docs/research/`; decisions O1–O7 accepted by the user; O8–O9 follow from the code and `frontend-architecture`. |
| Implementation | Skill v1.0.0 written with skill-creator. v1.1.0 adds `README.md` and `references/layer-map.md` (at the user's request) and deviation D9; catalog row in `.claude/skills/README.md`; *Use when* line in `server/AGENTS.md`. |
| Validation | `quick_validate`: valid (the description was trimmed from 1042 to 1022 chars). Checklist greps run against `server/src`; their hits match D1–D8. skill-creator iteration 1: 3 prompts × (with skill / without it), 21 assertions. Pass rate 100% vs 100%, time +8%, tokens +4%, so the assertions don't discriminate (see root `INSIGHTS.md`). The qualitative gains with the skill: unit tests for pure mappers, reusing `countBlockers`, and leaving D3 alone rather than refactoring. The subagents ran typecheck on scratch copies and it was clean; the `.it` tests didn't run because there was no Docker. |
| Completion | Two insights went to the root `INSIGHTS.md` (non-discriminating skill evals; the 1024-char description limit). Committed on `lesson-02` in three slices: research plan → skill v1.1.0 + catalog/AGENTS/spec → insights. Next step, not started: the server audit plan from the skill (phases 0–5) is waiting on the user's decision for phase 4. |
