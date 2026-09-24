# docs — reviewer-core

Deep-dives for `reviewer-core`: prompt-slot rationale, the injection-guard threat model, structured-output repair, map-reduce thresholds.
Not here: pipeline diagram and public API → `../README.md` · findings → `../INSIGHTS.md`.
Linked from `reviewer-core/AGENTS.md` via *Use when*. Index each document here.

- [`pipeline.md`](pipeline.md) — step by step: mode selection and threshold, prompt assembly and injection guard, structured output with repair and retries, reduce, all-or-nothing cost, grounding, score.
- [`scoring-and-grounding.md`](scoring-and-grounding.md) — the deterministic layer: grounding rules, score formula, pass-through verdict, blockers and the `ciFailOn` gate, and why `confidence` is not used.
