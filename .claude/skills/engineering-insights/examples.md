# Examples

The quality bar, using real findings from this repo. Every "useful" entry below was an actual
`INSIGHTS.md` entry — the "vague" version is what an agent writes when it skips the mechanism.

## Contents

- Vague vs useful — five pairs
- What a finished entry looks like
- A worked wrap-up
- Findings that should NOT be recorded

---

## Vague vs useful

### 1. A silent failure

❌ **Vague** — "Sometimes the migration script doesn't seem to run."

Useless cold. The next agent still has to debug it from zero.

✅ **Useful**

> ### `db:migrate` and `db:seed` silently do nothing when the repo path contains a space
>
> `server/src/db/migrate.ts`, `server/src/db/seed.ts`
>
> Both guard their CLI entrypoint with `` if (import.meta.url === `file://${process.argv[1]}`) ``.
> `import.meta.url` percent-encodes a space as `%20`; `process.argv[1]` keeps the literal space.
> On a checkout like `~/Documents/AI Course/dev-digest` they never match, so the script exits `0`
> having done nothing — and the API then fails with `relation "workspaces" does not exist`.
>
> Real fix: move the repo to a path with no spaces, or use `pathToFileURL(process.argv[1]).href`.

Why it works: names the exact comparison that fails, the observable symptom (`exits 0`, then a
specific error), and a fix. Actionable without re-investigating.

### 2. A convention invisible in the code

❌ **Vague** — "Be careful with secrets in this project."

✅ **Useful**

> ### Secrets are not in `.env`
>
> `server/src/platform/secrets.ts`
>
> API keys and `GITHUB_TOKEN` live in `~/.devdigest/secrets.json` (mode `0600`), read through the
> single chokepoint `LocalSecretsProvider`, with `process.env` only as a fallback. They are never
> in the database or git. Looking for a key in `server/.env` and finding it blank does not mean
> it is unset.

Why it works: the last sentence pre-empts the exact wrong conclusion the next agent would draw.

### 3. Something that looks broken but isn't

❌ **Vague** — "Some database tables are empty."

That is an observation, not a finding. It invites someone to "fix" it.

✅ **Useful**

> ### Empty tables are expected
>
> `server/src/db/schema/`
>
> `server/src/db/schema/` declares tables for features that later lessons build (`skills`, `eval`,
> `ci`, `knowledge`, `context`, `ops`). They sit empty in the starter. Not a broken migration, not
> something to "fix".

Why it works: converts a suspicious symptom into a closed question. This is a `Codebase Patterns`
entry — it prevents wasted work rather than fixing a bug.

### 4. A destructive command

❌ **Vague** — "Reset the database carefully before e2e runs."

✅ **Useful** — belongs in **What Doesn't Work**

> ### Never run `docker compose down -v` to reset for a test run
>
> `scripts/e2e.sh`
>
> `-v` deletes the `devdigest_pgdata` volume — every repo you imported and every review you ran,
> gone. Flows need a freshly-seeded single-repo database, which is exactly what `./scripts/e2e.sh`
> provides: an isolated stack on alternate ports (Postgres 5433, API 3101, web 3100) with an
> ephemeral database, safe to run while your normal dev stack is up.

Why it works: states the cost of the wrong move, then names the right one. A warning with no
alternative just makes the next agent hesitate.

### 5. A decision with a reason, and its limit

❌ **Vague** — "The reaper marks orphaned runs as failed on boot."

That restates the code. Anyone reading `buildApp()` sees it.

✅ **Useful**

> ### The orphaned-run reaper assumes a single API instance per DB
>
> `server/src/app.ts`
>
> On boot, `buildApp()` marks runs left in `running` by a dead process as failed, and it **awaits**
> that before accepting requests. The await is deliberate: a fresh process has no in-flight runs of
> its own yet, so every `running` row at that moment is genuinely orphaned, and awaiting closes the
> race where a brand-new run could be created and wrongly reaped.
>
> This breaks with more than one API replica against the same database — replicas would reap each
> other's live runs. Per-instance scoping or heartbeats would be required first.

Why it works: the code shows *what*; the entry supplies the *why* and the boundary where the
reasoning stops holding. That second paragraph is the whole value.

---

## What a finished entry looks like

Anatomy of the required shape:

```markdown
### Full-file findings bypass the line-intersection check     ← names the finding
                                                               
`reviewer-core/src/ground.ts` · 2026-09-16                     ← evidence + date

`groundFindings()` normally keeps a finding only if its         ← mechanism
`[start_line, end_line]` range intersects a real hunk.
Findings whose `kind` is `secret_leak`, `lethal_trifecta`,
`phantom`, or `hook` come from full-file scanners rather
than a diff hunk, so they ground against the file merely
being present in the diff.

Adding a new full-file scanner means adding its `kind` to       ← what to do about it
`FULL_FILE_KINDS` — otherwise every finding it produces is
silently dropped as "hallucinated".
```

Note the last paragraph: it tells a *future* agent what action this implies. An entry that only
explains is half an entry.

---

## A worked wrap-up

**Session:** added a new scanner to `reviewer-core`, spent 40 minutes on findings that vanished,
found `FULL_FILE_KINDS`, fixed it. Also renamed two local variables and bumped a patch dependency.

**Candidates → decisions:**

| Candidate | Decision |
|---|---|
| Findings silently dropped unless `kind` is in `FULL_FILE_KINDS` | **Record** → `reviewer-core/INSIGHTS.md` → Codebase Patterns |
| Renamed two locals | Drop — trivial |
| Bumped a patch dependency | Drop — no surprise, no cost |
| Spent 20 min assuming the LLM hallucinated before checking grounding | **Record** → What Doesn't Work — the wrong first hypothesis is itself the lesson |
| Unsure whether `phantom` should be full-file at all | **Record** → Open Questions |

**Result:** three entries in one file, plus a dated `Session Notes` line. Two candidates dropped.

Note the second row. The debugging *path* — "I assumed the model hallucinated" — is often more
valuable than the fix, and it is exactly what `What Doesn't Work` exists for.

---

## Do NOT record

- Anything readable straight from the code. If `grep` answers it, it is not a finding.
- One-off mistakes with no reusable mechanism ("I had a typo in the query").
- Restatements of `CLAUDE.md`. Stable conventions live there; `INSIGHTS.md` is for what was
  *discovered*.
- A narrative of the session. Extract the insight, don't replay the chat.
- Anything you cannot anchor to a file, command, or error message.
