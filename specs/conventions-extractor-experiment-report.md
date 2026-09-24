# API Contract Reviewer experiment — 4 skills on PR #1 (§11)

Live run (real `openrouter/deepseek/deepseek-v4-flash`, real GitHub repo/PR) against
[`vzhut/api-contract-demo`](https://github.com/vzhut/api-contract-demo) PR #1 *"Tidy the
runs API"* — the same PR `skills-lab-completion.md` §4.1 reuses, three breaking changes in
one diff: `GET /runs/:id` moved to `GET /v2/runs/:runId`, `cost_usd` renamed to `costUsd`,
`tokens_out` removed with no deprecation. Date: 2026-09-22.

## 11.1/11.2 — the four skills

| Skill | Source | State |
|---|---|---|
| `api-contract-gate` | seeded (manual) | already existed |
| `breaking-change-checklist` | **imported** (zip → preview → confirm, lands disabled, enabled by hand) | already existed from the lab |
| `response-schema` | **created** in this slice — [`docs/skill-fixtures/response-schema/SKILL.md`](../docs/skill-fixtures/response-schema/SKILL.md) | new |
| `deprecation-policy` | **created** in this slice — [`docs/skill-fixtures/deprecation-policy/SKILL.md`](../docs/skill-fixtures/deprecation-policy/SKILL.md) | new |

All four linked to **API Contract Reviewer**, order 0–3 (table order above), all enabled.
Confirmed in the trace: the skilled run's assembled `user` prompt has a `## Skills / rules`
section concatenating all four bodies; the baseline run's prompt has no such section at all
(`'Skills / rules' in prompt` → `False`).

**Baseline procedure**: both pre-existing links set `enabled: false` (kept linked, not
unlinked — same semantics as the lab), confirmed via `GET /agents/:id/skills` before running.

## 11.3 — the measure, 3 runs each side

### Baseline (no skills)

| Run | Score | Findings | Coverage of the 3 breaking changes |
|---|---|---|---|
| 1 | 30 | 2 CRITICAL | field rename + field removal, distinctly cited — **route move missed entirely** |
| 2 | 65 | 1 CRITICAL | one finding's summary mentions the route change AND alludes to the schema change, but **bundled into a single citation**, not three |
| 3 | 0 | 3 CRITICAL + 1 suggestion | **all three**, distinctly cited, plus a bonus versioning-consistency note |

Baseline is inconsistent run to run: full distinct coverage once, partial-but-bundled once,
partial-with-a-miss once. This matches the spec's own framing (§11.3) — PR #1 is not the
lab's blindness case (that's PR #4); a bare model here "already flags *something* most of
the time," so the homework criterion is fuller + correctly-classified coverage, not baseline
silence.

### With all 4 skills

| Run | Score | Findings | Coverage |
|---|---|---|---|
| 1 | 0 | 3 CRITICAL | all three, distinctly cited, each title states old→new (`GET /runs/:id → GET /v2/runs/:runId`, `cost_usd → costUsd`, `tokens_out` removed) |
| 2 | 0 | 3 CRITICAL | same — one finding's rationale explicitly says "without deprecation" |
| 3 | 0 | 3 CRITICAL | same |

**3/3 runs, 3/3 distinct breaking changes each, every run scored 0 (maximally severe,
correctly).** No run bundled or missed anything. Confidence 1.0 on every finding both sides
(the same uncalibrated-confidence pattern from the quality report, §9 — not useful as a
discriminator here either, since both baseline and skilled findings hit 1.0).

One finding's rationale (skilled run 1, `cost_usd → costUsd`) reads: *"Wire contracts are
snake_case per the project conventions; clients relying on the old field name will silently
receive undefined…"* — `response-schema`'s own wording, verbatim, showing the skill's
content is actually shaping the output, not just riding along unread.

### Cost

| | Baseline | Skilled |
|---|---|---|
| Range | $0.00033–0.00050 | $0.00042–0.00079 |

Skilled costs slightly more (longer prompt, four skill bodies), still a fraction of a cent
per run either way.

## 11.4 — closing the loop with `repo-conventions`

Ran the Conventions Extractor live on `vzhut/conventions-demo` (§9's quality-report repo, 3
of its 8 candidates accepted: the `AppError`, logger and rethrow-wrap rules), created the
`repo-conventions` skill through the real API, linked it onto API Contract Reviewer as a
5th skill, and reran PR #1 once more.

**Result: no change.** Same 3 CRITICAL findings, same `score: 0`. Confirmed in the trace
that `repo-conventions`'s body genuinely reached the prompt (it appears verbatim, last
block, after the other four) — so this is a real "linked and read, no effect" outcome, not
a wiring failure. Expected: `repo-conventions` here encodes `conventions-demo`'s error-
handling/logging conventions, which have nothing to do with `api-contract-demo`'s route and
schema changes. This is the "may be no change — that's a valid finding" case the
verification checklist calls out (§H2), reported honestly rather than forced into a result.

## Delivery log

| Phase | Record |
|---|---|
| Implementation | `response-schema` / `deprecation-policy` authored + created via the real API; `repo-conventions` created live from `conventions-demo` and linked (§11.4). |
| Validation | 3× baseline + 3× skilled + 1× close-the-loop, all real LLM calls against the real PR, findings and trace excerpts recorded above verbatim (no cherry-picking). |
