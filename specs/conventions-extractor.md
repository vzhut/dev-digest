# Conventions Extractor (L02, part 2)

Status: **planned** · Scope: cross-package — `@devdigest/shared` contracts, `server/`, `client/`, seed/docs, e2e.
Builds on [`skills.md`](./skills.md) (D8 deferred this feature until the Skills CRUD existed — it does now).

The feature reads a repository, proposes **house conventions** as evidence-backed
candidates, lets the user accept / reject / edit them, and merges the accepted
ones into a **skill** (`source: 'extracted'`) that is linked to an agent through
the existing Skills machinery. Same idea as `/insights` in Claude Code, which
proposes `CLAUDE.md` additions from chat history — here the input is the code.

Most candidates will be wrong or trivial. That is expected: the product is the
**filter** (code-side evidence checks + human review), not the model call.

---

## 1. What already exists — do NOT rebuild

| Piece | Where | State |
|---|---|---|
| `conventions` table (`rule`, `evidence_path`, `evidence_snippet`, `confidence`, `accepted`) | `server/src/db/schema/knowledge.ts:31` | **exists**, never written; too thin (§3) |
| `ConventionCandidate` Zod contract | `server/src/vendor/shared/contracts/knowledge.ts:183` (+ client copy) | **exists**, no consumers yet — free to reshape |
| `repoIntel.getConventionSamples(repoId, n)` | `modules/repo-intel/service.ts:630` | **exists**; = `getTopFilesByRank` minus junk paths (`isJunkPath`, tests/configs/migrations). Returns `[]` when `REPO_INTEL_ENABLED` is off or the repo is unindexed |
| Feature model `conventions` (Settings → Feature Models) | `contracts/platform.ts:74`, `modules/settings/feature-models.ts` | **exists**, default `openai/gpt-5.4` — not cheap (§4.3) |
| `GitClient.readFile / currentHead / clonePathFor` | `vendor/shared/adapters.ts:205` | **exists** — the only way to read the clone |
| `LLMProvider.completeStructured` + `MockLLMProvider.structuredBySchema` | `adapters/mocks.ts:49` | **exists** — mock already anticipates a multi-call `Convention*` dialogue |
| Skills CRUD, versions, `source: 'extracted'`, `evidence_files`, agent linking (`POST /agents/:id/skills`) | `modules/skills/`, `modules/agents/` | **exists** |
| `activeKeyFor` already maps `/conventions` → `"conventions"` | `client/src/components/app-shell/helpers.ts:31` | **exists** |
| Trust split: `extracted` bodies are trusted instructions | `skills.md` D4 | **exists** |

**Missing** — the actual work: the `conventions` server module, a migration, the
sampler, the evidence verifier, the skill composer, the `/repos/:repoId/conventions`
UI + nav entry, i18n, tests, e2e, and a quality report.

---

## 2. Agreed decisions

| # | Decision | Consequence |
|---|---|---|
| C1 | Approved candidates merge into **one** skill, default name `repo-conventions`. One skill per category is a stretch (§10). | Composer is a pure function `(accepted[]) → body`. |
| C2 | **One** structured LLM call on the `conventions` feature model. Default is changed to the cheap seed model (`openrouter` / `deepseek-v4-flash`). | Edit `FEATURE_MODELS` in **three** places: both `shared` copies **and** the client's own duplicate `client/src/lib/feature-models.ts:43` (checked: it repeats `openai/gpt-5.4`). An existing workspace override still wins. |
| C3 | Evidence links are **blob URLs pinned to the clone's HEAD sha**: `https://github.com/{owner}/{repo}/blob/{sha}/{path}#L{a}-L{b}`. | `sha` is stored per scan; the server builds `evidence_url`, the client never assembles it. |
| C4 | Sample selection is **code only** — no model chooses files. | Configs + `getConventionSamples(repoId, 12)`; the legacy `ConventionFileSelection` step is not used. |
| C5 | Evidence is **verified by code**; unverifiable candidates are dropped and counted, never shown. | §5. The drop counts feed the quality report (§9). |
| C6 | The experiment (API Contract Reviewer) is a section of this spec (§11), reusing `skills.md` §7–8. | No second spec. |

### Resolved (were open questions)

| # | Decision | Consequence |
|---|---|---|
| C7 (was O1) | New candidates arrive **`pending`**; header shows `0 of N accepted` + *Select all*. | Deliberate deviation from the mockup, which pre-accepts ("3 of 3 accepted"): pre-accepting invites rubber-stamping and most candidates are meant to be rejected. |
| C8 (was O2) | Extract is **synchronous** with a spinner. | Move to a `JobRunner` job + polling only if the quality run (§9) shows timeouts. |
| C9 (was O3) | On a name clash the modal offers **rename** or **update the existing skill** (new `skill_versions` row). | Same as import (`skills.md` §5.3); re-scanning updates the skill instead of duplicating it. |
| C11 (extras) | In scope: **run on the author's work repo** and **one** quality improvement, chosen from §10 after that run. Out of scope: import from URL, packaging as a Claude Code plugin. | Slice 7 includes the work-repo run; slice 9 is the chosen improvement. |
| C12 (edit UX) | Each card has three **labelled buttons: Accept, Reject, Edit** (criterion 47). Edit switches the card to **inline** editing (Enter saves, Esc cancels, then an `edited` chip) — criterion 49. The mockup has no Edit button; it is an addition required by the user story. | Rule and category are editable; snippet and evidence are not. |
| C13 (link on create) | Creating the skill also **links it to an agent** (criterion 42): the modal has an *Attach to agents* multi-select (default: none preselected, all agents listed). It uses the existing `agent_skills` link; the skill is appended last in each agent's order, `enabled: true`. | `POST …/conventions/skill` takes `agent_ids?: string[]`. The post-create toast still deep-links to the agent's Skills tab. |
| C14 (name) | The default skill name is exactly **`repo-conventions`** (criterion 42). On a clash the modal offers rename/update (C9); a `<repo>-conventions` name is only a *suggestion* for the rename. | The first skill created in a fresh DB is always `repo-conventions`. |
| C15 (buttons) | Two separate buttons: **Run Scan** (shown until a scan exists) and **ReScan** (shown afterwards) — criterion 45. | Not "Run analysis" / "Re-scan". |
| C16 (Create skill visibility) | **Create skill** is *hidden* until ≥ 1 candidate is accepted (criterion 50), not merely disabled. | |
| C10 (was O4) | The experiment uses a **real GitHub repo** (small test repo or fork with a Fastify service) and a real PR. | Needs the author's GitHub token and repo; the PR renames a response field / changes a route signature (§11.3). |

---

## 3. Data model

One migration, generated with `pnpm db:generate` (never hand-written).

```ts
// server/src/db/schema/knowledge.ts — conventions (reshape; table is empty everywhere)
conventions: {
  id, workspaceId, repoId (NOT NULL now),
  scanId:        uuid → convention_scans.id  ON DELETE CASCADE,
  category:      text enum ['naming','structure','error-handling','typing','testing','imports','api','style','other'],
  rule:          text NOT NULL,          // user-editable
  ruleOriginal:  text NOT NULL,          // what the model said; lets the UI show "edited"
  evidencePath:  text NOT NULL,
  evidenceLineStart: integer NOT NULL,
  evidenceLineEnd:   integer NOT NULL,
  evidenceSnippet:   text NOT NULL,      // read from the file by code, never from the model
  confidence:    doublePrecision NOT NULL,
  status:        text enum ['pending','accepted','rejected'] NOT NULL default 'pending',
  fingerprint:   text NOT NULL,          // normalised rule hash — dedup across re-scans (§4.5)
  createdAt, updatedAt,
}
// replaces the boolean `accepted`; unique (repo_id, fingerprint)

convention_scans: {
  id, workspaceId, repoId,
  sha:            text NOT NULL,         // clone HEAD at scan time (C3)
  sampleFiles:    integer NOT NULL,      // files sent to the model
  rawCount:       integer NOT NULL,      // candidates the model returned
  keptCount:      integer NOT NULL,
  dropped:        jsonb  NOT NULL,       // { no_file, bad_range, quote_mismatch, duplicate, low_confidence, ... }
  model:          text NOT NULL,         // "provider/model"
  costUsd:        doublePrecision,
  createdAt,
}
```

`accepted` → `status` is safe: nothing writes or reads the column today
(`git grep conventions server/src` shows only the schema). Repo delete cascades to both tables.

## 4. Server — new module `server/src/modules/conventions/`

Files per convention: `routes.ts`, `service.ts`, `repository.ts`, `helpers.ts` (pure),
`constants.ts`. One import + one entry in `modules/index.ts`. Layering per `onion-architecture`:
routes parse/authorise, service owns the rules, repository owns Drizzle, helpers are pure.
Workspace scoping on **every** query (join through `repos.workspace_id`).

### 4.1 Routes

| Method | Route | Behaviour |
|---|---|---|
| `POST` | `/repos/:id/conventions/extract` | run a scan (§4.2–4.5); returns `{ scan, candidates }`. 409 if the repo has no clone yet |
| `GET` | `/repos/:id/conventions` | latest scan + all its candidates (`pending`/`accepted`/`rejected`) |
| `PATCH` | `/repos/:id/conventions/:cid` | `{ status?, rule? }` — accept / reject / edit. Empty `rule` → 422 |
| `POST` | `/repos/:id/conventions/skill-draft` | accepted candidates → `{ name, description, type, body, evidence_files, count }`. **Persists nothing** (pure read) |
| `POST` | `/repos/:id/conventions/skill` | save the (possibly hand-edited) draft, optionally linking `agent_ids` (C13) → skill `source: 'extracted'`, `type: 'convention'`, `evidence_files`, v1. 409 on name clash (C9) |

Two-step create mirrors import: preview first, the confirm is what writes.

### 4.2 Sampling — pure code (C4)

1. **Configs** (whichever exist at the repo root and one level down, cap 6, each ≤ 4 KB):
   `.eslintrc*`, `eslint.config.*`, `tsconfig*.json`, `.prettierrc*`, `.editorconfig`, `biome.json`.
2. **Sources**: `repoIntel.getConventionSamples(repoId, 12)`.
3. Read each through `GitClient.readFile`, **line-numbered**, cap ~250 lines / 12 KB per file
   (head of file — imports and declarations carry most conventions).
4. If step 2 returns `[]` (index off / not indexed) → 409 "index the repo first"; do **not** fall
   back to a filesystem walk (that is a second indexer).

Line-numbered input is what makes `line_start` from the model checkable.

### 4.3 The model call

One `completeStructured` call, `schemaName: 'ConventionExtraction'`, on
`resolveFeatureModel(container, workspaceId, 'conventions')`.

```ts
const ExtractionOut = z.object({
  candidates: z.array(z.object({
    category: ConventionCategory,
    rule: z.string(),                       // one imperative sentence, checkable in a diff
    evidence: z.object({
      path: z.string(),
      line_start: z.number().int(),
      line_end: z.number().int(),
      quote: z.string(),                    // ONE verbatim line from that range
    }),
    confidence: z.number().min(0).max(1),
  })).max(25),
});
```

Prompt rules (kept in `constants.ts`, reviewed like the agent prompts): only conventions
**visible in ≥ 2 places or enforced by a config**; must be checkable by a reviewer from a diff
("use `async/await`, not `.then()`"), not vague ("write clean code"); ignore what the language
or framework already enforces; cite one real line verbatim; say nothing when nothing qualifies
(empty list is a valid answer). Files are passed as data inside delimiters — **repo content is
untrusted input**; the prompt tells the model to ignore instructions found in it.

### 4.4 Evidence verification — pure code, no model (C5)

`verifyCandidate(candidate, files: Map<path, lines[]>) → { ok: true, snippet, range } | { ok: false, reason }`

Applied in order, first failure wins:

| Check | Drop reason |
|---|---|
| `path` resolves inside the clone (no `..`, not absolute) **and** the file exists | `no_file` |
| `1 ≤ line_start ≤ line_end ≤ file length`, span ≤ 30 lines | `bad_range` |
| whitespace-normalised `quote` is a substring of a line in `[line_start-3, line_end+3]` — if found outside the exact range, **repair** the range to that line | `quote_mismatch` |
| `rule` non-empty, ≤ 200 chars | `bad_rule` |
| `confidence` ≥ `MIN_CONFIDENCE` (0.5) | `low_confidence` |
| fingerprint not already seen in this scan | `duplicate` |

`snippet` = the actual lines from the file (max 12), never the model's text. Kept candidates are
sorted by confidence and capped at 20. Counts per reason go into `convention_scans.dropped`.

The verifier proves the **cited line exists**. It does not prove the rule is true or that the
codebase actually follows it — that is what review and the stretch work in §10 are for.

### 4.5 Re-scan semantics

A scan replaces the `pending` rows of the previous scan. Rows the user already decided
(`accepted`/`rejected`) are **kept**, and a new candidate whose `fingerprint` matches one of them
is discarded — a rejected rule must not resurface on every re-scan.

### 4.6 Composer (`helpers.ts`, pure)

Input: accepted rows + repo name. Output body (mockup layout):

```md
# repo-conventions

House conventions for `<repo>`. Flag changes that violate any rule below and cite the offending `file:line`.

## <slug of rule>
<rule>

Detected in `src/api/users.ts:23-31`:
```ts
<snippet>
```
```

`rejected`/`pending` never enter the body (acceptance criterion). Default description:
`N house conventions extracted from <repo>`. `evidence_files` = unique evidence paths.
Snippets are fenced so they read as data, not instructions.

### 4.7 DTO

`ConventionCandidate` is reshaped **additively where possible** and mirrored into **both**
`@devdigest/shared` copies (do not sync whole files — the client copy lags):

```ts
export const ConventionCategory = z.enum([...]);
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export const ConventionCandidate = z.object({
  id, category, rule,
  edited: z.boolean(),                       // rule !== ruleOriginal
  evidence_path, evidence_line_start, evidence_line_end, evidence_snippet,
  evidence_url: z.string().url(),            // built server-side from repo + scan.sha (C3)
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,                  // replaces `accepted`
});
export const ConventionScan = z.object({ id, sha, sample_files, raw_count, kept_count, dropped: z.record(z.number()), model, cost_usd: z.number().nullable(), created_at });
export const ConventionsResponse = z.object({ scan: ConventionScan.nullable(), candidates: z.array(ConventionCandidate) });
```

---

## 5. Client

Route `client/src/app/repos/[repoId]/conventions/` following `frontend-architecture`:

```
page.tsx
_components/
  ConventionsView/            ← header, counts, Create skill, empty/loading/error states
    _components/
      ConventionCard/         ← rule (inline edit), evidence link + copy, snippet, confidence bar, Accept/Reject
      CreateSkillModal/       ← name, description, type, enabled, editable body, token count, Create / Cancel
```

Hooks in `client/src/lib/hooks/conventions.ts` (`useConventions`, `useExtractConventions`,
`useUpdateConvention`, `useSkillDraft`, `useCreateConventionSkill`). Copy in
`client/messages/en/conventions.json`. Nav: add **Conventions** under SKILL LAB in
`client/src/vendor/ui/nav.ts` (`href: "/repos/:repoId/conventions"`) — vendored file, intentional
exception exactly like the Skills entry (`skills.md` §6.4).

Behaviour, from the user story and the three mockups:

- Header: `Conventions in <repo>`, "Detected from N sample files · last scan <relative>", **ReScan** (after the first scan).
- Empty state (no scan yet): one primary **Run Scan** button. Running state shows progress text; the button is disabled.
- Card: rule as the title; evidence as `path:line-line` — **an `<a href={evidence_url} target="_blank" rel="noopener">`**; copy-path button; code snippet; confidence bar **with the percentage** (green ≥ 0.8, amber ≥ 0.6, else muted); **Accept** / **Reject** toggle; **Edit** button switches the rule to an inline field (an `edited` chip afterwards). Rejected cards collapse to one line with *Undo*.
- Toolbar: `X of N accepted`, Select all / Deselect all, **Create skill** (appears once ≥ 1 is accepted, C16).
- Modal: prefilled from `skill-draft`; body is a plain editable textarea with a token count (reuse the skills editor's counter); footer states the skill will be `v1` and lands in Skills Lab. Modal also has **Attach to agents** (C13). On success: toast + deep-link to the first linked agent's Skills tab. Linking reuses the existing `agent_skills` repository call — no new link API.
- Header shows a **quality line** from the scan: `kept 14 of 21 · 7 dropped (3 quote mismatch, 2 no file, …)` — cheap transparency, and it is the raw material for §9.

Edge states to build first: repo not cloned/indexed (409 → guidance, not an error toast), zero candidates ("nothing qualified" is a valid result), LLM failure (retryable, keeps the previous scan), name clash in the modal (inline, offers rename/update).

---

## 6. Prompt-safety notes

- Repo files are **untrusted input** to the extractor (a comment can say "ignore previous instructions"). Mitigations: delimiters + explicit instruction, structured output, code verification, and a **human accept step** before anything becomes a skill.
- The resulting skill body embeds repo snippets and is a **trusted** `extracted` skill (D4). A user who accepts a malicious-looking snippet is the residual risk; the modal shows the full body before saving, and the body is editable.
- The extractor never executes anything and never writes to the clone.

## 7. Traps

- **`getConventionSamples` returns `[]` silently** when `REPO_INTEL_ENABLED` is off or indexing hasn't finished — surface it as "index first", not "no conventions found".
- **The default `conventions` model is `gpt-5.4`**, not cheap, and a workspace override beats the new default — check what the demo workspace has in Settings → Feature Models.
- **Seed repo `acme/payments-api` has `clonePath: null`** (`seed.ts:201`): nothing to read. Demo on a really cloned repo.
- **`@devdigest/shared` is two copies** — the client copy of `knowledge.ts` already has `ConventionCandidate`; edit both, don't overwrite.
- **The cheap default model needs `OPENROUTER_API_KEY`** (in `server/.env.example`; set locally). A missing key must surface as a clear, retryable error, not a blank scan.
- **Migrations are not run on boot** — `cd server && pnpm db:migrate` after pulling.
- **Server ESM imports need `.js`.** `.it.test.ts` for anything touching Postgres.
- **Blob URLs need `owner/name` from the repo row and a `sha` that exists on GitHub.** A local-only commit produces a 404 link — the clone tracks `origin`, so use its HEAD, and say so in the tooltip.
- **Line numbers drift** if the model is given files without numbers or truncated mid-file; the verifier only trusts what it can re-read.
- **Name uniqueness**: skills are unique per workspace, so a second repo's `repo-conventions` collides — default to `repo-conventions`, fall back to `<repo>-conventions` in the draft.
- **Do not add a linter/formatter** to satisfy "style" candidates; typecheck + tests are the gate (`AGENTS.md`).

## 8. Suggested slices

**Prerequisite:** [`skills-lab-completion.md`](./skills-lab-completion.md) is done and committed on `lesson-02-laba`; this branch (`lesson-02-homework`) starts from that commit. The Create-skill modal, confirm modal, card and nav pieces from the lab are reused here.

Each slice type-checks and has tests; commit separately on `lesson-02-homework`.

| # | Slice | Touches |
|---|---|---|
| 1 | Migration (`conventions` reshape + `convention_scans`) + contracts in **both** copies + cheap default model | `db/schema/knowledge.ts`, `knowledge.ts` ×2, `platform.ts` ×2 |
| 2 | Pure core: sampler helpers, `verifyCandidate`, fingerprint, composer — with unit tests | `modules/conventions/helpers.ts` |
| 3 | Repository + service + `POST extract` / `GET` (mock LLM in tests) | `modules/conventions/`, `modules/index.ts` |
| 4 | `PATCH`, `skill-draft`, `skill` (creates `extracted` skill, name clash) | same |
| 5 | Client: hooks, page, cards, accept/reject/edit, evidence links | `app/repos/[repoId]/conventions/`, `lib/hooks/`, i18n |
| 6 | Client: Create-skill modal + nav entry + deep-link to agent | `CreateSkillModal/`, `vendor/ui/nav.ts` |
| 7 | Seed scan + 3 candidates, e2e flow, quality run on ≥ 3 repos incl. the work repo → report (§9) | `seed.ts`, `e2e/specs/09-conventions.flow.json`, `docs/` |
| 8 | Homework experiment: author 4 API-contract skills, link them (one via import), rerun on the lab's real PR, then run with `repo-conventions` (§11) | `docs/skill-fixtures/`, seed/docs |
| 9 | The one quality improvement chosen from §10 after slice 7 (C11) | `modules/conventions/` |
| 10 | **Deliverables**: demo video (Extractor → linked skill → both experiments), PR description with the quality report, `pr-self-review` run **by hand** before the PR (hook is off, L9), typecheck + tests of every touched package, INSIGHTS pass, Delivery log filled (`AGENTS.md` workflow §4–5) | this spec, PR |

## 9. Tests & the quality report

| Package | What |
|---|---|
| `server` unit | `verifyCandidate`: missing file, `../` traversal, absolute path, range out of file, quote outside range → repaired vs dropped, oversize span, duplicate fingerprint, low confidence. Composer: only `accepted` in body, order by confidence, slug collisions, empty set. Sampler: caps, numbering, config discovery. Re-scan: decided rows survive, matching fingerprints discarded |
| `server` `.it.test.ts` | extract → persisted rows + scan counts (mock LLM via `structuredBySchema`); index-off → 409; workspace isolation; `PATCH` edit sets `edited`; `skill` creates `source: 'extracted'` with `evidence_files`; rejected candidate absent from the created skill body; repo delete cascades |
| `client` | `ConventionCard` (accept/reject/edit, link `href` equals `evidence_url`, rejected collapses), `ConventionsView` (empty / running / zero results / 409), `CreateSkillModal` (prefill, edit, clash) |
| `e2e` | **Cannot run extract**: the e2e stack has no LLM key and the seeded repo has no clone (`e2e/AGENTS.md`). Instead the seed adds one scan + 3 candidates for `acme/payments-api` (the mockup's), and `09-conventions.flow.json` covers accept / reject / edit → Create skill → skill visible in `/skills` without the rejected rule. Extraction itself is covered by the server `.it.test.ts` with the mock LLM |

**Quality report** (goes into the PR description). Run on ≥ 3 repos, including one real work
repo. Per repo record: files sampled, raw / kept / dropped-by-reason, model + cost, then a human
verdict on every kept candidate: **useful** (would make it a skill rule) / **true but trivial** /
**wrong**. Report precision = useful ÷ kept, and the drop-reason histogram. That table is the
evidence for which §10 improvement to build next.

Done — [`conventions-extractor-quality-report.md`](./conventions-extractor-quality-report.md):
live run on `conventions-demo` (purpose-built), `api-contract-demo` (a genuine zero-result),
and `dev-digest` itself (work repo, C11). Aggregate precision 0.50 (7/14 useful); every drop
reason was 0 this round (already covered directly by the unit tests). The report picks §10
improvement #1 for slice 9, backed by two live findings: confidence never discriminated
useful from trivial (0.90–1.00 across the board), and every "trivial" verdict traced back to
a config-file citation the prompt already tells the model to skip.

## 10. Product improvements (extra task) — ranked by value ÷ effort

1. **Measure support in code, not by model guess.** For each kept rule the model also proposes a
   literal/regex or ast-grep pattern for the *convention* and for its *violation*; code counts
   both across the clone (`ripgrep` / `@ast-grep/napi` adapters already exist). Show
   "followed in 41 of 44 places" and replace the model's self-reported confidence with the measured
   ratio. Rules with weak support drop out; this is the single biggest quality lever. Effort: M.
2. **Mine the review history we already store.** Recurring reviewer comments and findings the user
   *accepted* are real conventions by construction; dismissed ones are anti-conventions. Feed the
   top recurring ones into the prompt as seeds. New input, no new indexing. Effort: M.
3. **Read what teams already wrote.** `AGENTS.md` / `CLAUDE.md` / `CONTRIBUTING.md` / PR template
   → extract stated rules, then verify each against the code (finds *stale* docs too). Effort: S.
4. **Better samples.** Rank ≠ representativeness: stratify by top-level directory / layer
   (server module vs client component), add recently changed hot files (`git log` is on
   `GitClient`), add one test file per area. More diverse input → more distinct findings. Effort: S.
5. **Feedback loop.** Rejected fingerprints go into the next prompt as "already rejected — do not
   propose"; accepted ones as positive examples. Effort: S (data is already in `conventions`).
6. **New deterministic signals in `repo-intel`** (the harder path from the brief): identifier-case
   histogram per symbol kind (naming conventions without an LLM), import-layer matrix from
   `file_edges` (architectural boundaries: "server routes never import repositories"), file
   placement patterns, commit-message style from `git log`. Effort: L.
7. **Two-pass extraction** (per-category prompts, then a merge/dedup pass) when one call misses
   categories. Only worth it if the quality run shows single-call recall is the bottleneck. Effort: M.
8. **Many skills** — one per category (`naming`, `error-handling`, …), each linkable to the agent
   it fits. The composer already groups by category; the modal needs a multi-draft view. Effort: M.
9. *(out of scope, C11)* **Import a skill from a URL** and **package a skill as a Claude Code plugin**
   (`plugin.json` `1.0.0` + `marketplace.json` in a git repo) — the extra tasks from the brief.
   URL import needs the same trust treatment as `.zip` (`imported_url`, disabled, preview first). Effort: M each.

Run the extractor on the author's own work repo *before* choosing among 1–6 — the histogram of
what came out wrong decides the order.

## 11. API Contract Reviewer experiment

Reuses `skills.md` §7 (agent, seed) and §8 (control design). The **PR source, the clean-baseline procedure and the 3-run protocol** are defined once in [`skills-lab-completion.md`](./skills-lab-completion.md) §3 and reused here — the same real repo and PR. Only what is **new** is below: the four-skill set.

Done — [`conventions-extractor-experiment-report.md`](./conventions-extractor-experiment-report.md):
`response-schema` + `deprecation-policy` created, `breaking-change-checklist` (already
imported from the lab) + `api-contract-gate` linked alongside them, all 4 on API Contract
Reviewer. Live on PR #1, 3× each side: baseline is inconsistent (full/bundled/missed across
the 3 runs), all 4 skills are 3/3 consistent — every run cites all three breaking changes
distinctly with old→new in the title and scores 0. §11.4 (closing the loop with
`repo-conventions`, extracted live from `conventions-demo`) is a genuine, verified-in-trace
"no change" — expected, since that skill's rules are unrelated to this PR's changes.

### 11.1 What exists vs what is missing

| Wanted skill | State |
|---|---|
| `breaking-change` | partly: seeded `api-contract-gate` (manual) + import fixture `breaking-change-checklist` (`docs/skill-fixtures/`) |
| `semver-discipline` | partly: `references/semver-for-apis.md` inside that fixture |
| `response-schema` | **missing** |
| `deprecation-policy` | **missing** |

Each skill needs a **directive description** ("Apply when the diff …") and a **good / bad
example**. Author them as files under `docs/skill-fixtures/<name>/SKILL.md` so they are
reviewable and importable; the DB stays the runtime source of truth.

### 11.2 Wiring (all through the UI, per the brief)

- Create `response-schema` and `deprecation-policy` in the Skills UI (manual).
- Import `breaking-change` (and/or `semver-discipline`) through **Import** — at least one skill
  travels the whole preview → confirm path. Imported skills land **disabled**: enable by hand.
- Link all to *API Contract Reviewer* in its Skills tab; order = block order in the prompt.
- The baseline must be clean — disable every skill on the agent and confirm in the trace (lab spec §3).

### 11.3 The experiment (real GitHub repo, C10)

Reuse **PR #1** (`skills-lab-completion.md` §4.1) as-is: it renames `cost_usd` → `costUsd`, removes `tokens_out`
with no deprecation, and moves `GET /runs/:id` → `GET /v2/runs/:runId` — three distinct breaking changes in one
diff, enough for `breaking-change`, `response-schema`, `semver-discipline` and `deprecation-policy` to each cite
something real. **This is not the lab's blindness experiment** (that already ran on PR #4, where a bare model
missed a subtle enum change and the skill caught it, 0/6 vs 4–6/6 — see the lab spec §4). On PR #1 a bare model
already flags *something* most of the time (calibrated 7/8 runs, lab spec §4) — that's fine here: the homework
criterion is that all four skills together produce a **fuller, correctly-classified** review (which change is a
major-version break vs which needs only a deprecation notice), not that the baseline is silent.

| Measure | Baseline (no skills) | With all 4 skills |
|---|---|---|
| findings citing file:line and before/after | recorded, may already be non-empty | required for every distinct breaking change |
| severity/semver classification (major vs deprecation-eligible) | usually absent or generic | required — this is what `semver-discipline` and `deprecation-policy` add over a bare model |
| cost / tokens (from run trace) | recorded | recorded |

Run each side **3×** and record what's found, the same honest-reporting discipline as the lab spec: don't force
a 0/3-vs-3/3 narrative the data doesn't support.

### 11.4 Then close the loop

Run the Conventions Extractor's output skill (`repo-conventions`) on the same agent and note
whether it changes the result — this is the "generated skill can be linked and run on review"
acceptance line.

## 12. Acceptance checklist

Straight from the brief — each must be demonstrable on camera:

1. **Run Scan** on a real cloned repo shows candidates on the UI.
2. Each candidate has evidence with real code; **clicking it opens the file on GitHub at the right lines**.
3. Accept / reject / edit work and survive a reload; re-scan does not resurrect a rejected rule.
4. **Create skill** opens the modal, body and metadata are editable, save or cancel both work.
5. The saved skill contains **only accepted** rules; a rejected rule is absent.
6. The skill is linked to an agent on create (and can also be linked from the Skills tab) and appears as its own block in a review run's trace.
7. API Contract Reviewer with skills catches the breaking change that the baseline missed (§11).
8. Deliverables: demo video (Extractor → linked skill → experiment), open PR with a good description **and the quality report (§9)**.

---

## 13. Grading criteria 38–53 — traceability

Criteria **1–37 (the lab)** are tracked in [`skills-lab-completion.md`](./skills-lab-completion.md) and must be finished and committed on `lesson-02-laba` first.
Status here: **Spec ✓** = covered by this document.

| # | Status | Where |
|---|---|---|
| 38 | Spec ✓ | §4.1 extract route; persisted in `conventions` + `convention_scans` |
| 39 | Spec ✓ | §4.2 — code only |
| 40 | Spec ✓ | §4.3 — `{category, rule, evidence{path,line}, confidence}` |
| 41 | Spec ✓ | §5 modal: editable body and metadata (name, description, type, enabled) |
| 42 | Spec ✓ (was a gap) | C13/C14 — skill `repo-conventions`, **linked to an agent on create**. Previously the spec only deep-linked |
| 43 | Spec ✓ | §11.1 — four skills, each with a directive description and a good/bad example. Only `api-contract-gate` and the import fixture exist today |
| 44 | Spec ✓ | §5 nav entry under SKILLS LAB |
| 45 | Spec ✓ (was a gap) | C15 Run Scan / ReScan |
| 46 | Spec ✓ | §5 card: rule, file, confidence % |
| 47 | Spec ✓ (was a gap) | C12 three labelled buttons |
| 48 | Spec ✓ | §4.5 re-scan keeps decisions; composer excludes non-accepted |
| 49 | Spec ✓ | C12 inline edit |
| 50 | Spec ✓ (was a gap) | C16 |
| 51 | Spec ✓ | §5 modal: explains it is created from conventions, Name/Description, Cancel/Create |
| 52 | Spec ✓ | Created via `POST /skills`-equivalent, so it shows in the Skills list; covered by the e2e flow |
| 53 | Lab ✓ + spec | Settings → Models already lists every `FEATURE_MODELS` entry incl. Conventions with a `SearchableSelect`. Runtime uses `resolveFeatureModel`, never a hard-coded model (§4.3). Only the default changes (C2) |

## 14. Risks and prerequisites

| # | Risk | Consequence / mitigation |
|---|---|---|
| R1 | **Experiment outcome is not guaranteed** — model output varies; the spec fixes the protocol, not the result. | If the baseline also catches the change, the PR is wrong for the demo — change the diff, not the criterion. |
| R2 | The real repo exists and is public: [`vzhut/api-contract-demo`](https://github.com/vzhut/api-contract-demo). The homework reuses **PR #1** (`skills-lab-completion.md` §4.1: renames `cost_usd`→`costUsd`, removes `tokens_out` with no deprecation, moves the route) — richer than the lab's own PR #4 (a single enum value), so all four homework skills have something to cite. | The lab already proved the baseline-vs-skilled gap on a subtle change (PR #4, §11.3 below); the homework's job is depth of coverage across 4 skills on one diff, not re-proving blindness. |
| R3 | The default `conventions` model needs `OPENROUTER_API_KEY` and the demo repo must be really cloned + indexed (§7). | Check before recording the video. |

Resolved: hook on `git push` is off (lab slice L9, criterion 21).

---

## Delivery log

*(Append one entry per phase as the work lands — `AGENTS.md` workflow §5.)*

| Phase | Record |
|---|---|
| Initiation | This document. Key findings: table, contract, feature-model key, sampler and `extracted` skill source all exist from Part-0/L02 (§1); API Contract Reviewer and its first skills are already seeded (§11.1). |
| Planning | C1–C16 agreed with the user; grading criteria audited against the code (§13); lab gaps moved to `skills-lab-completion.md`. No open questions. |
| Implementation | — |
| Validation | — |
| Completion | — |
