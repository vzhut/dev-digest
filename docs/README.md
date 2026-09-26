# docs — cross-package

Deep-dives spanning more than one package, plus reference material read on demand.
Not here: per-package detail → `<package>/docs/` · debugging findings → `INSIGHTS.md`.
Linked from `AGENTS.md` via *Use when*.

- [`intent-layer.md`](intent-layer.md) — the two-call flow (intent classifier → main review), allowed sources, ticket allowlist and env, scope policy.
- [`prompt-logging.md`](prompt-logging.md) — what is logged when a prompt is built (sections, sources, sizes, model, correlation id), what never is, and the local-only verbose mode.
- [`smart-diff.md`](smart-diff.md) — Files changed grouped by role: path-classifier rule order and disputed cases, `GET /pulls/:id/smart-diff` contract, inline finding anchoring (`RIGHT:start_line`, off-patch block, toggle), why no LLM.
- [`agent-prompts/`](agent-prompts/) — built-in reviewer system prompts, and choosing a model.
