// Turns the flat tool arguments (repo "owner/name", PR number, agent name) into API ids.
// Lists come from the API and are cached for 60 s (`GET /repos/:id/pulls` syncs GitHub, so
// it is slow). Every miss throws a ToolError that names the next step.
import type { ApiClient } from './api/client.js';
import type { Agent, PrMeta, Repo } from './api/schemas.js';
import { ToolError } from './format/errors.js';
import { sanitizeText } from './format/sanitize.js';

export const CACHE_TTL_MS = 60_000;
const MAX_LISTED = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_STATUSES = new Set(['needs_review', 'reviewed', 'stale', 'open']);

export interface ResolvedPr {
  /** PR uuid used by the run/review routes. */
  id: string;
  number: number;
  title: string;
}

export interface Resolvers {
  resolveRepo(repo: string, signal?: AbortSignal): Promise<Repo>;
  resolvePr(repo: Repo, number: number, signal?: AbortSignal): Promise<ResolvedPr>;
  resolveAgent(agent: string, opts?: { requireEnabled?: boolean }, signal?: AbortSignal): Promise<Agent>;
}

export interface ResolverDeps {
  api: ApiClient;
  now?: () => number;
}

interface Entry<T> {
  at: number;
  value: Promise<T>;
}

export function createResolvers(deps: ResolverDeps): Resolvers {
  const now = deps.now ?? Date.now;
  const cache = new Map<string, Entry<unknown>>();

  /** Returns the value and whether it came from a fresh fetch in this call. */
  async function cached<T>(key: string, load: () => Promise<T>, forceRefresh = false): Promise<{ value: T; fresh: boolean }> {
    const hit = cache.get(key) as Entry<T> | undefined;
    if (hit && !forceRefresh && now() - hit.at < CACHE_TTL_MS) return { value: await hit.value, fresh: false };
    const value = load();
    cache.set(key, { at: now(), value });
    try {
      return { value: await value, fresh: true };
    } catch (err) {
      cache.delete(key); // never cache a failure
      throw err;
    }
  }

  /** Look up in the cache; on a miss served from cache, refetch once (the list may be stale). */
  async function lookup<T, R>(key: string, load: () => Promise<T>, find: (list: T) => R | undefined): Promise<{ found?: R; list: T }> {
    const first = await cached(key, load);
    const hit = find(first.value);
    if (hit !== undefined || first.fresh) return { ...(hit !== undefined ? { found: hit } : {}), list: first.value };
    const second = await cached(key, load, true);
    const again = find(second.value);
    return { ...(again !== undefined ? { found: again } : {}), list: second.value };
  }

  return {
    async resolveRepo(repo, signal) {
      const wanted = repo.trim();
      const key = wanted.toLowerCase();
      const { found, list } = await lookup(
        'repos',
        () => deps.api.listRepos({ signal }),
        (repos) => repos.find((r) => (UUID.test(wanted) ? r.id.toLowerCase() === key : r.full_name.toLowerCase() === key)),
      );
      if (found) return found;
      const shown = safeName(wanted);
      if (list.length === 0) throw new ToolError(`Repo '${shown}' is not in DevDigest, and no repos are added yet (add one in the DevDigest UI).`);
      throw new ToolError(`Repo '${shown}' is not in DevDigest. Known repos: ${listNames(list.map((r) => r.full_name))} (add it in the DevDigest UI).`);
    },

    async resolvePr(repo, number, signal) {
      const { found, list } = await lookup(
        `pulls:${repo.id}`,
        () => deps.api.listPulls(repo.id, { signal }),
        (pulls) => pulls.find((p) => p.number === number),
      );
      if (found) {
        if (!found.id) throw new ToolError(`PR #${number} in ${repo.full_name} has no DevDigest id yet — open it once in the DevDigest UI, then retry.`);
        return { id: found.id, number: found.number, title: found.title };
      }
      throw new ToolError(prNotFound(repo, number, list));
    },

    async resolveAgent(agent, opts = {}, signal) {
      const wanted = agent.trim();
      const { value: list } = await cached('agents', () => deps.api.listAgents({ signal }));
      let matches = matchAgents(list, wanted);
      if (matches.length === 0) {
        // Agents may have been created in the UI since the cache was filled.
        const refreshed = await cached('agents', () => deps.api.listAgents({ signal }), true);
        matches = matchAgents(refreshed.value, wanted);
      }
      if (matches.length === 0) throw new ToolError(`Agent '${safeName(wanted)}' not found — call list_agents for valid names.`);
      if (opts.requireEnabled && matches.some((a) => a.enabled)) matches = matches.filter((a) => a.enabled);
      if (matches.length > 1) {
        const names = matches.map((a) => `${safeName(a.name)} [${a.id}]`).join(', ');
        throw new ToolError(`Agent '${safeName(wanted)}' matches ${matches.length} agents: ${names} — pass the id.`);
      }
      const only = matches[0] as Agent;
      if (opts.requireEnabled && !only.enabled) {
        throw new ToolError(`Agent '${safeName(only.name)}' is disabled — enable it in DevDigest → Agents or pick another from list_agents.`);
      }
      return only;
    },
  };
}

function matchAgents(agents: readonly Agent[], wanted: string): Agent[] {
  const byId = agents.filter((a) => a.id === wanted);
  if (byId.length > 0) return byId;
  const lower = wanted.toLowerCase();
  return agents.filter((a) => a.name.toLowerCase() === lower);
}

function safeName(s: string): string {
  return sanitizeText(s, 100);
}

function listNames(names: readonly string[]): string {
  const shown = names.slice(0, MAX_LISTED).map(safeName).join(', ');
  return names.length > MAX_LISTED ? `${shown} and ${names.length - MAX_LISTED} more` : shown;
}

function prNotFound(repo: Repo, number: number, pulls: readonly PrMeta[]): string {
  if (pulls.length === 0) return `PR #${number} not found in ${repo.full_name}: DevDigest has no PRs for it yet (import PRs in the DevDigest UI).`;
  const open = pulls.filter((p) => !p.status || OPEN_STATUSES.has(p.status));
  const pool = (open.length > 0 ? open : pulls).slice().sort((a, b) => b.number - a.number);
  const label = open.length > 0 ? 'Open PRs' : 'Known PRs';
  const shown = pool.slice(0, MAX_LISTED).map((p) => `#${p.number}`).join(', ');
  const more = pool.length > MAX_LISTED ? ` and ${pool.length - MAX_LISTED} more` : '';
  return `PR #${number} not found in ${repo.full_name}. ${label}: ${shown}${more} (import PRs in the DevDigest UI).`;
}
