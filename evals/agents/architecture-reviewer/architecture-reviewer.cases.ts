import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// A second diff: the violations are a filesystem import in reviewer-core (purity) and a skipped
// groundFindings() gate (reviewer-core rules in the agent's "reviewer-core" checklist line).
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer reports "No findings." — the agent's
// own rules say zero findings is a valid result and it must not invent any.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// The agent's output contract (see .claude/agents/architecture-reviewer.md): every finding is
// path:line + violated rule (`<skill> §<n>` or `AGENTS.md:<line>`) + severity + recommendation,
// and the agent gives NO PASS/BLOCK verdict (that is /pr-self-review's job).
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with path:line, rule and severity",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing a type from 'fastify' as a layering violation (the domain/inner layer must not depend on the Fastify/presentation layer)",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a dependency-injection violation (concrete adapters/repositories must be constructed only in the composition root / container)",
      "every finding cites a file path with a line number (path:line) pointing at a changed line",
      "every finding names the violated rule with a reference to a skill section or AGENTS.md (for example 'onion-architecture §2'), not only prose",
      "assigns a severity (critical/high/medium/low) to each finding",
      "gives a recommendation for each finding",
      "does not issue a PASS or BLOCK verdict — it only reports findings",
    ],
    threshold: 0.8, // one missed practice out of 6-7 is tolerated: CI runs a cheap model (Gemini Flash)
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not report the optional `reply?: FastifyReply` parameter as a runtime bug or a security vulnerability — a layering finding about a Fastify type in the domain function's signature is acceptable, a security or correctness finding is not",
      "stays scoped to structural/layering/DI findings and does not comment on naming, style, or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "flags the reviewer-core purity and grounding-gate violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/review/run.ts as a violation (reviewer-core must do no filesystem, DB or GitHub I/O; the LLM only via the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "every finding cites a file path with a line number (path:line) pointing at a changed line",
      "quotes or names the offending code (readFileSync / returning deduped) as evidence for each finding, not a paraphrase",
      "assigns a severity (critical/high/medium/low) to each finding",
      "does not issue a PASS or BLOCK verdict — it only reports findings",
    ],
    threshold: 0.8, // one missed practice out of 6-7 is tolerated: CI runs a cheap model (Gemini Flash)
    maxTurns: 25,
  },
  {
    name: "reports no findings for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    // Every practice is a positive, quotable fact: "did not invent X" has no evidence for the judge.
    practices: [
      "the report states that there are no findings (for example 'No findings.' under Findings or in the Summary), or lists only non-blocking low-confidence items under Questions",
      "the Summary or Findings section contains no severity count above zero and no findings table row with a severity (CRITICAL/HIGH/MEDIUM/LOW)",
      "the report is made of the structured sections of the agent's format (Scope reviewed, Summary, Findings, Baseline hits skipped, Questions, Not verified) and contains no PASS or BLOCK verdict line",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
