---
name: engineering-insights
description: "Records non-obvious engineering findings into the right package's INSIGHTS.md. Use when a session uncovers something that cost real debugging time — a silent failure, a surprising constraint, a convention not visible in the code, a library or tooling quirk, an approach that failed and why, or an architectural decision and its reason. Also use when wrapping up a task or session, to capture what was learned before the context is lost."
---

# Engineering Insights

Turn what this session learned into an entry the next session can act on cold.

See `examples.md` for the quality bar — vague-vs-useful pairs and a worked wrap-up.
See `references.md` for where these rules come from.

## When to record

Two moments, not one:

- **As you go** — the instant a finding lands, while the evidence is still in context. Waiting until the end loses the file paths and the exact symptom.
- **On wrap-up** — when a task or session ends, sweep for anything not yet captured.

Record when something **cost real debugging time**, or would be re-derived from scratch next session. Skip trivial edits, renames and routine work — most tasks should produce nothing.

## The banality test

> If it would be obvious to anyone reading the code, don't write it.

An entry has to be actionable **cold**: an agent reads it with no memory of this session and knows what to do or avoid, without re-investigating.

| Fails the test | Passes |
|---|---|
| "Be careful with async" | "`Promise.all()` on the ingest pipeline times out past 30 items — use `Promise.allSettled()` in batches of 10" |
| "Watch out for path issues" | "`import.meta.url` percent-encodes spaces but `process.argv[1]` doesn't, so the CLI entrypoint guard never matches on a checkout path containing a space" |

The second column names the mechanism and the fix. The first is noise.

## Where it goes

One file, never two:

| Work touched | File |
|---|---|
| `server/` | `server/INSIGHTS.md` |
| `client/` | `client/INSIGHTS.md` |
| `reviewer-core/` | `reviewer-core/INSIGHTS.md` |
| `e2e/` | `e2e/INSIGHTS.md` |
| More than one package, or root tooling / env / Docker / `scripts/` | `INSIGHTS.md` (root) |

A cross-package finding goes to root only — don't copy it into a package file. If a package entry needs it, reference it ("see the space-in-path entry in the root `INSIGHTS.md`").

## Which section

Every `INSIGHTS.md` has the same seven sections. Pick one:

- **What Works** — an approach or solution that held up, worth reusing.
- **What Doesn't Work** — dead ends, abandoned approaches, antipatterns, and *why* they failed. **The most valuable section and the one most often skipped.** If a session burned time on a path that led nowhere, that belongs here.
- **Codebase Patterns** — conventions and architectural decisions not visible from the code alone, with the reason behind them.
- **Tool & Library Notes** — quirks of a dependency, the toolchain, or the local environment.
- **Recurring Errors & Fixes** — a concrete error message paired with what actually fixes it.
- **Session Notes** — dated summaries of what a session accomplished. Written **only on wrap-up**, not per finding.
- **Open Questions** — what stayed unresolved, so the next session doesn't rediscover the question.

## Entry format

````markdown
### <heading naming the finding, not the topic>

`path/to/file.ts:42` · 2026-09-16

<Symptom — what you observed, verbatim error text if there is one.>

<Mechanism — why it happens. This is the part that makes the entry reusable.>

<Fix or workaround, as a command or code block where possible.>
````

Rules:

- The heading names the **finding** ("Migrations never run on boot"), not the area ("about migrations").
- Always cite evidence — `path:line`, a command, or an error string. An entry with no anchor rots fastest.
- Get the date from `date +%F`; never assume it.
- Write in plain prose matching the rest of the file. No bullet soup.

## Append only

- **Never rewrite or delete an existing entry.** These files are shared and versioned.
- Already covered? **Extend** that entry instead of adding a near-duplicate.
- Superseded or wrong? Append a dated correction note *to that entry* — leave the original text standing, so the reasoning trail survives.
- Two entries conflict? Say so to the user rather than silently picking a winner.

## Workflow

Copy this checklist and work through it:

```
- [ ] 1. Read the target INSIGHTS.md
- [ ] 2. List candidate findings from this session
- [ ] 3. Apply the banality test to each — expect to drop most
- [ ] 4. Route each survivor to its file
- [ ] 5. Check for an existing entry to extend
- [ ] 6. Pick the section, write with evidence
- [ ] 7. Session Notes entry (wrap-up only)
- [ ] 8. Confirm what was added, and where
```

**Step 1** doubles as the read half of the loop: after reading, state which existing entries bear on the current work. It also prevents duplicates.

**Step 3** is the gate that keeps these files worth reading. A session that produces zero entries is a normal outcome — say so and stop.

**Step 8** is not optional: name each entry and its file, so the user can spot-check. These files are a draft under review, not a source of truth.

## Maintenance

- Past roughly **200 entries** in one file, signal-to-noise drops. Split by domain or prune.
- Prune periodically: outdated entries are worse than missing ones, because they are still trusted.
- Entries about code that no longer exists should be flagged for removal — by a human, not silently.
