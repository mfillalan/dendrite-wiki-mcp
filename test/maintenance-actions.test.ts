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
  const payload = await runMaintenanceAction('memory:promotion-ready:mem_review_bridge_token:draft-memory-promotion', async () => {
    const memoryStorePath = path.join(fixtureRoot, 'local-data', 'project-memories.json');
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
});

async function runMaintenanceAction(actionId: string): Promise<{
  actionId: string;
  resultKind: string;
  resultSummary: string;
  result: unknown;
}>
async function runMaintenanceAction(
  actionId: string,
  setup?: () => Promise<void>
): Promise<{
  actionId: string;
  resultKind: string;
  resultSummary: string;
  result: unknown;
}> {
  const originalCwd = process.cwd();
  process.chdir(fixtureRoot);

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