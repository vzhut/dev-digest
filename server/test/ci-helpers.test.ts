import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import {
  buildFiles,
  buildManifest,
  exportSkills,
  githubDebugOf,
  githubFailure,
  githubStatusOf,
  isExportable,
  manifestYaml,
  slugify,
  toInstallationDto,
  type LinkedSkill,
} from '../src/modules/ci/helpers.js';
import { AppError } from '../src/platform/errors.js';
import type { CiInstallationRow } from '../src/db/rows.js';

/** Pure helpers of the ci module: slugs, manifest, file bundle, DTO, GitHub error mapping. */

const AGENT = {
  name: 'General Reviewer',
  provider: 'openrouter',
  model: 'deepseek/deepseek-chat',
  systemPrompt: 'You review code.',
  strategy: 'map-reduce',
  ciFailOn: 'warning',
  version: 5,
} as const;

const linked = (name: string, enabled = true, version = 1): LinkedSkill => ({
  skill: { name, body: `# ${name}\nbody`, version },
  enabled,
});

describe('slugify / isExportable', () => {
  it('produces a lowercase kebab slug safe as a path segment', () => {
    expect(slugify('General Reviewer')).toBe('general-reviewer');
    expect(slugify('  --API  Contract / Gate!!  ')).toBe('api-contract-gate');
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('Ünïcode Ägent')).toBe('n-code-gent');
  });

  it('falls back to "agent" and caps the length without a trailing dash', () => {
    expect(slugify('!!!')).toBe('agent');
    expect(slugify('')).toBe('agent');
    const long = slugify(`${'a'.repeat(63)} bbbb`);
    expect(long).toBe('a'.repeat(63));
    expect(slugify('x'.repeat(100))).toHaveLength(64);
  });

  it('exports only OpenRouter agents', () => {
    expect(isExportable({ provider: 'openrouter' })).toBe(true);
    expect(isExportable({ provider: 'openai' })).toBe(false);
    expect(isExportable({ provider: 'anthropic' })).toBe(false);
  });
});

describe('exportSkills', () => {
  it('keeps order, drops disabled links and de-duplicates slugs', () => {
    const out = exportSkills([
      linked('API Gate', true, 3),
      linked('Disabled One', false),
      linked('api gate', true, 7),
      linked('API-Gate', true, 9),
      linked('Style', true, 1),
    ]);
    expect(out.map((s) => [s.slug, s.version])).toEqual([
      ['api-gate', 3],
      ['api-gate-2', 7],
      ['api-gate-3', 9],
      ['style', 1],
    ]);
    expect(out[0]!.body).toBe('# API Gate\nbody');
  });
});

describe('buildManifest / manifestYaml', () => {
  const skills = exportSkills([linked('Zeta', true, 2), linked('Alpha', true, 4)]);

  it('builds a manifest the shared schema accepts, with skills in order and versions recorded', () => {
    const m = buildManifest(AGENT, skills, 'pr_comment');
    expect(m).toEqual({
      name: 'General Reviewer',
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      system_prompt: 'You review code.',
      skills: ['zeta', 'alpha'],
      strategy: 'map-reduce',
      ci_fail_on: 'warning',
      version: 5,
      skill_versions: { zeta: 2, alpha: 4 },
      post_as: 'pr_comment',
    });
    expect(AgentManifest.safeParse(m).success).toBe(true);
  });

  it('handles an agent without skills', () => {
    const m = buildManifest(AGENT, [], 'none');
    expect(m.skills).toEqual([]);
    expect(m.skill_versions).toEqual({});
    expect(m.post_as).toBe('none');
  });

  it('round-trips through YAML and the shared schema without loss', () => {
    const m = buildManifest(
      { ...AGENT, systemPrompt: 'Multi\nline: "quoted" # not a comment\n- dash' },
      skills,
      'github_review',
    );
    const reparsed = AgentManifest.safeParse(parse(manifestYaml(m)));
    expect(reparsed.success).toBe(true);
    expect(reparsed.success && reparsed.data).toEqual(m);
  });

  it('rejects an agent the manifest schema cannot represent', () => {
    expect(() => buildManifest({ ...AGENT, name: '' }, [], 'none')).toThrow();
  });
});

describe('buildFiles', () => {
  it('lists manifest, skills, memory, runner, workflow in that order with the right paths and flags', () => {
    const skills = exportSkills([linked('Alpha'), linked('Beta')]);
    const manifest = buildManifest(AGENT, skills, 'none');
    const files = buildFiles({ slug: 'general-reviewer', manifest, skills, runner: 'RUNNER', workflow: 'WORKFLOW' });

    expect(files.map((f) => f.path)).toEqual([
      '.devdigest/agents/general-reviewer.yaml',
      '.devdigest/skills/alpha.md',
      '.devdigest/skills/beta.md',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.mjs',
      '.github/workflows/devdigest-review.yml',
    ]);
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(byPath['.devdigest/memory.jsonl']).toMatchObject({ contents: '', editable: false });
    expect(byPath['.devdigest/runner/index.mjs']).toMatchObject({ contents: 'RUNNER', editable: false });
    expect(byPath['.github/workflows/devdigest-review.yml']).toMatchObject({ contents: 'WORKFLOW', editable: true });
    expect(byPath['.devdigest/skills/alpha.md']).toMatchObject({ contents: '# Alpha\nbody', editable: false });
    expect(byPath['.devdigest/agents/general-reviewer.yaml']!.editable).toBe(false);
    // Only the workflow is editable in the wizard.
    expect(files.filter((f) => f.editable).map((f) => f.path)).toEqual(['.github/workflows/devdigest-review.yml']);
    expect(AgentManifest.safeParse(parse(files[0]!.contents)).success).toBe(true);
  });

  it('has no skill files for an agent without skills', () => {
    const manifest = buildManifest(AGENT, [], 'none');
    const files = buildFiles({ slug: 's', manifest, skills: [], runner: 'R', workflow: 'W' });
    expect(files.map((f) => f.path)).toEqual([
      '.devdigest/agents/s.yaml',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.mjs',
      '.github/workflows/devdigest-review.yml',
    ]);
  });
});

describe('toInstallationDto', () => {
  it('maps a row to the snake_case wire shape', () => {
    const row: CiInstallationRow = {
      id: 'i-1',
      agentId: 'a-1',
      repo: 'acme/widgets',
      targetType: 'gha',
      installedAt: new Date('2026-10-14T09:00:00Z'),
      manifestVersion: 5,
      workflowVersion: 1,
      prUrl: 'https://github.com/acme/widgets/pull/1',
      status: 'pending',
    };
    expect(toInstallationDto(row, 'r-1')).toEqual({
      id: 'i-1',
      agent_id: 'a-1',
      repo: 'acme/widgets',
      repo_id: 'r-1',
      target_type: 'gha',
      installed_at: '2026-10-14T09:00:00.000Z',
      manifest_version: 5,
      workflow_version: 1,
      current_workflow_version: 1,
      pr_url: 'https://github.com/acme/widgets/pull/1',
      status: 'pending',
    });
    expect(toInstallationDto(row, null).repo_id).toBeNull();
  });
});

describe('GitHub error mapping', () => {
  const SDK_TEXT = 'Resource not accessible by personal access token - https://api.github.com/repos/o/r/git/ref/heads/main';

  it('reads the status from an Octokit error or from ExternalServiceError.details', () => {
    expect(githubStatusOf({ status: 403 })).toBe(403);
    expect(githubStatusOf({ details: { status: 404 } })).toBe(404);
    expect(githubStatusOf({ status: '500' })).toBeNull();
    expect(githubStatusOf(new Error('x'))).toBeNull();
    expect(githubStatusOf(null)).toBeNull();
    expect(githubStatusOf(undefined)).toBeNull();
  });

  it.each([
    [401, 'token_missing', 409],
    [403, 'token_permission_missing', 409],
    [404, 'repo_not_accessible', 404],
    [500, 'github_unavailable', 502],
    [422, 'github_unavailable', 502],
  ])('maps GitHub %i to %s (HTTP %i) and never copies the SDK message', (status, code, http) => {
    const err = Object.assign(new Error(SDK_TEXT), { status });
    const out = githubFailure(err);
    expect(out).toBeInstanceOf(AppError);
    expect(out.code).toBe(code);
    expect(out.statusCode).toBe(http);
    expect(out.message).not.toContain('api.github.com');
    expect(out.message).not.toContain('Resource not accessible');
  });

  it('maps an error without any status to github_unavailable', () => {
    expect(githubFailure(new Error(SDK_TEXT)).code).toBe('github_unavailable');
    expect(githubFailure('boom').code).toBe('github_unavailable');
  });

  it('names all three write permissions in the 403 message', () => {
    const msg = githubFailure({ status: 403 }).message;
    for (const word of ['Contents', 'Pull requests', 'Workflows']) expect(msg).toContain(word);
  });

  it('githubDebugOf returns method, path (no query) and a bounded GitHub message', () => {
    const out = githubDebugOf({
      request: { method: 'GET', url: 'https://api.github.com/repos/o/r/git/ref/heads/main?ref=secret-query' },
      response: { data: { message: 'Not Found'.padEnd(500, '!') } },
    });
    expect(out.method).toBe('GET');
    expect(out.path).toBe('/repos/o/r/git/ref/heads/main');
    expect(out.github_message).toHaveLength(200);
    expect(JSON.stringify(out)).not.toContain('secret-query');
  });

  it('githubDebugOf never leaks request headers or tokens, even when the error carries them', () => {
    const TOKEN = 'github_pat_SUPERSECRET';
    const err = Object.assign(new Error(`failed with ${TOKEN}`), {
      status: 404,
      request: {
        method: 'POST',
        url: 'https://api.github.com/repos/o/r/git/commits',
        headers: { authorization: `token ${TOKEN}`, 'x-api-key': TOKEN },
      },
      response: { data: { message: 'Not Found' }, headers: { authorization: TOKEN } },
    });
    const out = githubDebugOf(err);
    expect(Object.keys(out).sort()).toEqual(['github_message', 'method', 'path']);
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(JSON.stringify(out)).not.toContain('authorization');
    // the error message (which may embed the token) is not copied either
    expect(JSON.stringify(out)).not.toContain('failed with');
  });

  it('githubDebugOf tolerates junk: no request, relative url, non-string fields', () => {
    expect(githubDebugOf(undefined)).toEqual({});
    expect(githubDebugOf(new Error('x'))).toEqual({});
    expect(githubDebugOf({ request: { method: 'GET', url: '/relative' } })).toEqual({ method: 'GET' });
    expect(githubDebugOf({ request: { method: 5, url: 7 }, response: { data: { message: {} } } })).toEqual({});
  });
});
