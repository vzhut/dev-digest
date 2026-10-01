import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  buildRoutes,
  buildRunLocally,
  buildStructure,
  composeDataStores,
  computeHotness,
  computedReason,
  detectStack,
  hasHotnessHistory,
  hotnessWindowStart,
  rankReadingPath,
  scoreCandidates,
  selectCriticalPaths,
  type ManifestFile,
  type RankedFile,
} from '../src/modules/repo-intel/tour-facts.js';

const pkg = (o: object): string => JSON.stringify(o);
const rf = (path: string, pagerank: number, importedBy = 1, percentile = 50): RankedFile => ({
  path,
  pagerank,
  importedBy,
  percentile,
});

describe('detectStack (AC-8)', () => {
  it('detects items with their evidence path', () => {
    const m: ManifestFile[] = [
      { path: 'package.json', text: pkg({ dependencies: { fastify: '5', next: '15' } }) },
      { path: 'pnpm-lock.yaml', text: '' },
      { path: 'docker-compose.yml', text: '' },
    ];
    // Deterministic order: manifests sorted by depth then path.
    expect(detectStack(m)).toEqual([
      { name: 'Docker Compose', evidence_path: 'docker-compose.yml' },
      { name: 'Node.js/TypeScript', evidence_path: 'package.json' },
      { name: 'Fastify', evidence_path: 'package.json' },
      { name: 'Next.js', evidence_path: 'package.json' },
      { name: 'pnpm', evidence_path: 'pnpm-lock.yaml' },
    ]);
  });

  it('reads one level below, ignores deeper, tolerates a broken package.json', () => {
    const out = detectStack([
      { path: 'pyproject.toml', text: '' },
      { path: 'api/go.mod', text: '' },
      { path: 'a/b/Cargo.toml', text: '' },
      { path: 'web/package.json', text: '{nope' },
    ]);
    expect(out.map((i) => i.name)).toEqual(['Python', 'Go', 'Node.js/TypeScript']);
  });
});

describe('buildStructure (AC-9)', () => {
  it('caps 45 directories at 40, count desc then path, skipping excluded dirs case-insensitively', () => {
    const files: string[] = [];
    for (let i = 0; i < 45; i++) files.push(`d${String(i).padStart(2, '0')}/a.ts`);
    files.push('d44/b.ts', 'NODE_MODULES/x.ts', 'src/node_modules/y.ts', 'dist/z.ts', 'root.ts');
    const out = buildStructure(files);
    expect(out).toHaveLength(40);
    expect(out[0]).toEqual({ path: 'd44', files: 2 });
    expect(out[1]).toEqual({ path: 'd00', files: 1 });
    expect(out.some((e) => /node_modules|dist/i.test(e.path))).toBe(false);
  });

  it('limits depth to 2 and counts nested files toward ancestors', () => {
    expect(buildStructure(['a/b/c/d.ts', 'a/b/e.ts', 'a/f.ts'])).toEqual([
      { path: 'a', files: 3 },
      { path: 'a/b', files: 2 },
    ]);
  });

  it('has no hardcoded excluded-dir literal in the source (F9)', () => {
    const src = readFileSync(new URL('../src/modules/repo-intel/tour-facts.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/['"]node_modules['"]/);
  });
});

describe('buildRoutes (AC-10)', () => {
  it('orders by declaring file score then path; caps at 50', () => {
    const eps = [
      { method: 'GET', path: '/b', file: 'src/b.ts' },
      { method: 'GET', path: '/a', file: 'src/a.ts' },
      { method: 'POST', path: '/c', file: 'src/c.ts' },
    ];
    const out = buildRoutes(eps, new Map([['src/c.ts', 0.9], ['src/a.ts', 0.1], ['src/b.ts', 0.1]]));
    expect(out.map((r) => r.file)).toEqual(['src/c.ts', 'src/a.ts', 'src/b.ts']);
    const many = Array.from({ length: 60 }, (_, i) => ({ method: 'GET', path: `/${i}`, file: 'f.ts' }));
    expect(buildRoutes(many, new Map())).toHaveLength(50);
  });
});

describe('buildRunLocally (AC-11, D4, F8)', () => {
  const compose = `services:
  postgres:
    image: postgres:16
  redis:
    image: redis:7
  api:
    build: .
`;
  const base: ManifestFile[] = [
    { path: 'package.json', text: pkg({ scripts: { dev: 'rm -rf / && evil', start: 'x' } }) },
    { path: 'pnpm-lock.yaml', text: '' },
    { path: '.env.example', text: 'A=1' },
    { path: 'docker-compose.yml', text: compose },
  ];

  it('builds install, env copy, compose up, dev with sources and never emits script bodies', () => {
    const out = buildRunLocally(base);
    expect(out).toEqual([
      { command: 'pnpm install', source_path: 'pnpm-lock.yaml' },
      { command: 'cp .env.example .env', source_path: '.env.example' },
      { command: 'docker compose up -d postgres redis', source_path: 'docker-compose.yml' },
      { command: 'pnpm dev', source_path: 'package.json' },
    ]);
    expect(JSON.stringify(out)).not.toContain('evil');
  });

  it('falls back to npm without a lockfile, and to start when there is no dev', () => {
    const out = buildRunLocally([{ path: 'package.json', text: pkg({ scripts: { start: 'node .' } }) }]);
    expect(out).toEqual([
      { command: 'npm install', source_path: 'package.json' },
      { command: 'npm run start', source_path: 'package.json' },
    ]);
  });

  it('uses the first sub-package with dev when the root has none; make targets are names only', () => {
    const out = buildRunLocally([
      { path: 'web/package.json', text: pkg({ scripts: { dev: 'next' } }) },
      { path: 'api/package.json', text: pkg({ scripts: { dev: 'tsx' } }) },
    ]);
    expect(out.at(-1)).toEqual({ command: 'cd api && npm run dev', source_path: 'api/package.json' });
    const make = buildRunLocally([{ path: 'Makefile', text: 'install:\n\tpip install -r r.txt\nrun:\n\tpython app.py\n' }]);
    expect(make).toEqual([
      { command: 'make install', source_path: 'Makefile' },
      { command: 'make run', source_path: 'Makefile' },
    ]);
  });

  it('matches data stores by image name and parses a 2-space services block (F8)', () => {
    const yml = 'services:\n  store:\n    image: "library/postgres:16"\n  web:\n    image: nginx\n';
    expect(composeDataStores(yml)).toEqual(['store']);
    expect(composeDataStores('services:\n    mongo:\n      image: x\n')).toEqual(['mongo']);
    expect(composeDataStores('volumes:\n  redis:\n')).toEqual([]);
  });

  it('truncates a 1 MB compose file instead of crashing', () => {
    const big = 'services:\n  postgres:\n    image: postgres\n' + '  # pad\n'.repeat(130_000);
    expect(big.length).toBeGreaterThan(1_000_000);
    expect(composeDataStores(big)).toEqual(['postgres']);
  });
});

describe('hotness helpers (AC-12, AC-13, F10, D2)', () => {
  it('hotness_available is false for <= 1 commit; window is 180 days back', () => {
    expect(hasHotnessHistory(0)).toBe(false);
    expect(hasHotnessHistory(1)).toBe(false);
    expect(hasHotnessHistory(2)).toBe(true);
    expect(hotnessWindowStart(new Date('2026-07-01T00:00:00Z')).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('takes the max over the candidate set, not the whole clone', () => {
    const counts = new Map([['package-lock.json', 500], ['src/a.ts', 10], ['src/b.ts', 5]]);
    const h = computeHotness(counts, ['src/a.ts', 'src/b.ts']);
    expect(h.get('src/a.ts')).toBe(1);
    expect(h.get('src/b.ts')).toBe(0.5);
    expect(computeHotness(new Map(), ['src/a.ts']).get('src/a.ts')).toBe(0);
  });
});

describe('rankReadingPath (AC-12, AC-21)', () => {
  it('lets a hot file with lower pagerank overtake, excludes junk, caps at 8', () => {
    const ranked = [rf('src/a.ts', 0.5, 4, 90), rf('src/b.ts', 0.3, 2, 70), rf('test/x.ts', 0.9), rf('src/a.test.ts', 0.8)];
    const scored = scoreCandidates(ranked, new Map([['src/b.ts', 10], ['src/a.ts', 0]]));
    const out = rankReadingPath(scored);
    expect(out.map((r) => r.path)).toEqual(['src/b.ts', 'src/a.ts']);
    expect(out[0]).toMatchObject({ score: 0.6, hotness: 1, pagerank: 0.3, computed_reason: 'imported by 2 files · rank p70' });

    const twelve = Array.from({ length: 12 }, (_, i) => rf(`src/f${i}.ts`, 0.1));
    expect(rankReadingPath(scoreCandidates(twelve, null))).toHaveLength(8);
  });

  it('with no churn orders by pagerank, ties by path', () => {
    const out = rankReadingPath(scoreCandidates([rf('b.ts', 0.2), rf('a.ts', 0.2), rf('c.ts', 0.5)], null));
    expect(out.map((r) => r.path)).toEqual(['c.ts', 'a.ts', 'b.ts']);
    expect(out.every((r) => r.hotness === 0)).toBe(true);
  });

  it('formats the computed reason', () => {
    expect(computedReason(7, 93.4)).toBe('imported by 7 files · rank p93');
  });
});

describe('selectCriticalPaths (AC-14, F19)', () => {
  const scored = scoreCandidates(
    [rf('src/server.ts', 0.9), rf('src/middleware/auth.ts', 0.5), rf('src/lib/redis.ts', 0.3), rf('src/routes/users.ts', 0.1), rf('src/other.ts', 0.01)],
    null,
  );
  const imports = new Map([
    ['src/server.ts', ['src/middleware/auth.ts', 'src/server.test.ts']],
    ['src/middleware/auth.ts', ['src/lib/redis.ts']],
  ]);

  it('follows the chain, adds route files, excludes junk', () => {
    const out = selectCriticalPaths(scored, imports, ['src/routes/users.ts', 'src/routes/users.test.ts']);
    expect(out.map((r) => r.path)).toEqual(['src/server.ts', 'src/middleware/auth.ts', 'src/lib/redis.ts', 'src/routes/users.ts', 'src/other.ts']);
    expect(out[0]!.computed_reason).toMatch(/^imported by /);
  });

  it('ends a chain before a junk-only continuation (F19) and caps at 6', () => {
    const only = selectCriticalPaths(scoreCandidates([rf('src/a.ts', 0.9)], null), new Map([['src/a.ts', ['test/util.ts']]]), []);
    expect(only.map((r) => r.path)).toEqual(['src/a.ts']);
    const many = Array.from({ length: 20 }, (_, i) => `src/r${i}.ts`);
    expect(selectCriticalPaths([], new Map(), many)).toHaveLength(6);
  });
});
