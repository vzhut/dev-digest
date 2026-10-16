import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { renderWorkflow, validateWorkflow } from '../src/modules/ci/workflow.js';

/**
 * Pure: the generated GitHub Actions workflow and its validator. The security
 * invariants are asserted on the PARSED YAML (an independent read of the text),
 * not on the template's own constants.
 */

const SHA_A = 'a'.repeat(40);

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Wf = {
  on: Record<string, { types: string[] }>;
  permissions: Record<string, string>;
  jobs: Record<string, { if?: string; steps: Step[]; permissions?: unknown }>;
};

const generated = () => renderWorkflow({ triggers: ['opened', 'synchronize'], postAs: 'github_review' });
const parsed = () => parse(generated()) as Wf;

/** A minimal workflow that passes every rule; each case below breaks exactly one thing. */
const wf = (over: { on?: string; permissions?: string; jobExtra?: string; uses?: string } = {}) => `
name: t
${over.on ?? 'on:\n  pull_request:\n    types: [opened]'}
${over.permissions ?? 'permissions:\n  contents: read'}
jobs:
  review:
    runs-on: ubuntu-latest
${over.jobExtra ?? ''}
    steps:
      - uses: ${over.uses ?? `actions/checkout@${SHA_A}`}
      - run: echo hi
`;

const rules = (text: string) => validateWorkflow(text).map((v) => v.rule);

describe('renderWorkflow (generated workflow)', () => {
  it('passes its own validator with zero violations', () => {
    expect(validateWorkflow(generated())).toEqual([]);
    for (const postAs of ['github_review', 'pr_comment', 'none'] as const) {
      expect(validateWorkflow(renderWorkflow({ triggers: ['opened', 'synchronize', 'reopened'], postAs }))).toEqual([]);
    }
  });

  it('has exactly one job, pull_request only, and permissions of exactly contents:read + pull-requests:write', () => {
    const doc = parsed();
    expect(Object.keys(doc.jobs)).toHaveLength(1);
    expect(Object.keys(doc.on)).toEqual(['pull_request']);
    expect(doc.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
    expect(Object.values(doc.jobs)[0]!.permissions).toBeUndefined();
  });

  it('renders the requested triggers and post_as', () => {
    const doc = parse(renderWorkflow({ triggers: ['reopened', 'opened'], postAs: 'pr_comment' })) as Wf;
    expect(doc.on.pull_request!.types).toEqual(['reopened', 'opened']);
    const run = Object.values(doc.jobs)[0]!.steps.find((s) => s.env?.DEVDIGEST_POST_AS);
    expect(run!.env!.DEVDIGEST_POST_AS).toBe('pr_comment');

    const none = parse(renderWorkflow({ triggers: ['synchronize'], postAs: 'none' })) as Wf;
    expect(none.on.pull_request!.types).toEqual(['synchronize']);
    expect(Object.values(none.jobs)[0]!.steps.find((s) => s.env?.DEVDIGEST_POST_AS)!.env!.DEVDIGEST_POST_AS).toBe('none');
  });

  it('checks out the base sha without persisting credentials and pins every action to a 40-hex SHA', () => {
    const steps = Object.values(parsed().jobs)[0]!.steps;
    const checkout = steps.find((s) => s.uses?.startsWith('actions/checkout@'))!;
    expect(checkout.with).toMatchObject({
      ref: '${{ github.event.pull_request.base.sha }}',
      'persist-credentials': false,
    });
    const uses = steps.flatMap((s) => (s.uses ? [s.uses] : []));
    expect(uses.length).toBeGreaterThanOrEqual(2);
    for (const u of uses) expect(u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it('skips fork PRs and runs the runner from .devdigest/runner/index.mjs', () => {
    const job = Object.values(parsed().jobs)[0]!;
    expect(job.if).toBe('github.event.pull_request.head.repo.full_name == github.repository');
    const runStep = job.steps.find((s) => s.run?.includes('node '))!;
    expect(runStep.run).toContain('node .devdigest/runner/index.mjs');
  });

  it('exposes secrets only through OPENROUTER_API_KEY and puts no PR-controlled text in any run: block', () => {
    const text = generated();
    expect([...text.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1])).toEqual(['OPENROUTER_API_KEY']);

    const steps = Object.values(parsed().jobs)[0]!.steps;
    const runs = steps.flatMap((s) => (s.run ? [s.run] : []));
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(r).not.toMatch(/\$\{\{\s*github\.event\.pull_request\.(title|body|head\.ref)/);
      expect(r).not.toContain('${{');
    }
  });
});

describe('validateWorkflow', () => {
  it('accepts a minimal compliant workflow (baseline for the cases below)', () => {
    expect(validateWorkflow(wf())).toEqual([]);
  });

  it('yaml_invalid: unparsable text and a non-mapping document', () => {
    const bad = validateWorkflow('on: [unterminated\n  jobs: {');
    expect(bad).toHaveLength(1);
    expect(bad[0]!.rule).toBe('yaml_invalid');
    expect(rules('- just\n- a list')).toEqual(['yaml_invalid']);
    expect(rules('just a string')).toEqual(['yaml_invalid']);
  });

  it.each(['pull_request_target', 'issue_comment', 'pull_request_review_comment', 'workflow_run'])(
    'forbidden_trigger: %s in map form',
    (trigger) => {
      const out = validateWorkflow(wf({ on: `on:\n  pull_request:\n    types: [opened]\n  ${trigger}:\n    types: [created]` }));
      expect(out.map((v) => v.rule)).toEqual(['forbidden_trigger']);
      expect(out[0]!.message).toContain(trigger);
    },
  );

  it('forbidden_trigger: also found in string and list form of `on:`', () => {
    expect(rules(wf({ on: 'on: [push, pull_request_target]' }))).toEqual(['forbidden_trigger']);
    expect(rules(wf({ on: 'on: workflow_run' }))).toEqual(['forbidden_trigger']);
  });

  it('extra_permissions: top level write-all, an extra scope, and a too-high level', () => {
    expect(rules(wf({ permissions: 'permissions: write-all' }))).toEqual(['extra_permissions']);
    expect(rules(wf({ permissions: 'permissions: read-all' }))).toEqual(['extra_permissions']);
    expect(rules(wf({ permissions: 'permissions:\n  contents: read\n  id-token: write' }))).toEqual(['extra_permissions']);
    expect(rules(wf({ permissions: 'permissions:\n  contents: write' }))).toEqual(['extra_permissions']);
  });

  it('extra_permissions: job level (map and write-all) is checked separately from the top level', () => {
    const map = validateWorkflow(wf({ jobExtra: '    permissions:\n      contents: write' }));
    expect(map.map((v) => v.rule)).toEqual(['extra_permissions']);
    expect(map[0]!.message).toContain('"review"');
    expect(rules(wf({ jobExtra: '    permissions: write-all' }))).toEqual(['extra_permissions']);
    // both levels wrong -> two violations
    expect(rules(wf({ permissions: 'permissions: write-all', jobExtra: '    permissions: write-all' }))).toEqual([
      'extra_permissions',
      'extra_permissions',
    ]);
  });

  it('extra_permissions: no permissions block at all is a violation (GitHub would apply the repo default)', () => {
    const out = validateWorkflow(wf({ permissions: '' }));
    expect(out.map((v) => v.rule)).toEqual(['extra_permissions']);
    expect(out[0]!.message).toContain('"review"');
    // an explicit block on every job is fine without a top-level one
    expect(rules(wf({ permissions: '', jobExtra: '    permissions:\n      contents: read' }))).toEqual([]);
    // and the generated workflow still declares them at the top
    expect(validateWorkflow(generated())).toEqual([]);
  });

  it('accepts the allowed permission levels, none, and an empty map', () => {
    expect(rules(wf({ permissions: 'permissions:\n  contents: read\n  pull-requests: write' }))).toEqual([]);
    expect(rules(wf({ permissions: 'permissions:\n  contents: none\n  pull-requests: read' }))).toEqual([]);
    expect(rules(wf({ permissions: 'permissions: {}' }))).toEqual([]);
  });

  it('unpinned_action: tag, branch and short SHA are flagged; full SHA and local actions are not', () => {
    for (const uses of ['actions/checkout@v4', 'actions/checkout@main', `actions/checkout@${'a'.repeat(39)}`, 'actions/checkout', `actions/checkout@${'A'.repeat(40)}`]) {
      const out = validateWorkflow(wf({ uses }));
      expect(out.map((v) => v.rule)).toEqual(['unpinned_action']);
      expect(out[0]!.message).toContain(uses);
    }
    expect(rules(wf({ uses: `actions/checkout@${SHA_A}` }))).toEqual([]);
    expect(rules(wf({ uses: './.github/actions/local' }))).toEqual([]);
  });

  it('unpinned_action: a reusable workflow `uses:` on the job itself is checked too', () => {
    const text = `
on:
  pull_request:
    types: [opened]
permissions:
  contents: read
jobs:
  call:
    uses: org/repo/.github/workflows/x.yml@v1
`;
    expect(rules(text)).toEqual(['unpinned_action']);
  });

  it('reports several rules at once', () => {
    const text = wf({
      on: 'on:\n  pull_request_target:\n    types: [opened]',
      permissions: 'permissions: write-all',
      uses: 'actions/checkout@v4',
    });
    expect(rules(text).sort()).toEqual(['extra_permissions', 'forbidden_trigger', 'unpinned_action']);
  });
});
