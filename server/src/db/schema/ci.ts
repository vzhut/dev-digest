import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  doublePrecision,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    // Agent version / workflow template version that were exported (drives the
    // derived "outdated" badge). `pending` until a CI run of it is ingested.
    manifestVersion: integer('manifest_version').notNull().default(1),
    workflowVersion: integer('workflow_version').notNull().default(1),
    prUrl: text('pr_url'),
    status: text('status', { enum: ['pending', 'active'] }).notNull().default('pending'),
  },
  (t) => ({
    agentRepoUq: uniqueIndex('ci_installations_agent_repo_uq').on(t.agentId, t.repo),
  }),
);

export const ciRuns = pgTable('ci_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
    onDelete: 'set null',
  }),
  prNumber: integer('pr_number'),
  ranAt: timestamp('ran_at', { withTimezone: true }),
  status: text('status'),
  findingsCount: integer('findings_count'),
  costUsd: doublePrecision('cost_usd'),
  githubUrl: text('github_url'),
  source: text('source'),
});
