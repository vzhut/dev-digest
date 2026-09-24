# specs — e2e

In this package `specs/` holds **executable** specs: every `NN-name.flow.json` is
a user journey whose steps are its assertions. `./scripts/e2e.sh` runs them in
filename order against a freshly seeded, isolated stack (no LLM calls).
How to write one: `../docs/writing-flows.md`.

| Flow | Journey it guarantees | Key assertions | Behaviour spec it covers |
|---|---|---|---|
| [`01-app-boot`](01-app-boot.flow.json) | The app boots and redirects to a repo's PR list | URL `/pulls`, "Pull Requests" heading | — |
| [`02-repo-pulls-detail`](02-repo-pulls-detail.flow.json) | PR list → preview findings → open the PR | hover the FINDINGS icons of #482 → tooltip reads `2 FINDINGS IN THIS RUN` and previews the WARNING finding → Escape → click the row → `/pulls/482` shows the title | [`../../specs/findings-popover.md`](../../specs/findings-popover.md) (PR list surface) |
| [`03-agents`](03-agents.flow.json) | The agents page lists the seeded reviewers | "Security Reviewer" card | — |
| [`04-pr-findings`](04-pr-findings.flow.json) | A PR's review run shows the verdict and findings, and filters by severity | `tab=findings`, "request changes", "2 findings", seeded card; click the CRITICAL pill → list named `1 finding shown`; click again → `2 findings shown` | [`../../client/specs/run-severity-filter.md`](../../client/specs/run-severity-filter.md) |
| [`05-pr-diff`](05-pr-diff.flow.json) | The Files changed tab renders the seeded diff | `tab=diff`, a seeded file in the viewer | — |
| [`06-onboarding`](06-onboarding.flow.json) | The add-repository screen renders | heading + repository URL field | — |
| [`07-settings`](07-settings.flow.json) | Settings shows API Keys and Feature Models | both sections render | — |
| [`08-skills`](08-skills.flow.json) | Skills page lists seeded skills, the editor opens, Stats shows the empty state, and the agent Skills tab lists linked skills | `test-coverage-nudge`, `No runs with this skill yet`, `mocking-discipline`, `2 of` | [`../../specs/skills.md`](../../specs/skills.md) |

## Not covered by e2e (and why)

- **Timeline severity icons and popover:** the seeded review has no `run_id`, so
  seeded data has no run tiles. Covered by `client` RTL (`RunHistory.test.tsx`)
  and `server` integration (`reviews.it.test.ts`).
- **Running a real review, and cost values:** they need a model call. Covered by
  server integration tests with `MockLLMProvider`.
