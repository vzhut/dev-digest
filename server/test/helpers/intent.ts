import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import * as t from '../../src/db/schema.js';
import type { PgFixture } from './pg.js';

/** A structured provider that identifies as OpenRouter (MockLLMProvider can't). */
export class FakeIntentLLM implements LLMProvider {
  readonly id = 'openrouter' as const;
  calls: StructuredRequest<unknown>[] = [];
  constructor(
    private data: unknown = {
      intent: 'Add rate limiting to public endpoints.',
      in_scope: ['rate limiter'],
      out_of_scope: ['users endpoint refactor'],
      risk_areas: ['webhooks'],
    },
    private fail?: Error,
  ) {}
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('not used');
  }
  async embed(): Promise<number[][]> {
    return [];
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    if (this.fail) throw this.fail;
    return {
      data: req.schema.parse(this.data),
      model: req.model,
      tokensIn: 1402,
      tokensOut: 188,
      costUsd: 0.00031,
      raw: JSON.stringify(this.data),
      attempts: 1,
    };
  }
}

let seq = 0;
export async function setupPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { body?: string | null; files?: boolean; headSha?: string } = {},
) {
  const name = `intent-api-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: opts.headSha ?? 'a1b2c3d4e5f6',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body:
        opts.body === undefined
          ? // >= 200 chars: a thinner description with no linked source yields `low` confidence.
            'Adds a token-bucket rate limiter to the public API endpoints so unauthenticated clients cannot ' +
            'abuse them. The limit is read from config, requests over it get a 429 with a Retry-After header, ' +
            'and the internal endpoints are left alone.'
          : opts.body,
    })
    .returning();
  if (opts.files !== false) {
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@ export const config = {\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
  }
  return { repo: repo!, pr: pr! };
}
