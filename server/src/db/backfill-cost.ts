import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pathToFileURL } from 'node:url';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import * as t from './schema.js';
import { estimateCost } from '../adapters/llm/pricing.js';

/**
 * One-off backfill: price historical `agent_runs` that finished before cost was
 * tracked, from the token counts they already stored.
 *
 * Deliberately NOT a migration — migrations are plain SQL and cannot reach the
 * pricing table. Deliberately the STATIC `estimateCost`, not the live
 * `PriceBook`: no network, so the result is deterministic and re-runnable.
 *
 * These values are ESTIMATES (tokens × list price), unlike the real
 * `usage.cost` OpenRouter returns for new runs. Runs on unpriced models keep
 * `cost_usd = NULL` and go on rendering "—" — never a made-up 0.
 */
export async function backfillRunCost(
  databaseUrl: string,
): Promise<{ priced: number; skipped: number }> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const db = drizzle(sql);
    const rows = await db
      .select({
        id: t.agentRuns.id,
        model: t.agentRuns.model,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
      })
      .from(t.agentRuns)
      // Successful runs only: a failed/cancelled run records tokens 0, which
      // would price as a fabricated $0 — it must stay NULL (unknown).
      .where(
        and(
          isNull(t.agentRuns.costUsd),
          isNotNull(t.agentRuns.tokensIn),
          eq(t.agentRuns.status, 'done'),
        ),
      );

    let priced = 0;
    let skipped = 0;
    for (const r of rows) {
      const cost = r.model ? estimateCost(r.model, r.tokensIn ?? 0, r.tokensOut ?? 0) : null;
      if (cost == null) {
        skipped += 1;
        continue;
      }
      await db.update(t.agentRuns).set({ costUsd: cost }).where(eq(t.agentRuns.id, r.id));
      priced += 1;
    }
    return { priced, skipped };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// CLI entrypoint (see migrate.ts on why this is `pathToFileURL`, not `file://` + path).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  backfillRunCost(url)
    .then(({ priced, skipped }) => {
      console.log(`✓ backfilled ${priced} run(s); ${skipped} left unpriced (unknown model)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('✗ backfill failed:', err);
      process.exit(1);
    });
}
