# specs — cross-package

Intended behaviour for features touching several packages (a review flow end to end, `@devdigest/shared` contract changes).
Not here: single-package behaviour → `<package>/specs/`.
Linked from `AGENTS.md` via *Use when*. Index each spec here.

- [`frontend-architecture-skill.md`](frontend-architecture-skill.md) — the `frontend-architecture` agent skill: where client code lives, splitting, promotion, import boundaries (skills + `client/AGENTS.md`).
- [`onion-architecture-skill.md`](onion-architecture-skill.md) — the `onion-architecture` agent skill: server rings, dependency rule, placement, review checklist (skills + `server/AGENTS.md`).
- [`intent-layer.md`](intent-layer.md) — L03 Intent Layer: cheap intent classifier (`review_intent` model), linked issue/spec/ticket sources with SSRF controls, `pr_intent` persistence + staleness, prompt slot, out-of-scope tag+downgrade, intent card, logging (contracts + reviewer-core + server + client + e2e).
- [`intent-layer-verification.md`](intent-layer-verification.md) — manual verification checklist for the Intent Layer UI (card, out-of-scope badges, look and feel, settings) on seeded data; companion to `intent-layer.md`.
- [`agent-improvements.md`](agent-improvements.md) — backlog (not applied): per-agent edits to cut tokens without dropping gates — task cards, diff input for the architecture reviewer, verifier counts from the table, capped reports, fewer preloaded skills; evidence from the Intent Layer run.
- [`findings-popover.md`](findings-popover.md) — severity icons + read-only "N findings in this run" popover on the PR list and the PR Timeline (contract + server + client).
- [`skills.md`](skills.md) — L02 skills: reusable markdown guidance blocks, workspace CRUD + versions, per-agent link/enable/order, `.md`/`.zip` import with preview, trust split by source (contracts + server + reviewer-core + client + seed).
- [`skills-lab-completion.md`](skills-lab-completion.md) — L02 lab completion: audit of grading criteria 1–37 against the code, gap-closing slices L1–L10, the two control experiments; committed on `lesson-02-laba` before the homework.
- [`skills-lab-verification.md`](skills-lab-verification.md) — the manual verification checklist for the lab (criteria not provable by tests alone); superseded in practice by the interactive checklist artifact, kept as the file-based fallback.
- [`conventions-extractor.md`](conventions-extractor.md) — L02 part 2 (homework): scans a repo for house conventions with code-verified evidence, accept/reject/edit, merges accepted ones into an `extracted` skill (`repo-conventions`); plus the four-skill API Contract Reviewer demo reusing the lab's PR #1 (contracts + server + client + docs). Starts only after `skills-lab-completion.md` is done.
