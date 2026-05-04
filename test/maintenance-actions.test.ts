import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki');
const healthyFixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');
const execFileAsync = promisify(execFile);

test('wiki:action returns a normalized proposals payload for a stable action id', async () => {
  const payload = await runMaintenanceAction('lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals');

  assert.equal(payload.actionId, 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals');
  assert.equal(payload.resultKind, 'proposal-list');
  assert.equal(payload.resultSummary, 'Found 3 active proposals.');
  assert.ok(
    (payload.result as { proposals: Array<{ reviewSlug: string }> }).proposals.some(
      (proposal) => proposal.reviewSlug === 'pending-review/merge-guidance-github-copilot-instructions-md'
    )
  );
});

test('wiki:action returns page text for read actions', async () => {
  const payload = await runMaintenanceAction('lint:stale-claim:docs/wiki/linked-page.md:read-wiki-page');

  assert.equal(payload.resultKind, 'wiki-page-text');
  assert.equal(payload.resultSummary, 'Read wiki page: linked-page.');
  assert.deepEqual(payload.result, {
    text: await fs.readFile(path.join(fixtureRoot, 'docs', 'wiki', 'linked-page.md'), 'utf8')
  });
});

test('wiki:action can draft a promotion for a promotion-ready memory finding', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-maintenance-actions-draft-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(healthyFixtureRoot, tempFixtureRoot, { recursive: true });
  const memoryStorePath = path.join(tempFixtureRoot, 'local-data', 'project-memories.json');
  const reviewBridgePath = path.join(tempFixtureRoot, 'docs', 'wiki', 'review-bridge.md');

  try {
    await fs.rm(reviewBridgePath, { force: true });

    await fs.writeFile(
      memoryStorePath,
      `${JSON.stringify({
        schemaVersion: 1,
        memories: [
          {
            id: 'mem_review_bridge_token',
            kind: 'lesson',
            status: 'active',
            summary: 'The review bridge needs a trusted token.',
            text: 'The review bridge needs a trusted token.',
            tags: [],
            relatedFiles: [],
            relatedPages: ['review-bridge'],
            sources: [
              { kind: 'wiki', slug: 'review-bridge' },
              { kind: 'wiki', slug: 'architecture' }
            ],
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-02T00:00:00.000Z',
            lastRecalledAt: '2026-05-03T00:00:00.000Z',
            recallCount: 3
          }
        ]
      }, null, 2)}\n`,
      'utf8'
    );

    const payload = await runMaintenanceActionIsolated(
      'memory:promotion-ready:mem_review_bridge_token:draft-memory-promotion',
      tempFixtureRoot
    );

    assert.equal(payload.actionId, 'memory:promotion-ready:mem_review_bridge_token:draft-memory-promotion');
    assert.equal(payload.resultKind, 'drafted-memory-promotion');
    assert.equal(payload.resultSummary, 'Drafted a wiki promotion for 1 project-local memory.');
    assert.deepEqual(payload.result, {
      mode: 'draft',
      memoryIds: ['mem_review_bridge_token'],
      targetPage: {
        slug: 'review-bridge',
        path: 'docs/wiki/review-bridge.md',
        title: 'Review Bridge',
        exists: false
      },
      sectionHeading: '## Promoted Lessons',
      proposedText: '## Promoted Lessons\n\n- The review bridge needs a trusted token. Sources: wiki:review-bridge, wiki:architecture\n',
      sourceRefs: ['wiki:architecture', 'wiki:review-bridge'],
      rationale: '1 selected memory would be promoted into review-bridge; 1 is already source-backed and ready for canonical documentation review.',
      warnings: [
        'The target wiki page does not exist yet, so the draft should create a new page or choose a different canonical target.'
      ],
      undoPath: 'This draft does not mutate files. Review the proposed markdown first; when apply support is added, restore docs/wiki/review-bridge.md from version control if the promotion is not wanted.',
      records: [
        {
          id: 'mem_review_bridge_token',
          kind: 'lesson',
          summary: 'The review bridge needs a trusted token.'
        }
      ]
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('wiki:action can apply a promotion for a promotion-ready memory finding', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-maintenance-actions-apply-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(healthyFixtureRoot, tempFixtureRoot, { recursive: true });
  const memoryStorePath = path.join(tempFixtureRoot, 'local-data', 'project-memories.json');
  const reviewBridgePath = path.join(tempFixtureRoot, 'docs', 'wiki', 'review-bridge.md');
  const projectLogPath = path.join(tempFixtureRoot, 'docs', 'wiki', 'project-log.md');

  try {
    await fs.writeFile(reviewBridgePath, '# Review Bridge\n\nExisting target page.\n', 'utf8');
    await fs.writeFile(
      memoryStorePath,
      `${JSON.stringify({
        schemaVersion: 1,
        memories: [
          {
            id: 'mem_review_bridge_token',
            kind: 'lesson',
            status: 'active',
            summary: 'The review bridge needs a trusted token.',
            text: 'The review bridge needs a trusted token.',
            tags: [],
            relatedFiles: [],
            relatedPages: ['review-bridge'],
            sources: [
              { kind: 'wiki', slug: 'review-bridge' },
              { kind: 'wiki', slug: 'architecture' }
            ],
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-02T00:00:00.000Z',
            lastRecalledAt: '2026-05-03T00:00:00.000Z',
            recallCount: 3
          }
        ]
      }, null, 2)}\n`,
      'utf8'
    );

    const payload = await runMaintenanceActionIsolated(
      'memory:promotion-ready:mem_review_bridge_token:apply-memory-promotion',
      tempFixtureRoot
    );

    assert.equal(payload.actionId, 'memory:promotion-ready:mem_review_bridge_token:apply-memory-promotion');
    assert.equal(payload.resultKind, 'applied-memory-promotion');
    assert.equal(payload.resultSummary, 'Applied a wiki promotion for 1 project-local memory.');
    assert.deepEqual(payload.result, {
      mode: 'apply',
      memoryIds: ['mem_review_bridge_token'],
      targetPage: {
        slug: 'review-bridge',
        path: 'docs/wiki/review-bridge.md',
        title: 'Review Bridge',
        created: false
      },
      applied: true,
      skippedBecauseUnchanged: false,
      updatedPaths: ['docs/wiki/review-bridge.md', 'docs/wiki/project-log.md'],
      projectLogEntry: 'Promoted project-local memory mem_review_bridge_token into review-bridge.',
      undoPath: 'Inspect docs/wiki/review-bridge.md and docs/wiki/project-log.md with git diff, then restore either file from version control if the promotion should be reverted.'
    });

    const reviewBridgePage = await fs.readFile(reviewBridgePath, 'utf8');
    assert.match(reviewBridgePage, /## Promoted Lessons\n\n- The review bridge needs a trusted token\./);

    const projectLog = await fs.readFile(projectLogPath, 'utf8');
    assert.match(projectLog, /Promoted project-local memory mem_review_bridge_token into review-bridge\./);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('wiki:action can archive an older duplicate memory from a maintenance finding', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-maintenance-actions-duplicate-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(healthyFixtureRoot, tempFixtureRoot, { recursive: true });
  const memoryStorePath = path.join(tempFixtureRoot, 'local-data', 'project-memories.json');

  try {
    await fs.writeFile(
      memoryStorePath,
      `${JSON.stringify({
        schemaVersion: 1,
        memories: [
          {
            id: 'mem_duplicate_a',
            kind: 'lesson',
            status: 'active',
            summary: 'The review bridge needs a trusted token.',
            text: 'The review bridge needs a trusted token.',
            tags: [],
            relatedFiles: [],
            relatedPages: ['review-bridge'],
            sources: [{ kind: 'wiki', slug: 'review-bridge' }],
            createdAt: '2026-05-02T00:00:00.000Z',
            updatedAt: '2026-05-03T00:00:00.000Z',
            lastRecalledAt: '2026-05-03T00:00:00.000Z',
            recallCount: 2
          },
          {
            id: 'mem_duplicate_b',
            kind: 'lesson',
            status: 'active',
            summary: 'The review bridge needs a trusted token.',
            text: 'The review bridge needs a trusted token.',
            tags: [],
            relatedFiles: [],
            relatedPages: ['review-bridge'],
            sources: [{ kind: 'wiki', slug: 'review-bridge' }],
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T12:00:00.000Z',
            lastRecalledAt: '2026-05-02T00:00:00.000Z',
            recallCount: 1
          }
        ]
      }, null, 2)}\n`,
      'utf8'
    );

    const payload = await runMaintenanceActionIsolated(
      'memory:duplicate:mem_duplicate_b:archive-memory',
      tempFixtureRoot
    );

    assert.equal(payload.actionId, 'memory:duplicate:mem_duplicate_b:archive-memory');
    assert.equal(payload.resultKind, 'forgotten-project-memory');
    assert.equal(payload.resultSummary, 'Archived 1 project-local memory.');
    const forgetResult = payload.result as {
      id: string;
      mode: string;
      removed: boolean;
      record?: { id: string; status: string; summary: string; updatedAt: string; sources: Array<{ kind: string; slug: string }> };
    };
    assert.equal(forgetResult.id, 'mem_duplicate_b');
    assert.equal(forgetResult.mode, 'archive');
    assert.equal(forgetResult.removed, true);
    assert.equal(forgetResult.record?.id, 'mem_duplicate_b');
    assert.equal(forgetResult.record?.status, 'archived');
    assert.equal(forgetResult.record?.summary, 'The review bridge needs a trusted token.');
    assert.match(forgetResult.record?.updatedAt ?? '', /T/);
    assert.deepEqual(
      forgetResult.record?.sources.map((source) => ({ kind: source.kind, slug: source.slug })),
      [{ kind: 'wiki', slug: 'review-bridge' }]
    );

    const updatedStore = JSON.parse(await fs.readFile(memoryStorePath, 'utf8')) as {
      memories: Array<{ id: string; status: string }>;
    };
    assert.deepEqual(
      updatedStore.memories.map((record) => ({ id: record.id, status: record.status })),
      [
        { id: 'mem_duplicate_a', status: 'active' },
        { id: 'mem_duplicate_b', status: 'archived' }
      ]
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

async function runMaintenanceActionIsolated(
  actionId: string,
  cwd: string
): Promise<{
  actionId: string;
  resultKind: string;
  resultSummary: string;
  result: unknown;
}> {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'maintenance-actions.ts')).href;
  const { stdout } = await execFileAsync(process.execPath, [
    '--import',
    'tsx',
    '--eval',
    [
      'process.chdir(process.argv[1]);',
      'const actionId = process.argv[2];',
      'const moduleUrl = process.argv[3];',
      'const { executeMaintenanceAction } = await import(moduleUrl);',
      'const result = await executeMaintenanceAction(actionId);',
      'process.stdout.write(JSON.stringify(result));'
    ].join(' '),
    cwd,
    actionId,
    moduleUrl
  ], { cwd: repoRoot });

  return JSON.parse(stdout) as {
    actionId: string;
    resultKind: string;
    resultSummary: string;
    result: unknown;
  };
}

async function runMaintenanceAction(actionId: string): Promise<{
  actionId: string;
  resultKind: string;
  resultSummary: string;
  result: unknown;
}>
async function runMaintenanceAction(
  actionId: string,
  setup?: () => Promise<void>,
  cwd = fixtureRoot
): Promise<{
  actionId: string;
  resultKind: string;
  resultSummary: string;
  result: unknown;
}> {
  const originalCwd = process.cwd();
  process.chdir(cwd);

  try {
    if (setup) {
      await setup();
    }
    const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'maintenance-actions.ts')).href}?fixture=${Date.now()}-${Math.random()}`;
    const { executeMaintenanceAction } = await import(moduleUrl);
    return (await executeMaintenanceAction(actionId)) as {
      actionId: string;
      resultKind: string;
      resultSummary: string;
      result: unknown;
    };
  } finally {
    process.chdir(originalCwd);
  }
}