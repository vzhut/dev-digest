# specs — reviewer-core

Intended engine behaviour: grounding edge cases, verdict and score derivation, retry/repair on malformed output, expectations for a new finding `kind`.
Not here: what the pipeline already does → `../README.md` · cross-package behaviour → `../../specs/`.
Linked from `reviewer-core/AGENTS.md` via *Use when*. Index each spec here.

- [`grounding.md`](grounding.md) — the grounding gate's required behaviour as a case table (G1–G11), plus how to add a new finding `kind`.
- [`review-output.md`](review-output.md) — invariants of `reviewPullRequest`'s outcome (O1–O9), failure behaviour, `countBlockers`.
