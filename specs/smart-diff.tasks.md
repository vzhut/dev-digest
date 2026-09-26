# Task cards — Smart Diff (spec: `specs/smart-diff.md`)
Read the card for your task ID. Read the spec's `## Design` section only when the card points you to it. Run the tasks one at a time: T1 → T2 → T3 → T4. T5 runs any time before T6.

## T1 — Contract, i18n, classifier (A+B)
- **Executor / Type / Depends-on / Risk:** implementer / server core + contract + client i18n / none / low
- **Fixed decisions:**
  - `SmartDiffRole = z.enum(['core','tests','wiring','docs','boilerplate'])` goes in both `brief.ts` copies. Change only that line; the two files must stay byte-identical.
  - Classification order is boilerplate > tests > wiring > docs > core, and the first match wins.
  - Display order `SMART_DIFF_ROLE_ORDER` is core, tests, wiring, docs, boilerplate.
  - Glob semantics:
    - Basename at any depth: `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `*.snap`, `*.generated.*`, `*.min.js`, `*.test.ts(x)`, `*.it.test.ts`, `*.spec.ts`, `index.ts`/`index.js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`, `*.md`, `README*`, `CHANGELOG*`, `LICENSE`.
    - Root-anchored: `dist/`, `build/`, `docs/`, `.github/`, `.claude/`, `e2e/`.
    - Directory segment at any depth, including root: `test/`, `tests/`, `__tests__/`, `__snapshots__/`.
  - Normalize the path first: `\` → `/`, and strip a leading `./`. Unmatched paths are `core`. Don't add a glob dependency.
  - Disputed cases:
    - `__tests__/__snapshots__/x.snap` → boilerplate.
    - `.claude/skills/security/SKILL.md` → wiring.
    - `e2e/README.md` → tests. Keep this and document why: the tests rule precedes docs.
  - i18n keys to add under `prReview.smartDiff`: `testsLabel` "Tests", `docsLabel` "Docs", `smartOrder` "Smart order", `originalOrder` "Original order".
- **Owned paths:** `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, `client/messages/en/prReview.json`, `server/src/modules/reviews/smart-diff/classify.ts`, `server/src/modules/reviews/smart-diff/constants.ts`, `server/test/smart-diff-classify.test.ts`, `server/test/contracts.test.ts` (optional 5-role case)
- **Action:**
  1. Write the `it.each` path → role table first: ≥ 1 row per pattern, plus the 3 disputed rows, each with a comment.
  2. Update the contract and the i18n keys.
  3. Write `constants.ts`: `SMART_DIFF_ROLE_ORDER` and `CLASSIFY_RULES` (ordered `{role, patterns: RegExp[]}`, with a doc comment per rule). Note that treating a basename `index.ts` as wiring is an accepted limitation.
  4. Write `classify.ts` exporting `classifyFile(path): SmartDiffRole`.
- **Traps that apply:**
  - Never sync whole vendor files; the client copy lags on purpose (`INSIGHTS.md:51`).
  - Use `.js` extensions on server relative imports.
  - `smart-diff/*` must not import fastify, drizzle, `db/*` or `container`.
- **Acceptance:**
  - The two `brief.ts` copies show no difference in `diff`.
  - From `server/`: `pnpm exec vitest run --exclude '**/*.it.test.ts'` is green and `pnpm typecheck` is green.
  - From `client/`: `pnpm typecheck` is green.
  - `grep -nE "fastify|drizzle|db/|container" server/src/modules/reviews/smart-diff/*.ts` prints nothing.
- **Design pointer:** none

## T2 — GET /pulls/:id/smart-diff (C)
- **Executor / Type / Depends-on / Risk:** implementer / server backend / T1 / medium
- **Fixed decisions:**
  - Put pure functions in `smart-diff/build.ts`:
    - `buildSmartDiff(files: {path,additions,deletions}[], findings: {file,start_line}[]): SmartDiff`
    - `latestReviewFindings(rows)`
  - Groups follow `SMART_DIFF_ROLE_ORDER`, and empty groups are omitted. Files within a group are sorted by path.
  - `finding_lines` holds the unique ascending `start_line` values where `finding.file === path`. Omit `pseudocode_summary`.
  - `split_suggestion = {too_big:false, total_lines: Σ(additions+deletions), proposed_splits:[]}`.
  - "Latest review" means the newest row with `kind === 'review'` (`reviewsForPull` is newest-first). Dismissed findings are included.
  - Service: `ReviewService.smartDiff(workspaceId, prId)` calls `repo.getPull`, and throws `NotFoundError('Pull request not found')` if the PR is missing. It then calls `repo.getPrFiles`, then `repo.reviewsForPull`, and maps rows to plain inputs before calling `buildSmartDiff`. Add no new repository method.
  - Route: `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams, response: { 200: SmartDiff } } }, …)` in `reviews/routes.ts`, as a thin handler. Add it to the header comment. It makes no LLM call.
- **Owned paths:** `server/src/modules/reviews/smart-diff/build.ts`, `server/src/modules/reviews/service.ts`, `server/src/modules/reviews/routes.ts`, `server/test/smart-diff-build.test.ts`, `server/test/smart-diff.it.test.ts`
- **Action:** Implement the above, then the tests.
  - Unit tests: group order, empty groups omitted, dedup and sort of lines, `total_lines`, the no-review case, latest-review-only, and summary-kind reviews ignored.
  - `.it` tests with Testcontainers: 404 for an unknown or other-workspace PR, 200 before any review with empty `finding_lines`, and 200 after inserting a review with findings.
- **Traps that apply:**
  - `getPrFiles` has no ORDER BY (`server/src/modules/reviews/repository/pull.repo.ts:28-33`).
  - `reviewsForPull(prId)` is not workspace-scoped, so `getPull(workspaceId, …)` must come first.
  - `.it` tests must inject fail-fast LLM stubs (`server/INSIGHTS.md:203`).
  - Throw `AppError` subclasses; never call `reply.status`.
- **Acceptance:**
  - `pnpm exec vitest run --exclude '**/*.it.test.ts'` and `pnpm typecheck` are green.
  - `grep -n "llm\|completeStructured" server/src/modules/reviews/smart-diff/*.ts` prints nothing.
  - The `.it` test is run in validation.
- **Design pointer:** spec `## Design` (sequence diagram and "Latest review")

## T3 — Client grouping + order toggle (D)
- **Executor / Type / Depends-on / Risk:** implementer / client ui / T2 / medium
- **Fixed decisions:**
  - `useSmartDiff(prId)` goes in `client/src/lib/hooks/reviews.ts`, with `reviewKeys.smartDiff(prId)` and `api.get<SmartDiff>(\`/pulls/${prId}/smart-diff\`)`.
  - Route-local `DiffTab/constants.ts`: `SMART_ROLE_ORDER`, `COLLAPSED_ROLES = ['docs','boilerplate']`, and `ROLE_LABEL_KEY` (role → `smartDiff.<role>Label`).
  - Collapsed means the whole group body; the header stays visible. Other groups render `<DiffViewer files={groupFiles}>`, whose FileCards keep the `AUTO_EXPAND_MAX_LINES` default.
  - Toggle state is `useState<'smart'|'original'>('smart')`. While the query is loading, or when it errors, render the original order.
  - `groupFiles` maps paths to `PrFile`. Unknown response paths are ignored, and PR files missing from the response are appended to `core`.
  - The group header is sticky (`position: sticky; top: 0`).
- **Owned paths:** `client/src/lib/hooks/reviews.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/**` (not `_components/InlineFinding/`)
- **Action:**
  1. Write the hook.
  2. Write `DiffTab/constants.ts` and `DiffTab/helpers.ts` (`groupFiles`, `latestReviewFindings(reviews: ReviewRecord[])` using the same rule as the server, and `filesWithFindings(files, byFile)`), with `helpers.test.ts`.
  3. Build `DiffTab/_components/SmartDiffGroup/` (chevron, label, "N files", and a dot plus count slot when the count is > 0).
  4. Add the toggle in `DiffTab`, with `DiffTab.test.tsx`.
- **Traps that apply:**
  - Use `fireEvent`; `user-event` is not installed (`client/INSIGHTS.md:77`).
  - Don't copy query data into `useState`. Use stable keys (the role or path). No hard-coded strings.
  - Use only i18n keys that already exist (T1 keys, `groupedByRole`, `filesCount`, the `*Label` keys). New keys are added in T4.
- **Acceptance:**
  - The tests show group headers in the order Core, Tests, Wiring, Docs, Boilerplate, each with "N files".
  - The docs and boilerplate bodies are hidden until their header is clicked.
  - "Original order" shows the files in `pr.files` order with no group headers.
  - `cd client && pnpm test && pnpm typecheck` is green.
- **Design pointer:** spec `## Design` (client placement bullets)

## T4 — Inline findings in the diff (E+F: P1–P3)
- **Executor / Type / Depends-on / Risk:** implementer / client ui / T3 / high
- **Fixed decisions:**
  - `components/diff-viewer` must not import `@/app/*`. Findings are injected through `findings?: DiffFindingApi = { byFile: Record<string, FindingRecord[]>; show: boolean; FindingView: React.ComponentType<{ finding: FindingRecord }> }`, which is optional next to `commenting`.
  - A finding is anchored at `lineKey('RIGHT', start_line)`, reusing `keysForLine`.
  - Findings that don't match a rendered line go to an end-of-file `OutsideFindings/` block.
  - Severity labels: CRITICAL → `smartDiff.severity.blocker`, WARNING → `warning`, SUGGESTION → `suggestion`.
  - `show` is `showComments`, so the existing toggle hides findings too. The toggle button is visible when comments + findings > 0.
  - The FileCard dot has no number, sits separate from the comment count, and has an `aria-label`.
  - The group-header count is the number of files with findings, not the number of findings.
  - Findings are the latest-review findings from `usePrReviews(prId)`. This gives live refresh after Run review, because `PrDetailView`'s `onRunDone` refetches reviews.
  - Route-local `DiffTab/_components/InlineFinding/` wraps `FindingCard` (`defaultExpanded`, collapsible) and `useFindingAction().mutate({findingId, action, prId})`.
  - New `smartDiff` keys: `filesChanged`, `filesWithFindings`, `hasFindings`, `noReviewYet`, `outsideDiffTitle`, `severity.blocker|warning|suggestion`, `toggleFindings`.
- **Owned paths:** `client/src/components/diff-viewer/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/**`, `client/messages/en/prReview.json`
- **Action:**
  1. Write `diff-viewer/findings.ts` and `findings.test.ts`.
  2. In `FileCard`, add the dot, the matched finding views under lines, and the outside block.
  3. Add the optional `findingSeverity` stripe and label on `CodeLine`.
  4. Pass the prop through `DiffViewer` and export the type from `index.ts`.
  5. Build `InlineFinding`.
  6. Wire `DiffTab`: `byFile`, `show`, the group dot and count, and the `noReviewYet` empty state.
  7. Add the i18n keys.
- **Traps that apply:**
  - Use stripe longhands only (`borderLeftColor`), never a state-dependent `borderColor` (`client/INSIGHTS.md:84`).
  - The existing `DiffViewer.test.tsx` must stay green.
  - No `dangerouslySetInnerHTML`.
  - Use `fireEvent`.
- **Acceptance:**
  - `findings.test.ts` covers matched vs outside.
  - A FileCard/DiffViewer test shows the FindingView under line N and the outside block for a line not in the patch. The dot is present with no digit, and stays visible when `show=false` (the toggle hides comments and finding cards, not the dot).
  - The DiffTab test shows:
    - Accept calls mutate with `prId`.
    - 2 findings in 1 file show as "1" on the group header.
    - The empty-state text appears when there are no reviews.
  - `cd client && pnpm test && pnpm typecheck` is green.
  - `grep -rn "@/app" client/src/components/diff-viewer` prints nothing.
- **Design pointer:** spec `## Design`

## T5 — Test PR fixtures (non-code)
- **Executor / Type / Depends-on / Risk:** parent / manual data / none / low
- **Fixed decisions:**
  - **PR-A:**
    - A lock file (→ boilerplate, large).
    - A core file with one planted bug, e.g. an off-by-one or a missing null check.
    - A matching `*.test.ts`.
    - A barrel `index.ts` plus a `*.config.*` or `tsconfig.json` (→ wiring).
    - A `README.md` or `docs/*.md`.
    - Every non-boilerplate file stays under 200 changed lines.
  - **PR-B:** `__tests__/__snapshots__/x.snap`, `.claude/skills/security/SKILL.md`, `e2e/README.md`, a `dist/` file, a `*.min.js`, `.env.example`, `.github/workflows/*.yml`, `src/test/helper.ts`, plus a finding outside the patch after a review.
- **Owned paths:** none in this repo
- **Action:** Push both PRs to the demo repo and import them.
- **Traps that apply:**
  - Open the PR detail page before reviewing, or the review sees an empty diff (`server/INSIGHTS.md:57`).
  - The PAT must be scoped to the demo repo (`server/INSIGHTS.md:230`).
- **Acceptance:**
  - PR-A shows 5 groups.
  - PR-B's edge files classify as in the T1 table.
- **Design pointer:** none

## T6 — Validation + Delivery log
- **Executor / Type / Depends-on / Risk:** parent / validation / T4, T5 / low
- **Fixed decisions:** The pipeline runs sequentially: implementer → architecture-reviewer → plan-verifier.
- **Owned paths:** `specs/smart-diff.md` (Delivery log only)
- **Action:**
  1. From `server/`, run `pnpm test` and `pnpm typecheck`.
  2. From `client/`, run `pnpm test` and `pnpm typecheck`.
  3. Run `./scripts/e2e.sh` to catch regressions.
  4. Check PR-A manually before and after Run review.
  5. Run `/pr-self-review` before pushing, then append the Delivery log.
- **Traps that apply:** none
- **Acceptance:** All commands are green, and the manual checklist is recorded in the Delivery log.
- **Design pointer:** spec `## Testing strategy`
