# References

Sources behind this skill, and what each one contributed.

## Primary

**MindStudio — Self-Learning AI Skill System with Learnings.md + Wrap-Up Skill**
<https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up>

The seven fixed sections (What Works · What Doesn't Work · Codebase Patterns · Tool & Library
Notes · Recurring Errors & Fixes · Session Notes · Open Questions). The vague-vs-useful framing.
The ~200-entry signal-to-noise ceiling and the periodic prune. Team mode: append-only, a
designated maintainer consolidating. The warning that `What Doesn't Work` is the most valuable
and most skipped section. Also the caveat that a wrap-up file is a **draft under review** — an
LLM can summarise a session wrongly, so a human spot-checks.

**MindStudio — How to Build a Learnings Loop for Claude Code Skills**
<https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills>

Append-never-overwrite, with corrections as dated notes appended to the original entry. The
insistence on *active* reading — stating which entries are relevant, rather than loading the file
silently — which is why step 1 of the workflow requires saying so out loud. The distinction that
`CLAUDE.md` holds stable configuration while a learnings file holds what accumulates.

**Anthropic — Skill authoring best practices**
<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>

`description` is the discovery interface: third person, stating both what the skill does and when
to use it, with concrete trigger terms — it is the only trigger this skill has. Progressive
disclosure: `SKILL.md` stays scannable and points one level deep to `examples.md` and this file.
The copyable workflow checklist. The guidance to keep `SKILL.md` well under 500 lines.

## Supporting

**MindStudio — Self-Evolving Claude Code Memory with Obsidian + Hooks**
<https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks>

Capture categories (Patterns · Mistakes · Decisions · Context) and the quality filter that shaped
the banality test: *only include a pattern if it is something a developer might forget*. Also the
Stop-hook flow — relevant to this repo later, not yet.

**Anthropic — Lessons from building Claude Code: how we use skills**
<https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills>

Skills are folders, not single markdown files — they can carry examples, references and scripts.
Hence the three-file layout here, matching `.claude/skills/README.md`.

**dev.to — CLAUDE.md: Building Persistent Memory for AI Coding Agents**
<https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322>

The compounding argument, and the limits: this is not a substitute for documentation, and it is
not a crutch for bad tooling. If an agent keeps forgetting how to run the tests, fix the test
command rather than writing an entry about it.

## Deliberately not implemented

A `Stop` hook would make capture reliable — the system invokes it, so the model cannot skip it.
This repo triggers the skill through its `description` alone. That gap is intentional: the course
adds the hook in a later lesson, after the unreliability of description-only triggering has been
felt firsthand.
