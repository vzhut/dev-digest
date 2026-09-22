import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

// One row per Run Scan / ReScan. `sha` is the clone's HEAD at scan time — it is
// what the blob evidence URLs (owner/repo/blob/{sha}/...) are pinned to (C3).
export const conventionScans = pgTable('convention_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  sha: text('sha').notNull(),
  sampleFiles: integer('sample_files').notNull(),
  rawCount: integer('raw_count').notNull(),
  keptCount: integer('kept_count').notNull(),
  // Counts per drop reason, e.g. { no_file: 2, quote_mismatch: 3 } (§4.4).
  dropped: jsonb('dropped').notNull().$type<Record<string, number>>(),
  model: text('model').notNull(),
  costUsd: doublePrecision('cost_usd'),
  createdAt: now(),
});

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => conventionScans.id, { onDelete: 'cascade' }),
    category: text('category', {
      enum: ['naming', 'structure', 'error-handling', 'typing', 'testing', 'imports', 'api', 'style', 'other'],
    }).notNull(),
    rule: text('rule').notNull(),
    // What the model said, verbatim — lets the UI show an "edited" chip when `rule` diverges.
    ruleOriginal: text('rule_original').notNull(),
    evidencePath: text('evidence_path').notNull(),
    evidenceLineStart: integer('evidence_line_start').notNull(),
    evidenceLineEnd: integer('evidence_line_end').notNull(),
    // Read from the file by code (the verifier), never taken from the model's output.
    evidenceSnippet: text('evidence_snippet').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] }).notNull().default('pending'),
    // Normalised-rule hash — dedups across re-scans; a decided row survives a re-scan
    // by fingerprint match (§4.5), so it must be stable across scans of the same repo.
    fingerprint: text('fingerprint').notNull(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    repoFingerprintUq: uniqueIndex('conventions_repo_fingerprint_uq').on(t.repoId, t.fingerprint),
  }),
);
