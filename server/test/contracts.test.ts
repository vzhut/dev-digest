import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  PrIntentRecord,
  PrIntentResponse,
  FindingRecord,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  PrMeta,
  RunSummary,
  ContextPathList,
  SearchRoots,
  SetContextPathsBody,
  EvalExpectation,
  EvalCaseResult,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  CreateEvalCaseResponse,
  EvalRunCompare,
  EvalErrorCode,
  StartEvalRunResponse,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('BlastRadius additive fields (L04): old shape parses, new shape parses, bad reason fails', () => {
    const old = {
      changed_symbols: [{ name: 'f', file: 'a.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'f',
          callers: [{ name: 'g', file: 'b.ts', line: 3 }],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
      summary: 's',
    };
    expect(() => BlastRadius.parse(old)).not.toThrow();

    const full = BlastRadius.parse({
      ...old,
      downstream: [{ ...old.downstream[0], file: 'a.ts', callers_total: 25 }],
      degraded: true,
      reason: 'index_partial',
      index_status: 'partial',
      indexed_sha: 'abc123',
      stats: { symbols_changed: 5, symbols_affected: 1, callers: 25, endpoints: 2, crons: 0 },
      unattributed_endpoints: ['GET /x'],
    });
    expect(full.stats?.symbols_changed).toBe(5);
    expect(full.downstream[0]?.callers_total).toBe(25);

    // explicit nulls are tolerated too (.nullish)
    expect(() => BlastRadius.parse({ ...old, degraded: null, reason: null, stats: null })).not.toThrow();

    expect(() => BlastRadius.parse({ ...old, reason: 'bogus' })).toThrow();
  });

  it('PrHistory additive degraded fields (L04): old shape parses, reason enum enforced', () => {
    expect(() => PrHistory.parse({ history: [] })).not.toThrow();
    const h = PrHistory.parse({ history: [], degraded: true, reason: 'no_github_token' });
    expect(h.reason).toBe('no_github_token');
    expect(() => PrHistory.parse({ history: [], reason: 'nope' })).toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
    // A trace written before cost tracking has no `cost_usd` key at all. It
    // must still parse — hence `nullish()` on RunStats.cost_usd, not
    // `nullable()`. Regression guard for opening old runs' traces.
    expect(trace.stats.cost_usd ?? null).toBeNull();
  });

  it('RunStats carries the run cost when present', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', model: 'gpt-4.1', source: 'local' },
      stats: {
        duration_ms: 8200,
        tokens_in: 14820,
        tokens_out: 1240,
        cost_usd: 0.06,
        findings: 3,
        grounding: '3/3 passed',
      },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: [],
      log: [],
    });
    expect(trace.stats.cost_usd).toBe(0.06);
  });
});

describe('intent layer contracts', () => {
  const baseFinding = {
    id: 'f1',
    severity: 'WARNING',
    category: 'style',
    title: 't',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.5,
  };
  const record = {
    pr_id: 'p1',
    intent: 'Add rate limiting',
    in_scope: ['limiter'],
    out_of_scope: ['refactor'],
    risk_areas: ['webhooks'],
    head_sha: 'abc123',
    stale: false,
    confidence: 'medium',
    sources: [
      { kind: 'pr_title', ref: 'title', status: 'used', chars: 20 },
      { kind: 'repo_file', ref: 'specs/x.md', status: 'missing', reason: 'not found', chars: 0 },
    ],
    missing_context: ['specs/x.md'],
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    tokens_in: 1400,
    tokens_out: 180,
    cost_usd: 0.0003,
    duration_ms: 900,
    created_at: '2026-09-24T00:00:00.000Z',
    updated_at: '2026-09-24T00:00:00.000Z',
  };

  it('PrIntentRecord round-trips and PrIntentResponse allows null', () => {
    expect(PrIntentRecord.parse(record)).toEqual(record);
    expect(PrIntentResponse.parse({ intent: record }).intent?.pr_id).toBe('p1');
    expect(PrIntentResponse.parse({ intent: null }).intent).toBeNull();
    expect(() => PrIntentRecord.parse({ ...record, confidence: 'certain' })).toThrow();
  });

  it('Intent parses without risk_areas (pre-existing PrBrief rows)', () => {
    const i = Intent.parse({ intent: 'x', in_scope: [], out_of_scope: [] });
    expect(i.risk_areas ?? null).toBeNull();
  });

  it('Finding parses without scope; FindingRecord carries original_severity', () => {
    expect(Finding.parse(baseFinding).scope ?? null).toBeNull();
    expect(Finding.parse({ ...baseFinding, scope: 'out_of_scope' }).scope).toBe('out_of_scope');
    expect(() => Finding.parse({ ...baseFinding, scope: 'elsewhere' })).toThrow();
    const rec = FindingRecord.parse({
      ...baseFinding,
      severity: 'SUGGESTION',
      original_severity: 'WARNING',
      review_id: 'r1',
      accepted_at: null,
      dismissed_at: null,
    });
    expect(rec.original_severity).toBe('WARNING');
  });

  it('PromptAssembly parses without intent (traces written before the intent layer)', () => {
    const base = {
      config: { agent: 'A', model: 'm', source: 'local' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0 passed' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: [],
      log: [],
    };
    const old = RunTrace.parse({ ...base, prompt_assembly: { system: 's', user: 'u' } });
    expect(old.prompt_assembly.intent ?? null).toBeNull();
    const withIntent = RunTrace.parse({
      ...base,
      prompt_assembly: { system: 's', user: 'u', intent: '<untrusted>…</untrusted>' },
    });
    expect(withIntent.prompt_assembly.intent).toContain('untrusted');
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });

  it('PrMeta.latest_findings + RunSummary.findings carry previews and stay optional', () => {
    const preview = {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key in commit',
      file: 'src/config.ts',
      start_line: 12,
      end_line: 12,
      confidence: 0.98,
      summary: 'Line 12 contains a literal `sk_live_` Stripe key.',
    };
    const pr = {
      number: 482,
      title: 't',
      author: 'a',
      branch: 'b',
      base: 'main',
      head_sha: 'sha',
      additions: 1,
      deletions: 0,
      files_count: 1,
      status: 'open',
    };
    expect(PrMeta.parse({ ...pr, latest_findings: [preview] }).latest_findings).toHaveLength(1);
    expect(PrMeta.parse({ ...pr, latest_findings: null }).latest_findings).toBeNull();
    expect(PrMeta.parse(pr).latest_findings).toBeUndefined();

    const run = {
      run_id: 'run1',
      agent_id: null,
      agent_name: null,
      provider: null,
      model: null,
      status: 'done',
      error: null,
      duration_ms: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      findings_count: 1,
      grounding: null,
      ran_at: null,
      score: 65,
      blockers: 1,
    };
    expect(RunSummary.parse({ ...run, findings: [preview] }).findings).toHaveLength(1);
    expect(RunSummary.parse(run).findings).toBeUndefined();
    // A preview is a projection, not a full finding: rationale is not accepted in place of summary.
    expect(() =>
      RunSummary.parse({ ...run, findings: [{ ...preview, summary: undefined, rationale: 'x' }] }),
    ).toThrow();
  });
});

describe('project context contracts', () => {
  const baseTrace = {
    config: { agent: 'a', model: 'm' },
    stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0' },
    prompt_assembly: { system: 's', user: 'u' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    log: [],
  };

  it('RunTrace.specs_read accepts legacy strings and object entries', () => {
    const legacy = RunTrace.parse({ ...baseTrace, specs_read: ['specs/a.md'] });
    expect(legacy.specs_read).toEqual(['specs/a.md']);
    const mixed = RunTrace.parse({
      ...baseTrace,
      specs_read: [
        'specs/a.md',
        { path: 'docs/b.md', tokens: 12, status: 'included' },
        { path: 'docs/c.md', tokens: 0, status: 'missing', reason: 'not found' },
      ],
    });
    expect(mixed.specs_read).toHaveLength(3);
    expect(() =>
      RunTrace.parse({ ...baseTrace, specs_read: [{ path: 'x.md', tokens: 1, status: 'truncated' }] }),
    ).toThrow();
  });

  it('ContextPathList accepts clean paths and rejects unsafe ones', () => {
    expect(ContextPathList.parse(['specs/a.md', 'docs/x/b.md'])).toHaveLength(2);
    const bad = [
      ['../../etc/passwd.md'],
      ['/abs.md'],
      ['a.txt'],
      ['docs/a".md'],
      ['docs\\a.md'],
      ['docs/a\n.md'],
      ['docs/./a.md'],
      ['docs//a.md'],
      ['a.md', 'a.md'],
    ];
    for (const paths of bad) expect(ContextPathList.safeParse(paths).success).toBe(false);
    expect(SetContextPathsBody.safeParse({ paths: ['../x.md'] }).success).toBe(false);
  });

  it('SearchRoots caps at 20 and rejects absolute / traversal globs', () => {
    expect(SearchRoots.parse([])).toEqual([]);
    expect(SearchRoots.safeParse(Array.from({ length: 20 }, (_, i) => `d${i}/**/*.md`)).success).toBe(true);
    expect(SearchRoots.safeParse(Array.from({ length: 21 }, (_, i) => `d${i}/**/*.md`)).success).toBe(false);
    expect(SearchRoots.safeParse(['/etc/*.md']).success).toBe(false);
    expect(SearchRoots.safeParse(['../x/*.md']).success).toBe(false);
    expect(SearchRoots.safeParse(['']).success).toBe(false);
  });
});

describe('eval pipeline contracts', () => {
  const expectation = { type: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 14 } as const;
  const meta = {
    source_finding_id: 'f1',
    source_review_id: 'r1',
    repo: 'acme/api',
    pr_number: 482,
    head_sha: 'abc123',
    pr_title: 'Add payments',
  };
  const run = {
    id: 'run1',
    agent_id: 'a1',
    agent_version: 3,
    status: 'completed',
    ran_at: '2026-10-08T09:14:00.000Z',
    finished_at: '2026-10-08T09:15:00.000Z',
    cases_done: 2,
    traces_passed: 1,
    traces_total: 2,
    cases_errored: 0,
    unlabeled: 0,
    recall: null,
    precision: 0.5,
    citation_accuracy: 1,
    cost_usd: null,
    cost_partial: true,
    duration_ms: 60000,
  };

  it('EvalExpectation: label is optional, bad type and missing lines are rejected', () => {
    expect(EvalExpectation.parse(expectation).label).toBeUndefined();
    expect(
      EvalExpectation.parse({ ...expectation, label: { title: 't', category: 'bug', severity: 'WARNING' } }).label?.title,
    ).toBe('t');
    expect(EvalExpectation.safeParse({ ...expectation, type: 'should_find' }).success).toBe(false);
    expect(EvalExpectation.safeParse({ type: 'must_find', file: 'a.ts' }).success).toBe(false);
  });

  it('CreateEvalCaseResponse round-trips a case with a frozen diff', () => {
    const body = {
      created: true,
      case: {
        id: 'c1',
        agent_id: 'a1',
        name: 'must_find-hardcoded-stripe-secret-key',
        expectation,
        meta,
        input_files: ['src/config.ts'],
        created_at: '2026-10-08T09:00:00.000Z',
        last_result: 'never_run',
        input_diff: 'diff --git a/src/config.ts b/src/config.ts\n',
      },
    };
    expect(CreateEvalCaseResponse.parse(body)).toEqual(body);
    expect(CreateEvalCaseResponse.safeParse({ ...body, case: { ...body.case, last_result: 'weird' } }).success).toBe(false);
  });

  it('EvalSuiteRun allows null metrics (never 0) and the legacy-free traces_* names', () => {
    const parsed = EvalSuiteRun.parse(run);
    expect(parsed.recall).toBeNull();
    expect(EvalSuiteRun.safeParse({ ...run, status: 'failed' }).success).toBe(false);
    expect(EvalSuiteRun.safeParse({ ...run, cases_errored: undefined }).success).toBe(false);
  });

  it('EvalSuiteRunDetail parses a stored run whose results predate optional fields', () => {
    const result = {
      case_id: 'c1',
      status: 'error',
      produced: [],
      dropped: [],
      outcomes: [{ expectation, matched_by: [] }],
      noise: [],
      unlabeled: [],
      cost_usd: null,
      duration_ms: 12,
    };
    expect(EvalCaseResult.parse(result).error).toBeUndefined();
    const detail = EvalSuiteRunDetail.parse({
      ...run,
      provider: 'openrouter',
      model: 'x/y',
      system_prompt: 'p',
      strategy: null,
      skills: [{ id: 's1', name: 'skill' }],
      case_ids: ['c1'],
      results: [result],
    });
    expect(detail.skills[0]?.version).toBeUndefined();
  });

  it('EvalRunCompare requires old/new details, prompt diff ops and case-set counts', () => {
    expect(EvalRunCompare.safeParse({}).success).toBe(false);
    expect(EvalErrorCode.options).toEqual(
      expect.arrayContaining([
        'finding_not_triaged',
        'finding_has_no_agent',
        'expectation_not_grounded',
        'diff_unavailable',
      ]),
    );
    expect(StartEvalRunResponse.parse({ eval_run_id: 'r', status: 'running' }).status).toBe('running');
  });
});
