import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki');

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
  const memoryStorePath = path.join(fixtureRoot, 'local-data', 'project-memories.json');
  const reviewBridgePath = path.join(fixtureRoot, 'docs', 'wiki', 'review-bridge.md');
  const originalMemoryStore = await fs.readFile(memoryStorePath, 'utf8').catch(() => undefined);
  const originalReviewBridge = await fs.readFile(reviewBridgePath, 'utf8').catch(() => undefined);

  try {
    await fs.rm(reviewBridgePath, { force: true });

    const payload = await runMaintenanceAction('memory:promotion-ready:mem_review_bridge_token:draft-memory-promotion', async () => {
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
    });

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
    if (originalMemoryStore === undefined) {
      await fs.rm(memoryStorePath, { force: true });
    } else {
      await fs.writeFile(memoryStorePath, originalMemoryStore, 'utf8');
    }

    if (originalReviewBridge === undefined) {
      await fs.rm(reviewBridgePath, { force: true });
    } else {
      await fs.writeFile(reviewBridgePath, originalReviewBridge, 'utf8');
    }
  }
});

test('wiki:action can apply a promotion for a promotion-ready memory finding', async () => {
  const memoryStorePath = path.join(fixtureRoot, 'local-data', 'project-memories.json');
  const reviewBridgePath = path.join(fixtureRoot, 'docs', 'wiki', 'review-bridge.md');
  const projectLogPath = path.join(fixtureRoot, 'docs', 'wiki', 'project-log.md');
  const originalMemoryStore = await fs.readFile(memoryStorePath, 'utf8').catch(() => undefined);
  const originalProjectLog = await fs.readFile(projectLogPath, 'utf8').catch(() => undefined);
  const originalReviewBridge = await fs.readFile(reviewBridgePath, 'utf8').catch(() => undefined);

  try {
    await fs.rm(reviewBridgePath, { force: true });
    await fs.rm(projectLogPath, { force: true });

    const payload = await runMaintenanceAction(
      'memory:promotion-ready:mem_review_bridge_token:apply-memory-promotion',
      async () => {
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
      }
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
        created: true
      },
      applied: true,
      skippedBecauseUnchanged: false,
      updatedPaths: ['docs/wiki/review-bridge.md', 'docs/wiki/project-log.md'],
      projectLogEntry: 'Promoted project-local memory mem_review_bridge_token into review-bridge.',
      undoPath: 'Inspect docs/wiki/review-bridge.md and docs/wiki/project-log.md with git diff, then restore either file from version control if the promotion should be reverted.'
    });

    const reviewBridgePage = await fs.readFile(reviewBridgePath, 'utf8');
    assert.match(reviewBridgePage, /^# Review Bridge\n\n## Promoted Lessons\n\n- The review bridge needs a trusted token\./);

    const projectLog = await fs.readFile(projectLogPath, 'utf8');
    assert.match(projectLog, /Promoted project-local memory mem_review_bridge_token into review-bridge\./);
  } finally {
    if (originalMemoryStore === undefined) {
      await fs.rm(memoryStorePath, { force: true });
    } else {
      await fs.writeFile(memoryStorePath, originalMemoryStore, 'utf8');
    }

    if (originalProjectLog === undefined) {
      await fs.rm(projectLogPath, { force: true });
    } else {
      await fs.writeFile(projectLogPath, originalProjectLog, 'utf8');
    }

    if (originalReviewBridge === undefined) {
      await fs.rm(reviewBridgePath, { force: true });
    } else {
      await fs.writeFile(reviewBridgePath, originalReviewBridge, 'utf8');
    }
  }
});

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