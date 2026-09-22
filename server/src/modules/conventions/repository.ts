import { and, desc, eq, ne } from 'drizzle-orm';
import type { ConventionCategory } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns `conventions` + `convention_scans`. Never
 * imports the `repos` module (onion-architecture: modules don't reach into
 * each other's folder) — `getRepoBasics` below mirrors the same minimal,
 * read-only query `repo-intel`'s own repository already keeps for the same
 * reason.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;

export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

export interface InsertScan {
  workspaceId: string;
  repoId: string;
  sha: string;
  sampleFiles: number;
  rawCount: number;
  keptCount: number;
  dropped: Record<string, number>;
  model: string;
  costUsd: number | null;
}

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  scanId: string;
  category: ConventionCategory;
  rule: string;
  ruleOriginal: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  evidenceSnippet: string;
  confidence: number;
  fingerprint: string;
}

/** A convention row joined with the sha of the scan that produced it. */
export interface ConventionWithScanSha extends ConventionRow {
  scanSha: string;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepoBasics(workspaceId: string, repoId: string): Promise<RepoBasics | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  async insertScan(values: InsertScan): Promise<ConventionScanRow> {
    const [row] = await this.db.insert(t.conventionScans).values(values).returning();
    return row!;
  }

  async getLatestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  /**
   * Every row for the repo — any status, any scan — joined to each row's OWN
   * scan sha. A decided row can be older than the repo's latest scan, so this
   * must not join on the latest scan alone (the GET route and the composer
   * both read from this).
   */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionWithScanSha[]> {
    const rows = await this.db
      .select({ convention: t.conventions, scanSha: t.conventionScans.sha })
      .from(t.conventions)
      .innerJoin(t.conventionScans, eq(t.conventionScans.id, t.conventions.scanId))
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence));
    return rows.map((r) => ({ ...r.convention, scanSha: r.scanSha }));
  }

  /** Fingerprints of rows the user already decided (§4.5 — a re-scan must not resurrect any of these). */
  async getDecidedFingerprints(workspaceId: string, repoId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ fingerprint: t.conventions.fingerprint })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'pending'),
        ),
      );
    return new Set(rows.map((r) => r.fingerprint));
  }

  /** Deletes the previous scan's undecided rows before a re-scan inserts the
   * fresh batch. Decided rows are never touched here. */
  async deletePendingByRepo(workspaceId: string, repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
        ),
      );
  }

  async insertCandidates(rows: InsertConvention[]): Promise<ConventionRow[]> {
    if (rows.length === 0) return [];
    return this.db.insert(t.conventions).values(rows).returning();
  }

  /** Accepted rows for the repo — the composer's input (§4.6). */
  async getAcceptedByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
  }

  /** Accept / reject / edit (§4.1 PATCH). `undefined` when the row isn't in
   * this repo/workspace — the caller turns that into a 404. */
  async updateCandidate(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: { status?: ConventionRow['status']; rule?: string },
  ): Promise<ConventionRow | undefined> {
    const setValues: Partial<ConventionRow> & { updatedAt: Date } = { updatedAt: new Date() };
    if (patch.status !== undefined) setValues.status = patch.status;
    if (patch.rule !== undefined) setValues.rule = patch.rule;
    const [row] = await this.db
      .update(t.conventions)
      .set(setValues)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.id, id),
        ),
      )
      .returning();
    return row;
  }

  async getScanSha(scanId: string): Promise<string | undefined> {
    const [row] = await this.db.select({ sha: t.conventionScans.sha }).from(t.conventionScans).where(eq(t.conventionScans.id, scanId));
    return row?.sha;
  }
}
