import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { EvalCaseMeta, EvalExpectation, EvalSkillRef, EvalCaseResult } from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    // Agent-owned cases point at their agent with a real FK so deleting the agent
    // removes its cases (OQ-14). Null for legacy / skill-owned rows.
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    // The finding the case was frozen from. NO FK: a case outlives its finding.
    sourceFindingId: uuid('source_finding_id'),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files').$type<string[] | null>(),
    inputMeta: jsonb('input_meta').$type<EvalCaseMeta | null>(),
    expectedOutput: jsonb('expected_output').$type<EvalExpectation | null>(),
    notes: text('notes'),
    createdAt: now(),
  },
  (t) => ({
    // One case per (source finding, owning agent) — the dedup key (AC-6).
    sourceUq: uniqueIndex('eval_cases_source_owner_uq').on(t.sourceFindingId, t.ownerKind, t.ownerId),
    ownerIdx: index('eval_cases_owner_idx').on(t.workspaceId, t.ownerKind, t.ownerId),
    // FK index: deleting an agent cascades here (Postgres does not index FK columns itself).
    agentIdx: index('eval_cases_agent_idx').on(t.agentId),
    agentOwnerCheck: check(
      'eval_cases_agent_owner_chk',
      sql`${t.ownerKind} <> 'agent' OR ${t.agentId} = ${t.ownerId}`,
    ),
  }),
);

// `eval_runs` is the SUITE-level run: one execution of all of an agent's cases
// against a frozen config snapshot, with per-case results in `results` (jsonb, so
// they survive deleting a case — AC-13). `case_id` stays only for legacy per-case rows.
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id').references(() => evalCases.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version'),
    provider: text('provider'),
    model: text('model'),
    systemPrompt: text('system_prompt'),
    strategy: text('strategy'),
    skills: jsonb('skills').$type<EvalSkillRef[] | null>(),
    caseIds: jsonb('case_ids').$type<string[] | null>(),
    status: text('status', { enum: ['running', 'completed', 'errored'] }),
    casesDone: integer('cases_done').notNull().default(0),
    casesErrored: integer('cases_errored').notNull().default(0),
    unlabeled: integer('unlabeled').notNull().default(0),
    tracesPassed: integer('traces_passed').notNull().default(0),
    tracesTotal: integer('traces_total').notNull().default(0),
    results: jsonb('results').$type<EvalCaseResult[] | null>(),
    costPartial: boolean('cost_partial').notNull().default(false),
    errorReason: text('error_reason'),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    byAgentIdx: index('eval_runs_agent_ran_idx').on(t.workspaceId, t.agentId, t.ranAt),
    // FK indexes: deleting an agent / a case cascades to the (wide, jsonb-carrying) run rows.
    agentIdx: index('eval_runs_agent_idx').on(t.agentId, t.ranAt),
    caseIdx: index('eval_runs_case_idx').on(t.caseId),
    // Legacy per-case rows have no status; every suite run has a valid one and its workspace + agent.
    statusCheck: check('eval_runs_status_chk', sql`${t.status} IS NULL OR ${t.status} IN ('running', 'completed', 'errored')`),
    suiteScopeCheck: check(
      'eval_runs_suite_scope_chk',
      sql`${t.status} IS NULL OR (${t.workspaceId} IS NOT NULL AND ${t.agentId} IS NOT NULL)`,
    ),
    // At most one running suite per agent — race-safe backing for the 409 (AC-18).
    oneRunningUq: uniqueIndex('eval_runs_one_running_per_agent')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
