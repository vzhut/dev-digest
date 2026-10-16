import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { CiRunItem, type CiResultArtifact, type CiWorkflowRun } from '@devdigest/shared';
import {
  ciRunKey,
  isCompleted,
  noArtifactStatus,
  parseArtifactZip,
  runPathRejection,
  toCiRunItem,
  toCiRunRecord,
  verifyArtifact,
  type CiRunRow,
} from '../src/modules/ci/ingest.js';

/**
 * Pure ingest logic. The artifact is produced by an untrusted CI environment,
 * so every rejection path is asserted: forged repository id, wrong commit,
 * wrong workflow file, oversize zip/entry, missing/invalid/schema-invalid JSON.
 */

const SHA = 'b'.repeat(40);

const artifact = (over: Partial<CiResultArtifact> = {}): CiResultArtifact => ({
  artifact_version: 2,
  repository: 'acme/widgets',
  repository_id: 4242,
  head_sha: SHA,
  findings_count: 3,
  critical: 1,
  warning: 1,
  suggestion: 1,
  blockers: 1,
  verdict: 'fail',
  cost_usd: 0.0123,
  duration_ms: 8000,
  agent: 'General Reviewer',
  manifest_version: 4,
  model: 'deepseek/deepseek-chat',
  runner_version: '1.2.3',
  node_version: '22.1.0',
  skill_versions: { 'api-gate': 2 },
  version: null,
  pr_number: 17,
  ...over,
});

const run = (over: Partial<CiWorkflowRun> = {}): CiWorkflowRun => ({
  id: 9001,
  run_attempt: 2,
  head_sha: SHA,
  path: '.github/workflows/devdigest-review.yml',
  status: 'completed',
  conclusion: 'success',
  html_url: 'https://github.com/acme/widgets/actions/runs/9001',
  repository_id: 4242,
  updated_at: '2026-10-14T10:00:00Z',
  ...over,
});

const zipOf = (entries: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])));

const CTX = { workspaceId: 'ws-1', agentId: 'agent-1', agentName: 'General Reviewer', repo: 'acme/widgets' };

describe('ciRunKey / runPathRejection / isCompleted', () => {
  it('keys a run by id and attempt', () => {
    expect(ciRunKey({ id: 9001, run_attempt: 2 })).toBe('9001:2');
    expect(ciRunKey({ id: 9001, run_attempt: 1 })).not.toBe(ciRunKey({ id: 9001, run_attempt: 2 }));
  });

  it('accepts only the devdigest workflow file and only completed runs', () => {
    expect(runPathRejection({ path: '.github/workflows/devdigest-review.yml' })).toBeNull();
    expect(runPathRejection({ path: '.github/workflows/other.yml' })).toBe('workflow_path_mismatch');
    expect(runPathRejection({ path: '.github/workflows/devdigest-review.yml@refs/heads/x' })).toBe('workflow_path_mismatch');
    expect(isCompleted({ status: 'completed' })).toBe(true);
    expect(isCompleted({ status: 'in_progress' })).toBe(false);
    expect(isCompleted({ status: null })).toBe(false);
  });
});

describe('verifyArtifact', () => {
  it('passes when repository id and commit match the run', () => {
    expect(verifyArtifact(artifact(), run())).toBeNull();
  });

  it('rejects a forged repository id', () => {
    expect(verifyArtifact(artifact({ repository_id: 1 }), run())).toBe('repository_mismatch');
  });

  it('rejects a mismatched head sha', () => {
    expect(verifyArtifact(artifact({ head_sha: 'c'.repeat(40) }), run())).toBe('sha_mismatch');
  });
});

describe('parseArtifactZip', () => {
  it('parses a valid artifact and ignores extra entries', () => {
    const zip = zipOf({
      'devdigest-result.json': JSON.stringify(artifact()),
      'notes.txt': 'ignored',
      'nested/dir/other.json': '{"x":1}',
    });
    const out = parseArtifactZip(zip);
    expect(out).toEqual({ ok: true, artifact: artifact() });
  });

  it('rejects a zip over the size cap without unzipping it', () => {
    // random-ish bytes: not a zip, but the size check must fire first
    const big = new Uint8Array(64 * 1024 + 1).fill(7);
    expect(parseArtifactZip(big)).toEqual({ ok: false, reason: 'artifact_too_large' });
  });

  it('rejects an oversized result entry even when the zip itself is tiny (zip bomb)', () => {
    const zip = zipOf({ 'devdigest-result.json': 'a'.repeat(200 * 1024) });
    expect(zip.byteLength).toBeLessThan(64 * 1024);
    const out = parseArtifactZip(zip);
    expect(out.ok).toBe(false);
  });

  it('rejects bytes that are not a zip', () => {
    expect(parseArtifactZip(strToU8('definitely not a zip file'))).toEqual({ ok: false, reason: 'unzip_failed' });
  });

  it('rejects a zip without devdigest-result.json', () => {
    expect(parseArtifactZip(zipOf({ 'other.json': JSON.stringify(artifact()) }))).toEqual({
      ok: false,
      reason: 'result_file_missing',
    });
    // only the exact top-level name counts
    expect(parseArtifactZip(zipOf({ 'sub/devdigest-result.json': JSON.stringify(artifact()) }))).toEqual({
      ok: false,
      reason: 'result_file_missing',
    });
  });

  it('rejects invalid JSON and invalid UTF-8', () => {
    expect(parseArtifactZip(zipOf({ 'devdigest-result.json': '{not json' }))).toEqual({ ok: false, reason: 'json_invalid' });
    const badUtf8 = zipSync({ 'devdigest-result.json': new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]) });
    expect(parseArtifactZip(badUtf8)).toEqual({ ok: false, reason: 'json_invalid' });
  });

  it('rejects JSON that does not match the artifact schema', () => {
    const wrongVersion = { ...artifact(), artifact_version: 1 };
    const badSha = { ...artifact(), head_sha: 'zzz' };
    const negative = { ...artifact(), findings_count: -1 };
    const absurd = { ...artifact(), cost_usd: 1e9 };
    for (const doc of [wrongVersion, badSha, negative, absurd, [], null, 'str']) {
      expect(parseArtifactZip(zipOf({ 'devdigest-result.json': JSON.stringify(doc) }))).toEqual({
        ok: false,
        reason: 'schema_invalid',
      });
    }
  });
});

describe('noArtifactStatus', () => {
  it('maps failure-like conclusions to failed, everything else to skipped', () => {
    for (const c of ['failure', 'cancelled', 'timed_out']) expect(noArtifactStatus({ conclusion: c })).toBe('failed');
    for (const c of ['success', 'skipped', 'neutral', null]) expect(noArtifactStatus({ conclusion: c })).toBe('skipped');
  });
});

describe('toCiRunRecord', () => {
  it('maps an accepted artifact to a done agent_runs row and a ci trace', () => {
    const rec = toCiRunRecord(CTX, run(), artifact());
    expect(rec.run).toEqual({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      ranAt: new Date('2026-10-14T10:00:00Z'),
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      durationMs: 8000,
      costUsd: 0.0123,
      status: 'done',
      error: null,
      findingsCount: 3,
      blockers: 1,
    });
    // the PR link is never part of the values: a CI run is not tied to an imported PR
    expect(rec.run).not.toHaveProperty('prId');
    expect(rec.trace).toEqual({
      source: 'ci',
      ci_run_key: '9001:2',
      repo: 'acme/widgets',
      pr_number: 17,
      pr_url: 'https://github.com/acme/widgets/pull/17',
      commit_sha: SHA,
      job_url: 'https://github.com/acme/widgets/actions/runs/9001',
      agent_name: 'General Reviewer',
      manifest_version: 4,
      model: 'deepseek/deepseek-chat',
      verdict: 'fail',
      critical: 1,
      warning: 1,
      suggestion: 1,
      dependencies: { runner_version: '1.2.3', node_version: '22.1.0', skill_versions: { 'api-gate': 2 } },
    });
  });

  it('uses the artifact PR number only; a missing one yields a null pr_url', () => {
    const rec = toCiRunRecord(CTX, run(), artifact({ pr_number: undefined, skill_versions: undefined }));
    expect(rec.trace.pr_number).toBeNull();
    expect(rec.trace.pr_url).toBeNull();
    expect(rec.trace.dependencies.skill_versions).toEqual({});
  });

  it('stores a run without an artifact as failed or skipped with an error note and null metrics', () => {
    const failed = toCiRunRecord(CTX, run({ conclusion: 'failure' }), null);
    expect(failed.run).toMatchObject({
      status: 'failed',
      error: 'no result artifact',
      model: null,
      costUsd: null,
      durationMs: null,
      findingsCount: null,
      blockers: null,
    });
    expect(failed.trace).toMatchObject({ verdict: null, pr_number: null, manifest_version: null, ci_run_key: '9001:2' });

    expect(toCiRunRecord(CTX, run({ conclusion: 'skipped' }), null).run.status).toBe('skipped');
    expect(toCiRunRecord(CTX, run({ conclusion: 'cancelled' }), null).run.status).toBe('failed');
  });
});

describe('toCiRunItem', () => {
  const row = (over: Partial<CiRunRow> = {}): CiRunRow => ({
    id: 'run-1',
    agentId: 'agent-1',
    ranAt: new Date('2026-10-14T10:00:00Z'),
    status: 'done',
    blockers: 1,
    findingsCount: 3,
    costUsd: 0.0123,
    durationMs: 8000,
    trace: toCiRunRecord(CTX, run(), artifact()).trace,
    ...over,
  });

  it('maps a stored row back to the wire DTO (snake_case, ISO date)', () => {
    const item = toCiRunItem(row())!;
    expect(item).toEqual({
      id: 'run-1',
      agent_id: 'agent-1',
      agent_name: 'General Reviewer',
      repo: 'acme/widgets',
      pr_number: 17,
      pr_url: 'https://github.com/acme/widgets/pull/17',
      commit_sha: SHA,
      status: 'done',
      verdict: 'fail',
      blockers: 1,
      findings_count: 3,
      critical: 1,
      warning: 1,
      suggestion: 1,
      cost_usd: 0.0123,
      duration_ms: 8000,
      ran_at: '2026-10-14T10:00:00.000Z',
      job_url: 'https://github.com/acme/widgets/actions/runs/9001',
    });
    expect(CiRunItem.safeParse(item).success).toBe(true);
  });

  it('defaults optional trace fields to null (older/partial traces)', () => {
    const item = toCiRunItem(row({ trace: { repo: 'a/b', agent_name: 'X', job_url: 'https://x' } }))!;
    expect(item).toMatchObject({
      pr_number: null,
      pr_url: null,
      commit_sha: null,
      verdict: null,
      critical: null,
      warning: null,
      suggestion: null,
    });
  });

  it('returns null for a row that is not a well-formed CI run', () => {
    expect(toCiRunItem(row({ trace: null }))).toBeNull();
    expect(toCiRunItem(row({ trace: { repo: 'a/b' } }))).toBeNull();
    expect(toCiRunItem(row({ status: null }))).toBeNull();
    expect(toCiRunItem(row({ status: 'running' }))).toBeNull();
  });
});
