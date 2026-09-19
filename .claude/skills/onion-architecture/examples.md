# onion-architecture: examples

Before/after on real `server/src` code. The "before" snippets are shortened. The "after" versions show the target shape, not a
drop-in patch. Apply one only when your task touches that code (SKILL.md §7–§8).

---

## 1. Fat route handler → route + service + repository (D1)

**Before:** `modules/pulls/routes.ts`, `GET /pulls/:id`. The handler reads Postgres, calls GitHub, rewrites two tables,
decides the offline fallback, and maps rows to a DTO, all in ~70 lines:

```ts
app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
  const { workspaceId } = await getContext(container, req);
  const [pr] = await container.db.select().from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, req.params.id)));
  if (!pr) throw new NotFoundError('Pull request not found');
  const [repo] = await container.db.select().from(t.repos).where(eq(t.repos.id, pr.repoId));
  try {
    const gh = await container.github();
    const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
    await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    await container.db.insert(t.prFiles).values(detail.files.map(/* … */));
    // … commits, body, stats …
    return { ...detail, id: pr.id };
  } catch (err) {
    app.log.warn({ err }, 'GitHub PR detail refresh skipped …');
    const files = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    // … map rows → PrDetail …
  }
});
```

**After:** each ring does one job.

```ts
// modules/pulls/routes.ts — driving adapter: parse → context → one call → reply
app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
  const { workspaceId } = await getContext(app.container, req);
  return service.getDetail(workspaceId, req.params.id);
});
```

```ts
// modules/pulls/service.ts — use case: read → decide → write, depends on ports only
export class PullsService {
  constructor(private deps: {
    repo: PullsRepository;
    github: () => Promise<GitHubClient>;   // port from @devdigest/shared
    log: FastifyBaseLogger;
  }) {}

  async getDetail(workspaceId: string, prId: string): Promise<PrDetail> {
    const found = await this.deps.repo.findWithRepo(workspaceId, prId);
    if (!found) throw new NotFoundError('Pull request not found');
    const { pr, repo } = found;
    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.deps.repo.replaceDetail(pr.id, detail);   // one transaction, see §6
      return { ...detail, id: pr.id };
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub PR detail refresh skipped; serving persisted detail');
      return toPrDetail(pr, await this.deps.repo.filesAndCommits(pr.id)); // pure mapper in helpers.ts
    }
  }
}
```

```ts
// modules/pulls/repository.ts — driven adapter: the only file here that imports drizzle-orm / db/schema
export class PullsRepository {
  constructor(private db: Db) {}
  async findWithRepo(workspaceId: string, prId: string) { /* select pr + repo, scoped by workspace */ }
  async replaceDetail(prId: string, detail: PrDetailFromGitHub) { /* delete+insert files/commits, update pr */ }
  async filesAndCommits(prId: string) { /* two selects */ }
}
```

Why it's better: the offline-fallback decision can now be unit-tested with `MockGitHubClient` set to throw,
the SQL can be tested in a `pulls-*.it.test.ts`, and the handler can no longer drift into business logic.

---

## 2. Schema import used only for a row type (D2)

**Before:** `modules/reviews/run-executor.ts`:
```ts
import * as schema from '../../db/schema.js';
// …
repo: typeof schema.repos.$inferSelect,
```

**After:** add the row type where row types live, and import it type-only:
```ts
// db/rows.ts
export type RepoRow = typeof t.repos.$inferSelect;

// modules/reviews/run-executor.ts
import type { RepoRow } from '../../db/rows.js';
repo: RepoRow,
```
The application service no longer names the persistence schema. `db/rows.ts` is the agreed seam (SKILL.md §4.3).

---

## 3. Service locator → narrow dependencies (D3/D4, for new services)

**Before:** `modules/agents/service.ts`:
```ts
export class AgentsService {
  private repo: AgentsRepository;
  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }
  async listModels(provider: Provider) {
    const llm = await this.container.llm(provider);   // which of the container's 15 members does this class use? read it all to find out
    return llm.listModels();
  }
}
```

**After:** the shape for a **new** service. Existing ones keep `Container` until they're reworked for another reason.
```ts
export class AgentsService {
  constructor(private deps: {
    repo: AgentsRepository;
    llm: (provider: Provider) => Promise<LLMProvider>;
  }) {}
}

// routes.ts (driving adapter builds it)
const service = new AgentsService({
  repo: app.container.agentsRepo,
  llm: (p) => app.container.llm(p),
});

// test
const service = new AgentsService({ repo, llm: async () => new MockLLMProvider('openai', { models: [] }) });
```

---

## 4. Adapter reaching into a module (D5)

**Before:** `adapters/astgrep/index.ts:25`:
```ts
import { MAX_SIGNATURE_CHARS, SUPPORTED_EXT } from '../../modules/repo-intel/constants.js';
```
An outer-ring adapter now depends on a feature module. Moving or deleting `repo-intel` breaks an unrelated adapter.

**After:** the constants describe what the parser supports, so they belong to the adapter, and the module imports them from there
(module → adapter type/constant is allowed; adapter → module isn't):
```ts
// adapters/astgrep/constants.ts
export const SUPPORTED_EXT = ['.ts', '.tsx', /* … */] as const;
export const MAX_SIGNATURE_CHARS = 200;

// modules/repo-intel/constants.ts
export { SUPPORTED_EXT, MAX_SIGNATURE_CHARS } from '../../adapters/astgrep/constants.js';
```
If both sides own the concept equally, move it down into `@devdigest/shared` instead.

---

## 5. A new port + adapter + mock

Example task: "post the review summary to Slack".

```ts
// 1. Port: vendor/shared/adapters.ts (and the client copy only if the client needs the type)
export interface Notifier {
  send(msg: { channel: string; text: string }): Promise<void>;
}

// 2. Adapter: src/adapters/notifier/slack.ts (the only file that knows the Slack SDK / HTTP shape)
export class SlackNotifier implements Notifier {
  constructor(private token: string) {}
  async send(msg) {
    const res = await fetch('https://slack.com/api/chat.postMessage', { /* … */ });
    if (!res.ok) throw new ExternalServiceError('Slack rejected the message', { status: res.status });
  }
}

// 3. Mock: src/adapters/mocks.ts
export class MockNotifier implements Notifier {
  sent: { channel: string; text: string }[] = [];
  async send(msg) { this.sent.push(msg); }
}

// 4. Wiring: platform/container.ts, lazily, from SecretsProvider, with an override slot
export interface ContainerOverrides { /* … */ notifier?: Notifier }
async notifier(): Promise<Notifier> {
  if (this.overrides.notifier) return this.overrides.notifier;
  const token = await this.secrets.get('SLACK_TOKEN');
  if (!token) throw new ConfigError('SLACK_TOKEN is not configured');
  return (this._notifier ??= new SlackNotifier(token));
}

// 5. The service depends on the port, never on SlackNotifier
constructor(private deps: { notifier: () => Promise<Notifier>; /* … */ }) {}
```
Adding `SLACK_TOKEN` to `SecretKey` is a contract change, so mirror it into both shared copies (`AGENTS.md`).

---

## 6. A transaction owned by the service

```ts
// db/client.ts, added once, next to Db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// repository: accepts either, never opens its own transaction
async replaceFiles(prId: string, files: NewPrFile[], db: Db | Tx = this.db) {
  await db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
  if (files.length) await db.insert(t.prFiles).values(files);
}

// service: decides the unit of work
await this.deps.db.transaction(async (tx) => {
  await this.deps.repo.replaceFiles(pr.id, files, tx);
  await this.deps.repo.replaceCommits(pr.id, commits, tx);
  await this.deps.repo.updateStats(pr.id, stats, tx);
});
```
A service may hold `db` **only** to open transactions. It must not write queries with it.
