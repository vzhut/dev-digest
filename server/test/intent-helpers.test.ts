import { describe, it, expect } from 'vitest';
import {
  extractReferences,
  isSafeRepoPath,
  extractHunkHeaders,
  stripHtmlComments,
  inputHash,
  isStale,
  redactSecrets,
  summarizeSources,
  buildMissingContext,
  unavailableReason,
} from '../src/modules/intent/helpers.js';

const REPO = { owner: 'acme', name: 'payments-api' };

describe('extractReferences', () => {
  it('parses every issue form and dedupes', () => {
    const r = extractReferences(
      'Closes #12, see also acme/payments-api#12 and other/repo#7 and https://github.com/acme/payments-api/issues/9',
      REPO,
    );
    // an issue in ANOTHER repository is never fetched (the operator's token may see repos the PR author cannot)
    expect(r.issues.map((i) => i.ref)).toEqual(['#9', '#12']);
    expect(r.blocked).toContainEqual({ kind: 'github_issue', ref: 'other/repo#7', reason: 'issue in another repository' });
  });

  it('blocks a cross-repo issue URL too, and never lets it use up the same-repo reference cap', () => {
    const r = extractReferences('https://github.com/other/private/issues/5 #1 #2 #3', REPO);
    expect(r.issues.map((i) => i.ref)).toEqual(['#1', '#2', '#3']);
    expect(r.blocked).toContainEqual({ kind: 'github_issue', ref: 'other/private#5', reason: 'issue in another repository' });
  });

  it('caps issues at 3 and records the overflow as blocked', () => {
    const r = extractReferences('#1 #2 #3 #4', REPO);
    expect(r.issues).toHaveLength(3);
    expect(r.blocked).toEqual([{ kind: 'github_issue', ref: '#4', reason: 'reference limit reached' }]);
  });

  it('maps a same-repo blob URL to a repo file and finds plain paths', () => {
    const r = extractReferences(
      'Spec: https://github.com/acme/payments-api/blob/main/specs/a.md and docs/plan.md',
      REPO,
    );
    expect(r.files.map((f) => f.path)).toEqual(['specs/a.md', 'docs/plan.md']);
  });

  it('blocks a blob URL from another repository', () => {
    const r = extractReferences('https://github.com/evil/x/blob/main/a.md', REPO);
    expect(r.files).toEqual([]);
    expect(r.blocked[0]).toMatchObject({ reason: 'file in another repository' });
  });

  it('blocks arbitrary URLs and logs only the host', () => {
    const r = extractReferences('see https://evil.example/x?token=abc#frag', REPO);
    expect(r.blocked).toEqual([{ kind: 'external_ticket', ref: 'evil.example', reason: 'arbitrary URL not fetched' }]);
    expect(JSON.stringify(r)).not.toContain('token=abc');
  });

  it('extracts Jira and Linear tickets as host/KEY', () => {
    const r = extractReferences(
      'https://jira.acme.com/browse/abc-1?focusedId=5 and https://linear.app/acme/issue/ENG-42/some-slug',
      REPO,
    );
    expect(r.tickets.map((t) => t.ref)).toEqual(['jira.acme.com/ABC-1', 'linear.app/ENG-42']);
  });

  it('rejects traversal-style paths as blocked', () => {
    const r = extractReferences('read ../../secrets.txt please', REPO);
    expect(r.files).toEqual([]);
    expect(r.blocked[0]).toMatchObject({ kind: 'repo_file', reason: 'unsafe path' });
  });

  it('ignores HTML entities and version-like text', () => {
    const r = extractReferences('&#123; user@host.txt', REPO);
    expect(r.issues).toEqual([]);
    expect(r.files).toEqual([]);
  });

  it('parses a 100 KB adversarial body in well under 50 ms', () => {
    const bodies = ['a'.repeat(100_000), 'a/'.repeat(50_000), '<!--'.repeat(25_000), '#'.repeat(100_000), 'a.'.repeat(50_000)];
    for (const b of bodies) {
      const t0 = performance.now();
      extractReferences(b, REPO);
      stripHtmlComments(b);
      expect(performance.now() - t0).toBeLessThan(50);
    }
  });
});

describe('isSafeRepoPath', () => {
  it.each([
    ['specs/a.md', true],
    ['README.md', true],
    ['docs/notes.txt', true],
    ['../../etc/passwd', false],
    ['../a.md', false],
    ['a/../b.md', false],
    ['/etc/passwd.md', false],
    ['C:/x.md', false],
    ['a\\b.md', false],
    ['a\0.md', false],
    ['-rf.md', false],
    ['src/index.ts', false],
    ['.git/config.txt', false],
    ['a//b.md', false],
    [`${'a/'.repeat(120)}b.md`, false],
  ])('%s → %s', (p, ok) => {
    expect(isSafeRepoPath(p)).toBe(ok);
  });
});

describe('extractHunkHeaders', () => {
  it('returns hunk headers only, never body lines', () => {
    const raw = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,3 +1,4 @@ function foo() {',
      ' const a = 1;',
      '+const secret = "sk_live_body";',
      '-old line',
      '@@ -20 +21,2 @@',
      '+@@ not a header',
    ].join('\n');
    expect(extractHunkHeaders(raw)).toEqual(['@@ -1,3 +1,4 @@ function foo() {', '@@ -20 +21,2 @@']);
  });

  it('caps count and length', () => {
    const raw = Array.from({ length: 300 }, (_, i) => `@@ -${i} +${i} @@ ${'x'.repeat(400)}`).join('\n');
    const h = extractHunkHeaders(raw);
    expect(h).toHaveLength(200);
    expect(h[0]!.length).toBe(160);
  });

  it('handles empty input', () => {
    expect(extractHunkHeaders(null)).toEqual([]);
  });
});

describe('stripHtmlComments', () => {
  it('removes terminated and unterminated comments', () => {
    expect(stripHtmlComments('a<!-- hidden -->b')).toBe('ab');
    expect(stripHtmlComments('a<!-- never closed')).toBe('a');
  });
});

describe('inputHash / isStale', () => {
  const base = { title: 't', body: 'b', headSha: 'abc', files: [{ path: 'a', additions: 1, deletions: 0 }] };
  it('is deterministic and order-insensitive over files', () => {
    const f2 = { path: 'b', additions: 2, deletions: 1 };
    expect(inputHash({ ...base, files: [...base.files, f2] })).toBe(inputHash({ ...base, files: [f2, ...base.files] }));
  });
  it('changes when an input changes', () => {
    expect(inputHash(base)).not.toBe(inputHash({ ...base, body: 'other' }));
    expect(inputHash(base)).not.toBe(inputHash({ ...base, files: [] }));
  });
  it('flags stale on head or hash change', () => {
    const h = inputHash(base);
    expect(isStale({ headSha: 'abc', inputHash: h }, { headSha: 'abc' }, h)).toBe(false);
    expect(isStale({ headSha: 'abc', inputHash: h }, { headSha: 'def' }, h)).toBe(true);
    expect(isStale({ headSha: 'abc', inputHash: 'x' }, { headSha: 'abc' }, h)).toBe(true);
  });
});

describe('redactSecrets', () => {
  it('masks tokens, bearer headers, userinfo and query strings', () => {
    const msg =
      // fake credentials, assembled at runtime so no source line looks like a real token
      `fatal: https://x-access-token:${'ghp_'}abcdefghijklmnop1234@github.com/o/r.git failed; Authorization: Bearer ${'sk-or-v1-'}abcdef1234567890; see https://api.x.io/v1?key=SECRET`;
    const out = redactSecrets(msg);
    expect(out).not.toMatch(/ghp_abc|sk-or-v1-abc|SECRET|x-access-token:ghp/);
    expect(out).toContain('https://***@github.com');
    expect(out).toContain('Bearer ***');
  });
  it('masks a Jira Basic header and a Linear key', () => {
    const basic = Buffer.from('me@acme.com:jira-token-abcdef123456').toString('base64');
    const out = redactSecrets(`request failed: Authorization: Basic ${basic}; lin_api_abcdefghij0123456789 rejected`);
    expect(out).not.toContain(basic);
    expect(out).not.toContain('lin_api_abcdefghij');
    expect(out).toContain('Basic ***');
    expect(out).toContain('lin_api_***');
  });
  it('caps length', () => {
    expect(redactSecrets('a'.repeat(1000)).length).toBe(300);
  });
});

describe('source bookkeeping', () => {
  const sources = [
    { kind: 'pr_title', ref: 'title', status: 'used', chars: 10 },
    { kind: 'pr_description', ref: 'description', status: 'used', chars: 812 },
    { kind: 'file_list', ref: 'files', status: 'missing', reason: 'file list not loaded — open the PR once', chars: 0 },
    { kind: 'github_issue', ref: '#12', status: 'used', chars: 100 },
    { kind: 'repo_file', ref: 'specs/x.md', status: 'missing', reason: 'not found', chars: 0 },
  ] as const;
  it('summarizes with refs and counts only', () => {
    expect(summarizeSources(sources)).toBe(
      'title, description 812ch, files missing (file list not loaded — open the PR once), #12 ok, specs/x.md missing (not found)',
    );
  });
  it('lists only what is unavailable', () => {
    expect(buildMissingContext(sources)).toEqual([
      'files: file list not loaded — open the PR once',
      'specs/x.md (not found)',
    ]);
  });
  it('maps errors to short reasons', () => {
    expect(unavailableReason({ status: 404 })).toBe('not found');
    expect(unavailableReason({ code: 'config_error' })).toBe('not configured');
    expect(unavailableReason(new Error('boom ghp_secret'))).toBe('unavailable');
  });
});
