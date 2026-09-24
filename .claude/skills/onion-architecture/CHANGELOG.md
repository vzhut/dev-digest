# onion-architecture: changelog

SemVer: MAJOR means code that complied now doesn't · MINOR means a new rule or section · PATCH means wording, examples or links.
On every change, bump `metadata.version` and `metadata.updated` in `SKILL.md` and add an entry here.

## 1.1.0 (2026-09-19)

- Added `references/layer-map.md`: every `server/src` file with its ring and status (✅ / ⚠️ D#), plus an allowed-import lookup.
- Added `README.md` for people: when the skill triggers, file layout, versioning procedure, known gaps, and source links.
- Moved `references.md` to `references/sources.md`.
- Added D9 to the known deviations: the repo-intel pipeline imports concrete adapters.

## 1.0.0 (2026-09-19)

First version. It covers the rings mapped to `server/src` paths, the dependency rule and import matrix, a placement table,
per-tool rules (Fastify, Zod, Drizzle, SDK adapters, jobs/SSE), recipes for a new module / service / integration, testing by
ring, when not to add a layer, the known deviations D1–D8 and a review checklist with grep gates.
Spec: [`specs/onion-architecture-skill.md`](../../../specs/onion-architecture-skill.md).
Research: [`docs/research/onion-architecture-skill-plan.md`](../../../docs/research/onion-architecture-skill-plan.md).
