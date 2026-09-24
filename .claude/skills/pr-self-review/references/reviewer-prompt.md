# The reviewer sub-agent brief

Used when a change is big enough to split (over ~150 added lines, or more than one group).
Spawn one agent per non-empty group in a single message so they run in parallel, and give each
only its own slice. A reviewer holding one rubric and a few files is measurably sharper than one
agent juggling eleven rubrics over the whole diff.

## Template

> You are reviewing one slice of a local change before it is pushed. Repo root: `<abs path>`.
>
> **Your rubric** — read these first, in full:
> `<abs path>/.claude/skills/<skill>/SKILL.md` (one line per routed skill for your group)
> `<abs path>/.claude/skills/pr-self-review/references/severity.md`
>
> **Your files** (nothing else is yours to review):
> ```
> <path>    <skills for that path>
> …
> ```
>
> **Reviewable surface:** `<abs path>/.git/pr-self-review/work/added-lines.txt` holds every line
> this change adds, as `path:line:content`. A finding must point at one of those lines. Read the
> surrounding file for context whenever you need it — context is welcome, but the *finding* lives
> on an added line. This repo carries documented debt (`onion-architecture` §8, the client's
> "Known debt" section); code the change didn't touch is not this change's problem.
>
> **What counts as a finding:** something that goes wrong, traceable to a named rule in one of
> your rubric files, with a fix that applies to this code. If you can't name the rule or say what
> breaks, it is not a finding — leave it out rather than padding the list. A CRITICAL means the
> push is stopped, so raise one only when you can name what breaks and for whom.
>
> **Output** — write JSON to `<abs path>/.git/pr-self-review/work/findings-<group>.json`, and
> print nothing else:
> ```json
> {
>   "group": "ui",
>   "findings": [
>     {
>       "severity": "CRITICAL|HIGH|MEDIUM|LOW",
>       "file": "client/src/…/PrDetailView.tsx",
>       "line": 88,
>       "skill": "security",
>       "rule": "OWASP A03 — injection / XSS",
>       "why": "The PR body comes from GitHub and is rendered through dangerouslySetInnerHTML, so a contributor-controlled title runs script in the reviewer's session.",
>       "fix": "Render it with react-markdown, as the rest of the app does."
>     }
>   ],
>   "notes": ["anything you looked at and deliberately did not flag"]
> }
> ```
>
> Don't modify any file outside `.git/pr-self-review/work/`, don't run the app, and don't fix
> anything you find.

## Groups

| Group | Rubric files |
|---|---|
| `ui` | `frontend-architecture`, `react-best-practices`, `next-best-practices` (only if `client/src/app/**` is in the slice), `react-testing-library` (only if test files are) |
| `backend` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod` — each only if `route.sh` put it on one of the slice's files |
| `security` | `security` + the stack mapping in `routing.md`; its slice is every file `route.sh` tagged with `security` |

`typescript-expert` is added to a group's rubric only when the slice has no other skill to offer
(a plain `.ts` module), and its findings cap at MEDIUM.

## Merging the results

1. Read each `findings-<group>.json`. A missing or malformed file means that reviewer failed —
   say so in the report rather than silently returning a PASS built on two thirds of the diff.
2. Drop findings whose `file:line` isn't in `added-lines.txt`, and findings without `rule` or `why`.
3. Deduplicate: same file, same line, same underlying problem → keep the most specific rule.
4. Apply the downgrade rules and the accepted list (`severity.md`, `accepted.md`).
5. Give each surviving finding a short stable id: first 4 hex of a hash over
   `rule + file + line content`, so `--accept <id>` still names the same thing on a re-run.
