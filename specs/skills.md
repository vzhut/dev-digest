# Skills for review agents (L02)

Status: **planned** · Scope: cross-package — `@devdigest/shared` contracts,
`server/`, `client/`, `reviewer-core/`, seed, e2e.
Lesson: L02 ("Skills in the product") per [`README.md`](../README.md) roadmap.

A **skill** is a reusable, named block of review guidance (markdown) that lives
once in the workspace and is attached to many agents. It is **text only** — a
skill never executes anything, never fetches anything, and has no tools. Its
only effect is that its body is rendered into the `## Skills / rules` section of
the assembled review prompt, in the order the agent's editor defines.

---

## 1. What already exists — do NOT rebuild

Part-0 shipped the schema, the contracts and the agent-side link API. The gap is
narrower than it looks; read this table before writing any code.

| Piece | Where | State |
|---|---|---|
| `skills` table (name, description, type, source, body, enabled, version, evidence_files) | `server/src/db/schema/skills.ts` | **exists**, migration `0000_init.sql` |
| `skill_versions` table (skill_id, version, body) — PK `(skill_id, version)` | `server/src/db/schema/skills.ts` | **exists** |
| `agent_skills` link table (agent_id, skill_id, order) | `server/src/db/schema/agents.ts` | **exists**, no `enabled` column |
| `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` Zod contracts | `server/src/vendor/shared/contracts/knowledge.ts:114-199` + the client copy | **exists in both copies** |
| Agent-side link API: `GET /agents/:id/skills`, `POST /agents/:id/skills` (set-all or link-one) | `server/src/modules/agents/routes.ts` | **exists** |
| `linkedSkills` / `setSkills` / `linkSkill` / `unlinkSkill` / `skillIdsForAgent` | `server/src/modules/agents/repository.ts` | **exists** |
| Agent version snapshots already record `skills: string[]` | `repository.ts` → `snapshotVersion` | **exists** |
| `PromptParts.skills` → `## Skills / rules` section | `reviewer-core/src/prompt.ts` | **exists** |
| `ReviewInput.skills?: string[]` → passed to `assemblePrompt` | `reviewer-core/src/review/run.ts:56` | **exists** |
| `PromptAssembly.skills` slot in the persisted trace | `contracts/trace.ts:40-54` | **exists** |
| Trace drawer renders a **separate skills block** when non-null | `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:76` | **exists** |
| Full English copy for the Skills UI (list, drawer, import, preview, versions) | `client/messages/en/skills.json` | **exists** |
| `/skills` → active sidebar key `"skills"` | `client/src/components/app-shell/helpers.ts:33` | **exists** |

**Missing** — everything below is the actual L02 work:

- the `skills` module on the server (CRUD + versions + import) and its registry entry;
- the `enabled` column on `agent_skills`;
- run-executor wiring — it hardcodes `skills: null` (`run-executor.ts:437`, and
  `trace-builder.ts:61`), so no skill has ever reached a prompt;
- per-source trust handling in `assemblePrompt`;
- the whole `/skills` UI and the agent editor's **Skills** tab;
- import (.md + .zip) with preview-before-save;
- two new seeded agents and their skills;
- the sidebar nav entry.

---

## 2. Agreed decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | Skill editor ships **Config · Preview · Stats · Versions**. **No Evals tab.** | Evals needs the L06 eval pipeline — out of scope. Stats is built only from data we really hold (§3.3, §6.3); the mockup's *pull frequency* is dropped as meaningless here. |
| D2 | Per-agent disable = **new `enabled` column on `agent_skills`**. | A disabled skill stays linked and keeps its `order`. Needs one migration. |
| D3 | Import = **`.md` file and `.zip` archive**. No URL, no community catalog. | Zip is parsed in memory; only markdown is extracted; every other entry is listed in the preview as *not imported, not executed*. |
| D4 | Trust is **split by `skills.source`**: `manual` / `extracted` bodies go in as instructions; `imported_url` / `community` bodies are wrapped in `<untrusted>`. | Imported skills also land **disabled** and must be vetted + enabled by hand. |
| D5 | **Two** new agents: **Test Quality Reviewer** and **API Contract Reviewer**. | The control experiment runs on both; each gets its own prompt in `docs/agent-prompts/`. |
| D6 | Stats attribution = a **`run_skills` table written at run time**. | Honest, historically stable numbers. Attribution is *run-level*, never finding-level (§6.3). Stats start empty — seeded runs have no rows. |
| D7 | Skill **name is unique per workspace**. | `unique (workspace_id, name)` in the §3.1 migration. Import resolves a collision by rename-or-update (§5.3). |
| D8 | **Conventions extractor is out of scope**, despite README listing it under L02. | It lands later, on top of this CRUD, creating skills with `source: 'extracted'`. Nothing here blocks it. |

---

## 3. Data model

### 3.1 New migration — `agent_skills.enabled`

Two changes in one migration: the per-agent flag (D2) and a unique skill name
per workspace (D7). `skills` has **no indexes at all** today, so two skills can
silently share a name — and the name is what labels the prompt block
(`<untrusted source="skill:…">`) and the whole UI.

```ts
// server/src/db/schema/skills.ts
export const skills = pgTable('skills', { … }, (t) => ({
  nameUq: uniqueIndex('skills_workspace_name_uq').on(t.workspaceId, t.name),  // NEW (D7)
}));

// server/src/db/schema/agents.ts
export const agentSkills = pgTable('agent_skills', {
  agentId: …,
  skillId: …,
  order:   integer('order').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),   // NEW
}, …);
```

Seed must be checked for name collisions **before** this index is added, or the
migration will fail on an existing database.

Generated with `pnpm db:generate` → `pnpm db:migrate`. **Never hand-write the
SQL** (`AGENTS.md` do-not-touch). Default `true` so every existing link keeps
working unchanged.

### 3.2 Two independent switches — do not conflate

| Switch | Column | Meaning | Surface |
|---|---|---|---|
| Global | `skills.enabled` | skill is off **everywhere**, for every agent | toggle on the Skills list card / Config tab |
| Per-agent | `agent_skills.enabled` | skill is off **for this agent only** | checkbox in the agent's Skills tab |

A skill reaches a prompt **iff** `skills.enabled AND agent_skills.enabled`.

### 3.3 Run ↔ skill attribution — `run_skills` (new)

Nothing today records which skills were in a prompt, so no per-skill number can
be computed after the fact. One table fixes that:

```ts
export const runSkills = pgTable('run_skills', {
  runId:   uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.runId, t.skillId] }) }));
```

Written by `run-executor` from the list it already resolves (§5.4), so the row
set is exactly what the model saw. Unlinking a skill later does **not** rewrite
history. Second migration, alongside §3.1.

### 3.4 Versioning

Every save that **changes the body** inserts a row into `skill_versions` with
the previous body and bumps `skills.version`. Name/description/type edits do not
create a version (the body is what eval reproducibility depends on). Restore =
write the old body as a *new* version — history is append-only, never rewritten.

---

## 4. Contracts — `@devdigest/shared`

Mirror every change into **both** copies (`server/src/vendor/shared/contracts/`
and `client/src/vendor/shared/contracts/`) — `AGENTS.md` conventions. Do not
sync whole files; the client copy deliberately lags on lesson-era code.

```ts
// knowledge.ts — Skill already exists; add:

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});

// AgentSkillLink gains `enabled` and the denormalized skill for the editor list
export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  enabled: z.boolean(),        // NEW (D2)
});

// The result of parsing an upload, shown in the preview BEFORE anything is saved
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  /** Markdown files that were merged into the body. */
  included_files: z.array(z.string()),
  /** Everything else in the archive — listed, never read, never executed. */
  ignored_files: z.array(z.string()),
});
```

```ts
// Everything the Stats tab renders. Counts are over runs that really carried
// this skill (run_skills), NOT over "agents that happen to link it today".
export const SkillStats = z.object({
  used_by: z.number().int(),
  agents: z.array(z.object({ id: z.string(), name: z.string(), enabled: z.boolean() })),
  runs_30d: z.number().int(),
  findings_30d: z.number().int(),
  /** null when nothing was ever accepted or dismissed — never rendered as 0%. */
  accept_rate: z.number().min(0).max(1).nullable(),
  findings_by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
});
```

`SkillSource` already has the four values we need; `imported_url` is reused for
file/archive imports (renaming it would ripple through the schema enum).

---

## 5. Server

### 5.1 New module `server/src/modules/skills/`

Files per the naming convention: `routes.ts`, `service.ts`, `repository.ts`,
`helpers.ts`, `constants.ts`. Registered with **one import + one entry** in
`server/src/modules/index.ts` (static registry, no autoload).

| Method | Route | Behaviour |
|---|---|---|
| `GET` | `/skills` | workspace-scoped list, for the Skills page grid |
| `GET` | `/skills/:id` | one skill |
| `POST` | `/skills` | create (manual) → `source: 'manual'`, `version: 1` |
| `PUT` | `/skills/:id` | update; a changed **body** snapshots the old one + bumps `version` |
| `DELETE` | `/skills/:id` | delete; `agent_skills` rows cascade |
| `GET` | `/skills/:id/versions` | version history, newest first |
| `GET` | `/skills/:id/stats` | `SkillStats` (§6.5) — one query set over `run_skills ⋈ agent_runs ⋈ reviews ⋈ findings` |
| `POST` | `/skills/:id/versions/:version/restore` | re-apply an old body as a new version |
| `POST` | `/skills/import/preview` | multipart upload → `SkillImportPreview`. **Persists nothing.** |
| `POST` | `/skills/import` | save a confirmed preview → `source: 'imported_url'`, `enabled: false` |

Layering per `onion-architecture`: routes parse/authorize only, service holds the
rules, repository owns Drizzle. Workspace scoping on **every** query.

### 5.2 Agent-side additions

`agent_skills` already has routes; extend them for D2:

- `GET /agents/:id/skills` returns `AgentSkillLink[]` **including `enabled`**.
- `POST /agents/:id/skills` body gains a per-item form so the editor can set
  order *and* enabled in one call:
  `{ skills: [{ skill_id, enabled }] }` — index = order. Keep the existing
  `skill_ids` / `skill_id` shapes working (they imply `enabled: true`).
- `setSkills` in `repository.ts` writes the `enabled` flag alongside `order`.
- `snapshotVersion` keeps recording only **enabled** skill ids, so an agent
  version replays the prompt it actually ran.

### 5.3 Import parsing — `helpers.ts`, pure and testable

1. **`.md`** → body is the file; name from the first `# heading` (or the
   filename); `description` from the first paragraph if the user left it blank.
2. **`.zip`** → unzip **in memory**. Take `SKILL.md` as the body if present,
   otherwise the single top-level `*.md`. Optionally append other `*.md` files
   under a `## <path>` heading. **Every other entry** (`.sh`, `.py`, `.js`,
   binaries, symlinks, nested archives) goes into `ignored_files` and is never
   read.
3. **Name collision** (D7): the preview reports that the name is taken and the
   confirm step offers *rename* or *update the existing skill* — the latter
   writing a new `skill_versions` row, which is exactly how you take a newer
   release of a third-party skill.
4. Hard limits, enforced before parsing: max upload size, max entry count, max
   uncompressed total, max single-entry size — a zip bomb must fail loudly, not
   hang the API.
5. Reject path traversal (`../`, absolute paths) while enumerating, even though
   nothing is written to disk.
6. **Nothing touches the filesystem and nothing is spawned.** The parser's only
   output is a `SkillImportPreview` object.

`POST /skills/import/preview` is a pure read; the skill exists only after the
user confirms and `POST /skills/import` runs.

### 5.4 Wiring skills into the run — the actual feature

In `server/src/modules/reviews/run-executor.ts`, before `reviewPullRequest`:

```ts
const skills = await this.skillsForAgent(agent.id);   // ordered, both-enabled
```

resolved as: `agent_skills ⋈ skills` where `agent_skills.enabled` **and**
`skills.enabled`, ordered by `agent_skills.order` ascending. Pass it through:

```ts
...(skills.length > 0 ? { skills } : {}),
```

Omit-when-empty, matching how `callers` / `repoMap` are already threaded — an
agent with no skills must produce a byte-identical prompt to today.

Right after the run row is created, record the attribution (§3.3):

```ts
await this.repo.insertRunSkills(runId, skills.map((s) => s.id));
```

Write it even when the run later fails — the skills *were* in the prompt, and a
failed run's findings count is simply zero.

Then **remove the two hardcoded nulls**: `run-executor.ts:437` and
`trace-builder.ts:61` must carry the real `assembly.skills`, or the trace will
keep claiming no skills were used. Log one `runLog.info` line naming the
resolved skills so the live log shows them too.

### 5.5 Prompt assembly — `reviewer-core`

`PromptParts.skills` / `ReviewInput.skills` change from `string[]` to:

```ts
export interface PromptSkill {
  name: string;
  body: string;
  /** false → wrapped in <untrusted> (imported / community). D4. */
  trusted: boolean;
}
```

Safe to change: no production caller passes `skills` today (only
`reviewer-core/test/run.test.ts` calls the engine, and it passes none).

Rendering inside `## Skills / rules`:

- `trusted: true` → body as-is (instructions the agent follows);
- `trusted: false` → `wrapUntrusted('skill:' + name, body)`.

The existing `INJECTION_GUARD` then does the rest — it already tells the model
that everything inside `<untrusted>` is data, never instructions. Keeping this
decision **inside `prompt.ts`** is deliberate: that file is documented as the one
place injection hardening lives, and it means the CI runner gets the same
behaviour for free.

`PromptAssembly.skills` stays a single rendered string, so the trace contract and
the drawer need no change.

---

## 6. Client

### 6.1 Routes

| Route | View |
|---|---|
| `/skills` | Skills page — grid of cards; selecting one opens the editor pane beside it |
| `/skills/[id]` | same layout with that skill selected (deep link, mirrors `/agents/[id]`) |

Structure follows `frontend-architecture` exactly as `/agents` does:

```
client/src/app/skills/
  page.tsx
  [id]/page.tsx
  _components/
    SkillsListView/        SkillsListView.tsx index.ts styles.ts constants.ts helpers.ts + .test.tsx
      _components/AddSkillDrawer/     ← "create / import" (menu on the Add button)
        _components/ImportPreview/    ← included vs ignored files, confirm/cancel
    SkillCard/
  [id]/_components/
    SkillEditorView/
    SkillEditor/           ← Tabs: config | preview | stats | versions (D1), tab in ?tab=
      _components/ConfigTab/     ← name, description, type, body (markdown)
      _components/PreviewTab/    ← rendered with react-markdown
      _components/StatsTab/      ← real numbers only (§6.5)
      _components/VersionsTab/   ← list + diff + restore
```

Hooks go in **`client/src/lib/hooks/skills.ts`** (`useSkills`, `useSkill`,
`useCreateSkill`, `useUpdateSkill`, `useDeleteSkill`, `useSkillVersions`,
`useRestoreSkillVersion`, `useSkillStats`, `useImportPreview`, `useConfirmImport`) — mirroring
`hooks/agents.ts`, with the same `invalidateQueries` discipline.

### 6.2 The description field is the skill's interface

Per the requirements the **description is directive** — it tells the agent when
this skill applies, not what the skill is about. The Config tab carries that as
field help text under the input, e.g.:

> *Write it as an instruction to the agent: when does this skill apply? This is
> the interface other agents see.*

Copy goes into `client/messages/en/skills.json` (a new key — most of the file
already exists, so **read it before adding anything**).

### 6.3 Stats tab — only numbers we can stand behind

| Tile | Source | Exact? |
|---|---|---|
| **USED BY** — N agents | `agent_skills` | ✅ exact |
| **AGENTS USING THIS SKILL** + per-agent enabled state | `agent_skills ⋈ agents` | ✅ exact |
| **RUNS (30d)** | `run_skills ⋈ agent_runs` on `ran_at` | ✅ exact, from the day this ships |
| **FINDINGS (30d)** | those runs ⋈ `reviews` ⋈ `findings` | ⚠️ run-level attribution |
| **ACCEPT RATE** | `findings.accepted_at` / `dismissed_at` over the same set | ⚠️ run-level attribution |
| **FINDINGS BY CATEGORY** | `findings.category` over the same set | ⚠️ run-level attribution |
| ~~PULL FREQUENCY~~ | — | ❌ **dropped** |

**Pull frequency is dropped on purpose.** It measures whether a skill got pulled
into a prompt. Ours are statically attached, so an enabled skill is in every one
of its agent's runs — the honest value is always 100%, and the mockup's 71% has
no source. It belongs to a later lesson where skills are selected dynamically.

**The attribution caveat must be visible in the UI, not just in this file.**
A finding is produced by the whole prompt, not by one block of it. If an agent
runs with three skills enabled, all three are credited with the same findings.
So the three ⚠️ tiles sit under one line of help text, roughly:

> *Findings from runs where this skill was part of the prompt. An agent's other
> skills shared those runs — this is not a per-skill attribution.*

Rules that keep the tab from lying:

- No `run_skills` rows yet ⇒ empty state (*"No runs with this skill yet"*),
  **never zeros**. Seeded runs predate the table and have no rows.
- `accept_rate` is `null` when nothing was accepted or dismissed — render `—`,
  following the established unknown-vs-zero rule (`client/specs/run-cost-display.md`).
- The donut counts findings. The mockup shows dollar amounts per category; we
  have no per-category cost and will not invent one.

### 6.4 Agent editor → Skills tab

Add a second entry to `TABS` in
`client/src/app/agents/[id]/_components/AgentEditor/constants.ts` and render it
in `AgentEditor.tsx` (today it hardcodes `<ConfigTab/>`; it needs a switch).

The tab lists **every workspace skill**, ordered by the agent's link order with
unlinked ones after them:

- checkbox = linked **and** `agent_skills.enabled` (D2);
- drag handle = order, which is **the order of the blocks in the prompt** —
  state that in the tab's helper line, as the mockup does;
- header counter "N of M enabled";
- a filter input.

Saving issues one `POST /agents/:id/skills` with the full ordered list.

### 6.5 Sidebar nav — a deliberate vendored edit

`client/src/vendor/ui/nav.ts` has no Skills entry; `NAV` today is a single
`WORKSPACE` group. Add a `SKILLS LAB` section with a `Skills` item
(`href: "/skills"`, icon `Sparkles`, `gKey: "s"`) plus its `SHORTCUTS` row.

⚠️ `client/src/vendor/` is **do-not-touch** except for a deliberate contract
change. This is one: it is minimal, additive, and recorded here. `activeKeyFor`
already resolves `/skills`, so nothing else changes.

---

## 7. Seed — two new agents and their skills

`server/src/db/seed.ts` currently seeds three agents (General, Security,
Performance) with bodies in `seed-prompts.ts`, mirrored in
`docs/agent-prompts/*.md`. Both must be updated — the DB is the runtime source
of truth, the docs are the reviewable originals (`AGENTS.md`).

**New agents** (idempotent insert, same name-check pattern as the existing three):

| Agent | Job |
|---|---|
| **Test Quality Reviewer** | uncovered branches, missing corner cases, over-mocking, flaky patterns |
| **API Contract Reviewer** | breaking changes to route signatures, request/response shapes, status codes |

**New skills** (workspace-scoped, seeded):

| Skill | Type | Source | Linked to |
|---|---|---|---|
| `test-coverage-nudge` | `custom` | `manual` | Test Quality Reviewer |
| `mocking-discipline` | `convention` | `manual` | Test Quality Reviewer |
| `api-contract-gate` | `custom` | `manual` | API Contract Reviewer |
| `breaking-change-checklist` | `rubric` | **imported** | API Contract Reviewer |

The last one is **deliberately imported through the UI, not seeded** — the
requirement says at least one skill must travel the whole import path. Ship the
`.zip` fixture (with a decoy `install.sh` inside, so the "ignored, not executed"
list is non-empty on camera) under `docs/` or the e2e fixtures, and import it
during the demo.

Seeding must stay **idempotent** — `pnpm db:seed` runs on every `./scripts/dev.sh`.

---

## 8. Control experiment

Two PRs, each reviewed twice by the same agent — once with its skills disabled,
once enabled. Nothing else changes; the agent, model and diff are identical, so
the skills block is the only variable.

| Agent | PR under review | Without skills | With skills |
|---|---|---|---|
| Test Quality Reviewer | a test that covers only the happy path | misses it | flags the uncovered branch **and** a boundary case |
| API Contract Reviewer | a changed route signature | misses it | reports the breaking change |

Then open the run trace → prompt assembly section: the **skills block** is
visible as its own block with its token count, and the disabled run has no such
block at all. `TraceBody.tsx` already renders exactly this once §5.4 lands.

A skill's effect is not deterministic — the model may find the branch without
help. Run each side more than once before filming, and pick a diff where the
unskilled baseline is reliably silent.

---

### 8.1 Open — the demo PRs

Where the two PRs come from is **not decided**. The seed creates a fictional
`acme/payments-api`, so neither diff exists yet. Options are a pair of small PRs
in a real GitHub repo (closest to real use) or two seeded PRs with fixed diffs
(deterministic, works offline, e2e-friendly). **Decide before the Validation
phase** — nothing else in this spec depends on it.

## 9. Acceptance checklist

Straight from the requirements — each line must be demonstrable:

1. A skill is created **and** edited in the UI; the body survives a reload.
2. Both new agents have skills attached.
3. An **enabled** skill appears in the run log/trace as its own block; a
   **disabled** one does not appear at all.
4. Import went through a **preview**; the confirm step is what saves it;
   executable entries are listed as ignored and nothing was run.
5. The control experiment reproduces on both agents.
6. Skill order in the agent's Skills tab = order of the blocks in the prompt.
7. `pr-self-review` exists with auto-invocation off; invoked by hand it pulls in
   both front-end and back-end skills. *(Already true on this branch — commits
   `a39a447`…`f3bfc00`. Verify, do not rebuild.)*

---

## 10. Traps

- **`run-executor.ts:437` and `trace-builder.ts:61` hardcode `skills: null`.**
  Wire the prompt but forget these, and everything works while the trace
  silently claims no skill was used — which breaks acceptance #3.
- **`skills` has no indexes today.** Adding the unique name index to a database
  that already holds duplicates fails the migration — check the seed first (§3.1).
- **Stats attribution is run-level.** Writing `run_skills` makes the numbers
  *reproducible*, not *causal*. Presenting them as "this skill found 96 issues"
  is the one way this tab becomes actively misleading (§6.3).
- **`run_skills` starts empty.** Seeded and pre-L02 runs have no rows, so a
  fresh install shows empty states, not zeros — write the UI for that first.
- **Two `enabled` flags** (§3.2). A skill disabled globally must vanish from
  every agent's prompt even where the per-agent flag is on.
- **`@devdigest/shared` is two copies.** A contract change not mirrored into
  `client/src/vendor/shared/` type-checks on the server and fails on the client.
- **`client/src/vendor/ui/nav.ts` is vendored** — the nav entry is an
  intentional exception (§6.4), not a free edit.
- **Migrations are not run on boot.** After pulling this branch:
  `cd server && pnpm db:migrate`.
- **CI is path-filtered**, and `reviewer-core/**` changes also trigger
  `server-unit` — the `PromptSkill` type change (§5.5) must type-check in the
  server too.
- **Server ESM imports need the `.js` extension** in the new module.
- **`skills.json` i18n already exists** — read it before adding keys, or you
  will duplicate half of them under new names.
- **Zip handling is the one genuinely risky surface.** Bombs, traversal and
  nested archives are all handled by refusing, never by being clever.

---

## 11. Suggested slices

Each slice type-checks and has tests; commit them separately on `lesson-02`.

| # | Slice | Touches |
|---|---|---|
| 1 | `agent_skills.enabled` + unique skill name + `run_skills` migrations + contract changes in both copies | schema, migrations, `knowledge.ts` ×2 |
| 2 | `skills` server module (CRUD + versions) + registry entry | `modules/skills/`, `modules/index.ts` |
| 3 | `PromptSkill` + trust split in `assemblePrompt` | `reviewer-core/src/prompt.ts`, `review/run.ts` |
| 4 | Run-executor wiring + `run_skills` write + real `assembly.skills` in trace and log | `run-executor.ts`, `trace-builder.ts` |
| 5 | Skills page + editor (Config · Preview · Versions) | `client/src/app/skills/`, `lib/hooks/skills.ts`, nav |
| 5b | `GET /skills/:id/stats` + Stats tab | `modules/skills/`, `StatsTab/` |
| 6 | Agent editor Skills tab (link, enable, reorder) | `AgentEditor/`, agent-side link routes |
| 7 | Import: parser + preview + confirm, end to end | `modules/skills/helpers.ts`, `AddSkillDrawer/` |
| 8 | Two agents + their skills: prompts, seed, docs | `seed.ts`, `seed-prompts.ts`, `docs/agent-prompts/` |
| 9 | e2e flow + the control-experiment run | `e2e/specs/08-skills.flow.json` |

---

## 12. Tests

| Package | What |
|---|---|
| `reviewer-core` | `assemblePrompt` — trusted body raw, untrusted body wrapped, empty skills ⇒ section omitted **and prompt byte-identical to today** |
| `server` unit | name collision → rename vs update-existing; import parser: `.md` name/description derivation; zip → included vs ignored; traversal, bomb and size limits rejected; skill resolution order; both-enabled gating |
| `server` `.it.test.ts` | stats: a run writes `run_skills`; a failed run still writes them; counts survive unlinking the skill; `accept_rate` is `null` (not `0`) with no verdicts; 30-day window boundary; skills CRUD round-trip; body change creates a version, metadata change does not; restore appends; cascade on delete; **workspace isolation** |
| `client` | `SkillCard`, `ConfigTab` (description hint), `PreviewTab` render, `StatsTab` (empty state with no runs, `—` for unknown accept rate, caveat line present), `VersionsTab` restore, agent `SkillsTab` (counter, reorder, checkbox), `ImportPreview` (ignored list, confirm-to-save) |
| `e2e` | `08-skills.flow.json` — create a skill, attach it to an agent, reorder, disable, import a `.zip` through the preview |

---

## Delivery log

*(Append one entry per phase as the work lands — `AGENTS.md` workflow §5.)*

| Phase | Record |
|---|---|
| Initiation | This document. Key finding: the schema, contracts, agent-side link API, prompt slot and trace rendering all shipped in Part-0; L02 is mostly the module, the UI and the wiring (§1). |
| Planning | Decisions D1–D8 agreed with the user before coding (§2). Conventions extractor explicitly deferred; demo-PR source left open (§8.1). |
| Implementation | Slices 1–9 on `lesson-02` (`daff74e`…), built with parallel agents: reviewer-core, server module, import parser, run wiring, seed, and three client agents. Slice 5b stats included. Migration `0011` adds `agent_skills.enabled`, `run_skills`, the unique name index. |
| Validation | server typecheck + 179 unit/integration tests, client 140, reviewer-core 26, e2e 8/8 (incl. new `08-skills`). **Not done:** control experiment (§8) needs a real LLM + demo PRs (§8.1 still open); import through the UI end to end is unit-tested only (no e2e — file upload); manual browser check; `code-review` / `pr-self-review`. |
| Completion | — |
