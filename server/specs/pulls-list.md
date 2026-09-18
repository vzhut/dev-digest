# `GET /repos/:id/pulls` — PR list contract

Status: implemented · Handler: `src/modules/pulls/routes.ts` · Contract: `PrMeta`
(`src/vendor/shared/contracts/platform.ts`, mirrored in the client copy).

## Behaviour

1. **Scope.** 404 when the repo isn't in the caller's workspace.
2. **Sync (best effort).** With a GitHub token, upsert the repo's PRs from
   GitHub first. No token / offline / GitHub error ⇒ log a warning and serve the
   persisted rows — the endpoint never fails because GitHub is unreachable.
3. **Diff-stat backfill.** Rows with `additions = deletions = files_count = 0`
   get stats from the per-PR detail call, at most **10 per request**; the
   periodic client refetch (every 60 s) works through the rest.
4. **Derived fields per PR** — each from ONE batched query over all listed PRs
   (never N+1):

| Field | Source | `null` means |
|---|---|---|
| `status` | `deriveReviewStatus` (GitHub state + `last_reviewed_sha` vs `head_sha` + age) | — (always set) |
| `score` | latest `reviews` row with `kind='review'` (newest `created_at`) | never reviewed |
| `cost_usd` | `sum(agent_runs.cost_usd)` over `status='done'` runs | no successful priced run |
| `latest_findings` | `FindingPreview[]` of that same latest review | never reviewed (`[]` = reviewed, nothing found) |

5. `score` and `latest_findings` always describe the **same** review row, so the
   score ring and the FINDINGS popover can't disagree.

## `FindingPreview`

`id, severity, category, title, file, start_line, end_line, confidence, summary`
where `summary` is `rationale` cut to `FINDING_PREVIEW_SUMMARY_MAX` (200) chars
plus `…`. Ordered CRITICAL → WARNING → SUGGESTION, then `file`, then
`start_line`. Rejected (`dismissed_at`) and accepted findings are included.
Built by `src/modules/_shared/finding-previews.ts`.

## Edge cases

- Two reviews with the same `created_at`: the pick is arbitrary but consistent
  within one response (score and findings come from the same row).
- Failed runs never contribute to `cost_usd`, even if a legacy row carries a cost.

## Tests

`test/reviews.it.test.ts` — COST sum across successful runs; failed-only PR ⇒
`null`; no runs ⇒ `null`; FINDINGS `null` / `[]` / latest-review-only, ordered,
truncated. `test/contracts.test.ts` — `PrMeta` accepts and omits the optional fields.

Cross-package UI behaviour: `../../specs/findings-popover.md`.
