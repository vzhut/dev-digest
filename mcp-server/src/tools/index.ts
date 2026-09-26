// Tool registry: fixed order, verbatim descriptions and annotations. The handlers live in
// one file per tool and return a plain ToolResult; server.ts converts and registers them.
// Description strings are user-approved (specs/devdigest-mcp.md "Tool descriptions
// (verbatim)") — change the spec first, never reword here.
import type { ZodRawShape } from 'zod';
import {
  getBlastRadiusShape,
  getConventionsShape,
  getFindingsShape,
  listAgentsShape,
  runAgentOnPrShape,
} from '../contracts.js';
import type { ToolContext, ToolDeps } from '../deps.js';
import type { ToolResult } from '../format/errors.js';
import { getBlastRadius } from './get-blast-radius.js';
import { getConventions } from './get-conventions.js';
import { getFindings } from './get-findings.js';
import { listAgents } from './list-agents.js';
import { runAgentOnPr } from './run-agent-on-pr.js';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface RegisteredTool {
  name: string;
  title: string;
  description: string;
  inputShape: ZodRawShape;
  annotations: ToolAnnotations;
  /** `args` is already validated and defaulted by the SDK against `inputShape`. */
  handler(deps: ToolDeps, args: never, ctx: ToolContext): Promise<ToolResult>;
}

const READ_ONLY: ToolAnnotations = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

export const SERVER_INSTRUCTIONS =
  'DevDigest local PR reviewer. Start with list_agents; run_agent_on_pr runs a paid review and waits up to 2 min; get_findings reads a finished run. Args: repo=owner/name, pr=number, agent=name.';

export const TOOLS: readonly RegisteredTool[] = [
  {
    name: 'list_agents',
    title: 'List review agents',
    description:
      'List enabled review agents (name, id, model, one-line purpose). Call first: run_agent_on_pr needs an agent name or id from here.',
    inputShape: listAgentsShape,
    annotations: READ_ONLY,
    handler: listAgents,
  },
  {
    name: 'run_agent_on_pr',
    title: 'Run a review agent on a PR',
    description:
      'Run one review agent on a PR and wait up to 2 min; returns verdict, blockers and findings. Paid LLM call. If still running, returns run_id: fetch it later with get_findings.',
    inputShape: runAgentOnPrShape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: runAgentOnPr,
  },
  {
    name: 'get_findings',
    title: 'Get PR review findings',
    description:
      'Read findings of a finished review of a PR: verdict, blockers, score, findings by severity. Free, no LLM. Defaults to the latest run; filter by agent or run_id.',
    inputShape: getFindingsShape,
    annotations: READ_ONLY,
    handler: getFindings,
  },
  {
    name: 'get_conventions',
    title: 'Get repo conventions',
    description:
      "Get the repo's accepted coding conventions (rule + evidence location), extracted earlier. Use to match repo style before reviewing or writing code.",
    inputShape: getConventionsShape,
    annotations: READ_ONLY,
    handler: getConventions,
  },
  {
    name: 'get_blast_radius',
    title: 'Get PR blast radius (not implemented)',
    description:
      "Impact map of a PR: changed symbols and their dependents. NOT IMPLEMENTED yet: always returns an error, never 'zero impact'.",
    inputShape: getBlastRadiusShape,
    annotations: READ_ONLY,
    handler: getBlastRadius,
  },
];
