import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { backfillRunCost } from '../src/db/backfill-cost.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Backfill for runs that finished before cost was tracked. The rule under test:
 * a priced model gets an estimate from its stored tokens; an unpriced one stays
 * NULL (→ "—" in the UI) rather than being invented as 0.
 */
d('run cost backfill (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('prices historical successful runs from their tokens; leaves unknown models and failed runs alone', async () => {
    const [known] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        model: 'gpt-4.1', // $2.00 in / $8.00 out per 1M
        status: 'done',
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
      })
      .returning();
    const [unknown] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        model: 'some/model-nobody-priced',
        status: 'done',
        tokensIn: 500,
        tokensOut: 100,
      })
      .returning();
    const [alreadyPriced] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        model: 'gpt-4.1',
        status: 'done',
        tokensIn: 1_000_000,
        tokensOut: 0,
        costUsd: 0.5, // a REAL billed cost — the backfill must not overwrite it
      })
      .returning();

    // A failed run records tokens 0 — pricing it would invent a $0.
    const [failed] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, model: 'gpt-4.1', status: 'failed', tokensIn: 0, tokensOut: 0 })
      .returning();

    const { priced, skipped } = await backfillRunCost(pg.url);
    expect(priced).toBeGreaterThanOrEqual(1);
    expect(skipped).toBeGreaterThanOrEqual(1);

    const read = async (id: string) => {
      const [r] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, id));
      return r!;
    };
    expect((await read(known!.id)).costUsd).toBeCloseTo(10.0, 6); // 2.00 + 8.00
    expect((await read(unknown!.id)).costUsd).toBeNull();
    expect((await read(alreadyPriced!.id)).costUsd).toBe(0.5);
    expect((await read(failed!.id)).costUsd).toBeNull();
  });
});
