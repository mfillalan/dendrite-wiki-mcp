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
    await fs.mkdir(path.dirname(memoryStorePath), { recursive: true });

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
      proposedText: '## Promoted Lessons\n\n- The review bridge needs a trusted token.\n  - _Provenance: kind: lesson · recalled 3x · Sources: wiki:review-bridge, wiki:architecture_\n',
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
    await fs.mkdir(path.dirname(memoryStorePath), { recursive: true });
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
      supersededMemoryIds: ['mem_review_bridge_token'],
      updatedPaths: ['docs/wiki/review-bridge.md', 'docs/wiki/project-log.md'],
      projectLogEntry: 'Promoted project-local memory mem_review_bridge_token into review-bridge.',
      undoPath: 'Inspect docs/wiki/review-bridge.md and docs/wiki/project-log.md with git diff, then restore either file from version control if the promotion should be reverted. The promoted memory was marked superseded in the memory store; reset them to active in local-data/project-memories.json if you want them to keep appearing in the inbox.'
    });

    const reviewBridgePage = await fs.readFile(reviewBridgePath, 'utf8');
    assert.match(reviewBridgePage, /## Promoted Lessons\n\n- The review bridge needs a trusted token\./);

    const projectLog = await fs.readFile(projectLogPath, 'utf8');
    assert.match(projectLog, /Promoted project-local memory mem_review_bridge_token into review-bridge\./);

    // Regression guard: the source memory record must transition to status='superseded'
    // so the inbox stops flagging it as promotion-ready on subsequent reviews.
    const memoryStoreContent = JSON.parse(await fs.readFile(memoryStorePath, 'utf8')) as {
      memories: Array<{ id: string; status: string }>;
    };
    const supersededRecord = memoryStoreContent.memories.find((record) => record.id === 'mem_review_bridge_token');
    assert.ok(supersededRecord, 'memory record should still exist after promotion');
    assert.equal(supersededRecord?.status, 'superseded', 'promoted memory must be marked superseded so it stops re-appearing in the inbox');
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
    await fs.mkdir(path.dirname(memoryStorePath), { recursive: true });
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

test('wiki:action can promote a skill-promotion-ready memory finding into a kind=skill memory', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-maintenance-actions-promote-skill-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(healthyFixtureRoot, tempFixtureRoot, { recursive: true });
  const memoryStorePath = path.join(tempFixtureRoot, 'local-data', 'project-memories.json');

  try {
    // Seed a memory with file/tag context that will trigger skill-scope inference and have
    // enough recall to qualify for skill-promotion-ready.
    await fs.mkdir(path.dirname(memoryStorePath), { recursive: true });
    await fs.writeFile(
      memoryStorePath,
      `${JSON.stringify({
        schemaVersion: 1,
        memories: [
          {
            id: 'mem_skill_candidate',
            kind: 'lesson',
            status: 'active',
            summary: 'Use Composition API in Vue components.',
            text: 'Use Composition API in Vue components and skip Options API.',
            tags: ['vue'],
            relatedFiles: ['docs/components/Card.vue'],
            relatedPages: ['architecture'],
            sources: [{ kind: 'file', slug: 'docs/components/Card.vue' }],
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-02T00:00:00.000Z',
            lastRecalledAt: '2026-05-03T00:00:00.000Z',
            recallCount: 4
          }
        ]
      }, null, 2)}\n`,
      'utf8'
    );

    const payload = await runMaintenanceActionIsolated(
      'memory:skill-promotion-ready:mem_skill_candidate:promote-memory-to-skill',
      tempFixtureRoot
    );

    assert.equal(payload.actionId, 'memory:skill-promotion-ready:mem_skill_candidate:promote-memory-to-skill');
    assert.equal(payload.resultKind, 'promoted-memory-to-skill');
    assert.match(payload.resultSummary, /Promoted memory mem_skill_candidate into a skill/);
    assert.match(payload.resultSummary, /inferred scope/);

    const result = payload.result as {
      source: { id: string; status: string };
      skill: { id: string; kind: string; scope: { languages: string[]; frameworks: string[]; filePatterns: string[] } };
      inferredScope: boolean;
    };
    assert.equal(result.source.id, 'mem_skill_candidate');
    assert.equal(result.source.status, 'superseded');
    assert.equal(result.skill.kind, 'skill');
    assert.equal(result.inferredScope, true);
    assert.ok(result.skill.scope.languages.includes('vue'));
    assert.ok(result.skill.scope.frameworks.includes('vue'));
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

test('wiki:action insert-h1 inserts an H1 heading derived from the slug for a missing-h1 finding', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-insert-h1-'));
  const docsWiki = path.join(tempRoot, 'docs', 'wiki');
  await fs.mkdir(docsWiki, { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'docs', 'index.md'), '# Index\n\n[No Heading](./wiki/no-heading.md)\n', 'utf8');
  await fs.writeFile(path.join(docsWiki, 'no-heading.md'), 'This page has no heading and no inbound links.\n', 'utf8');

  try {
    const targetPath = path.join(docsWiki, 'no-heading.md');
    const payload = await runMaintenanceActionIsolated(
      'lint:missing-h1:docs/wiki/no-heading.md:insert-h1',
      tempRoot
    );

    assert.equal(payload.resultKind, 'inserted-h1');
    assert.match(payload.resultSummary, /Inserted H1 heading into no-heading\.md/);
    const after = await fs.readFile(targetPath, 'utf8');
    assert.match(after, /^# No Heading\n\n/, 'first line should be the title-cased H1 derived from the slug');
    assert.ok(after.includes('This page has no heading and no inbound links.'), 'original body must be preserved');

    // Idempotent: a second call should be a no-op (the lint finding is also gone now,
    // but we test the action handler directly via the same dispatcher path).
    // The dispatcher won't find the action because the lint pass no longer reports
    // missing-h1 for this page — confirm by running once more and expecting an unknown-action error.
    await assert.rejects(
      () => runMaintenanceActionIsolated('lint:missing-h1:docs/wiki/no-heading.md:insert-h1', tempRoot),
      /Unknown maintenance action/,
      'after the H1 is inserted the lint finding goes away so the action no longer resolves'
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('wiki:action snooze-page-drift writes a snooze record that suppresses the finding on the next lint pass', async () => {
  // We hand-build a tiny wiki where docs/wiki/architecture.md has frontmatter + a vague
  // first paragraph, and the project-log keeps mentioning architecture with unrelated
  // tokens. That's the classic page-drift recipe.
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-snooze-action-'));
  const docsWiki = path.join(tempRoot, 'docs', 'wiki');
  await fs.mkdir(docsWiki, { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'docs', 'index.md'), '# Index\n\n[Arch](./wiki/architecture.md)\n', 'utf8');
  await fs.writeFile(
    path.join(docsWiki, 'architecture.md'),
    '# Architecture\n\nThis page describes the canonical architecture decisions.\n',
    'utf8'
  );
  // Project-log entries must span at least 2 distinct date headings within the 7-day
  // recency window so the page-drift detector's distinct-days gate (≥2) is satisfied.
  // Use today and yesterday.
  const todayMs = Date.now();
  const today = new Date(todayMs).toISOString().slice(0, 10);
  const yesterday = new Date(todayMs - 86_400_000).toISOString().slice(0, 10);
  await fs.writeFile(
    path.join(docsWiki, 'project-log.md'),
    `# Project Log\n\n## ${yesterday}\n\n- Reinforcement edges shipped for architecture pages with synaptic tagging cluster heuristics.\n\n## ${today}\n\n- Synaptic tagging classifier rolled out across architecture observation streams.\n`,
    'utf8'
  );

  try {
    const payload = await runMaintenanceActionIsolated(
      'lint:page-drift:docs/wiki/architecture.md:snooze-page-drift',
      tempRoot
    );

    assert.equal(payload.resultKind, 'snoozed-page-drift');
    assert.match(payload.resultSummary, /Snoozed page-drift for architecture/);
    const stored = JSON.parse(
      await fs.readFile(path.join(tempRoot, 'local-data', 'page-drift-snoozes.json'), 'utf8')
    ) as { snoozes: Array<{ slug: string }> };
    assert.equal(stored.snoozes.length, 1);
    assert.equal(stored.snoozes[0].slug, 'architecture');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('archiveGuidanceFile moves a dormant guidance file into a sibling archive directory and is idempotent', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-archive-guidance-'));
  const skillsDir = path.join(tempRoot, '.claude', 'skills');
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.writeFile(path.join(skillsDir, 'orphan-skill.md'), '# Orphan Skill\n\nThis skill is not linked from anywhere.\n', 'utf8');
  // Subprocess pattern: store.ts captures repoRoot at module load via process.cwd(),
  // so we must launch a fresh child with cwd set to tempRoot for the helper to resolve
  // paths correctly. Importing it inside this same test runner would re-use the original
  // cwd-bound module instance and resolve relative to the repo, not the temp dir.
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'store.ts')).href;
  const script = [
    'process.chdir(process.argv[1]);',
    'const m = await import(process.argv[2]);',
    'const first = await m.archiveGuidanceFile(".claude/skills/orphan-skill.md");',
    'const second = await m.archiveGuidanceFile(".claude/skills/archive/orphan-skill.md");',
    'process.stdout.write(JSON.stringify({ first, second }));'
  ].join(' ');
  const { stdout } = await execFileAsync(process.execPath, [
    '--import', 'tsx', '--eval', script, tempRoot, moduleUrl
  ], { cwd: repoRoot });

  try {
    const { first, second } = JSON.parse(stdout) as {
      first: { from: string; to: string; moved: boolean };
      second: { from: string; to: string; moved: boolean };
    };
    assert.equal(first.moved, true);
    assert.equal(first.from, '.claude/skills/orphan-skill.md');
    assert.equal(first.to, '.claude/skills/archive/orphan-skill.md');
    assert.equal(
      (await fs.stat(path.join(tempRoot, '.claude', 'skills', 'archive', 'orphan-skill.md'))).isFile(),
      true,
      'moved file must exist at the new path'
    );
    await assert.rejects(
      () => fs.stat(path.join(tempRoot, '.claude', 'skills', 'orphan-skill.md')),
      'original path must no longer exist'
    );
    assert.equal(second.moved, false, 'archiving an already-archived path must be a no-op');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});