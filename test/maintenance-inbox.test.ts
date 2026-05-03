import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaintenanceInboxPage, buildMaintenanceInboxSnapshot, findMaintenanceInboxAction } from '../src/wiki/maintenance-inbox.ts';

const sampleFindings = [
  {
    rule: 'conflicting-guidance' as const,
    slug: 'AGENTS.md',
    path: 'AGENTS.md',
    message: 'Guidance conflicts with .github/copilot-instructions.md.'
  },
  {
    rule: 'stale-claim' as const,
    slug: 'living-wiki-model',
    path: 'docs/wiki/living-wiki-model.md',
    message: 'Claim is marked needs-review.'
  },
  {
    rule: 'duplicate-guidance' as const,
    slug: '.github/copilot-instructions.md',
    path: '.github/copilot-instructions.md',
    message: 'Guidance duplicates AGENTS.md.'
  }
];

const sampleProposals = [
  {
    kind: 'route-guidance' as const,
    summary: 'Trim AGENTS.md and route to docs/wiki/linked-page.md',
    currentStateSummary: 'AGENTS.md is longer than the preferred guidance length.',
    afterApplySummary: 'AGENTS.md becomes a short entry file that routes to docs/wiki/linked-page.md.',
    reviewSlug: 'pending-review/route-guidance-agents-md',
    reviewPath: 'docs/wiki/pending-review/route-guidance-agents-md.md',
    guidancePath: 'AGENTS.md',
    targetPaths: ['docs/wiki/linked-page.md'],
    rationale: 'Oversized guidance already points into the wiki.'
  },
  {
    kind: 'merge-guidance' as const,
    summary: 'Merge duplicate guidance into .github/copilot-instructions.md',
    currentStateSummary: 'AGENTS.md currently duplicates .github/copilot-instructions.md.',
    afterApplySummary: 'AGENTS.md becomes a short pointer to .github/copilot-instructions.md.',
    reviewSlug: 'pending-review/merge-guidance-github-copilot-instructions-md',
    reviewPath: 'docs/wiki/pending-review/merge-guidance-github-copilot-instructions-md.md',
    canonicalPath: '.github/copilot-instructions.md',
    duplicatePaths: ['AGENTS.md'],
    archiveTargets: [
      {
        sourcePath: 'AGENTS.md',
        suggestedPath: 'docs/wiki/archive-guidance/AGENTS.md'
      }
    ],
    rationale: 'Duplicate guidance should route through one canonical entry file.'
  }
];

test('maintenance inbox renders grouped proposal and lint sections', async () => {
  const page = await buildMaintenanceInboxPage(
    sampleFindings,
    sampleProposals,
    {
      reviewPageExists: async (reviewPath) => reviewPath.endsWith('merge-guidance-github-copilot-instructions-md.md')
    }
  );

  assert.match(page, /## What To Do Next/);
  assert.match(page, /Run `wiki_write_proposals` to materialize review pages/);
  assert.match(page, /## Proposal Queue Summary/);
  assert.match(page, /\| `merge-guidance` \| 1 \|/);
  assert.match(page, /\| `route-guidance` \| 1 \|/);
  assert.match(page, /### `merge-guidance` \(1\)/);
  assert.match(page, /Duplicate guidance should route through one canonical entry file/);
  assert.match(page, /Before committing, inspect the changed duplicate files with git diff/);
  assert.match(page, /\[pending-review\/merge-guidance-github-copilot-instructions-md\]\(\.\/pending-review\/merge-guidance-github-copilot-instructions-md\.md\)/);
  assert.match(page, /`pending-review\/route-guidance-agents-md` \(run `wiki_write_proposals`\)/);
  assert.match(page, /## Lint Queue Summary/);
  assert.match(page, /\| Review Now \| `conflicting-guidance` \| 1 \|/);
  assert.match(page, /\| Cleanup Queue \| `duplicate-guidance` \| 1 \|/);
  assert.match(page, /### Review Now \(2\)/);
  assert.match(page, /#### `stale-claim` \(1\)/);
  assert.match(page, /\[docs\/wiki\/living-wiki-model\.md\]\(living-wiki-model\.md\)/);
  assert.match(page, /`AGENTS\.md`/);
});

test('maintenance inbox snapshot returns grouped structured data', async () => {
  const snapshot = await buildMaintenanceInboxSnapshot(sampleFindings, sampleProposals, {
    reviewPageExists: async (reviewPath) => reviewPath.endsWith('merge-guidance-github-copilot-instructions-md.md')
  });

  assert.deepEqual(snapshot.status, {
    proposalCount: 2,
    lintFindingCount: 3,
    proposalGroups: [
      { kind: 'merge-guidance', count: 1 },
      { kind: 'route-guidance', count: 1 }
    ],
    lintRuleGroups: [
      { bucket: 'review-now', bucketTitle: 'Review Now', rule: 'conflicting-guidance', count: 1 },
      { bucket: 'review-now', bucketTitle: 'Review Now', rule: 'stale-claim', count: 1 },
      { bucket: 'cleanup', bucketTitle: 'Cleanup Queue', rule: 'duplicate-guidance', count: 1 }
    ]
  });
  assert.match(snapshot.nextSteps.join('\n'), /wiki_write_proposals/);
  assert.equal(snapshot.proposals[0]?.kind, 'merge-guidance');
  assert.equal(snapshot.proposals[0]?.items[0]?.reviewPageExists, true);
  assert.deepEqual(snapshot.proposals[0]?.items[0]?.review, {
    rationale: 'Duplicate guidance should route through one canonical entry file.',
    affectedPaths: ['AGENTS.md'],
    beforeSnippet: 'AGENTS.md currently duplicates .github/copilot-instructions.md.',
    afterSnippet: 'AGENTS.md becomes a short pointer to .github/copilot-instructions.md.',
    undoPath: 'Before committing, inspect the changed duplicate files with git diff and restore AGENTS.md from version control if the merge is not wanted.'
  });
  assert.deepEqual(snapshot.proposals[0]?.items[0]?.actions.map((action) => action.kind), [
    'refresh-review-pages',
    'read-review-page',
    'apply-proposal'
  ]);
  assert.deepEqual(snapshot.proposals[0]?.items[0]?.actions[2], {
    id: 'proposal:pending-review/merge-guidance-github-copilot-instructions-md:apply-proposal',
    kind: 'apply-proposal',
    label: 'Apply proposal',
    tool: 'wiki_apply_proposal',
    arguments: { reviewSlug: 'pending-review/merge-guidance-github-copilot-instructions-md' },
    available: true
  });
  assert.equal(snapshot.proposals[1]?.kind, 'route-guidance');
  assert.equal(snapshot.proposals[1]?.items[0]?.reviewPageExists, false);
  assert.deepEqual(snapshot.proposals[1]?.items[0]?.actions[1], {
    id: 'proposal:pending-review/route-guidance-agents-md:read-review-page',
    kind: 'read-review-page',
    label: 'Read review page',
    tool: 'wiki_read',
    arguments: { slug: 'pending-review/route-guidance-agents-md' },
    available: false,
    reason: 'Run wiki_write_proposals first to materialize the pending-review page.'
  });
  assert.deepEqual(snapshot.lintBuckets.map((bucket) => ({ bucket: bucket.bucket, count: bucket.count })), [
    { bucket: 'review-now', count: 2 },
    { bucket: 'cleanup', count: 1 }
  ]);
  assert.deepEqual(snapshot.lintBuckets[0]?.rules.map((rule) => rule.rule), ['conflicting-guidance', 'stale-claim']);
  assert.equal(snapshot.lintBuckets[0]?.rules[0]?.items[0]?.path, 'AGENTS.md');
  assert.deepEqual(snapshot.lintBuckets[0]?.rules[1]?.items[0]?.actions, [
    {
      id: 'lint:stale-claim:docs/wiki/living-wiki-model.md:read-wiki-page',
      kind: 'read-wiki-page',
      label: 'Read wiki page',
      tool: 'wiki_read',
      arguments: { slug: 'living-wiki-model' },
      available: true
    },
    {
      id: 'lint:stale-claim:docs/wiki/living-wiki-model.md:rerun-lint',
      kind: 'rerun-lint',
      label: 'Re-run lint',
      tool: 'wiki_lint',
      arguments: {},
      available: true
    }
  ]);
  assert.deepEqual(snapshot.lintBuckets[1]?.rules[0]?.items[0]?.actions, [
    {
      id: 'lint:duplicate-guidance:.github/copilot-instructions.md:rerun-lint',
      kind: 'rerun-lint',
      label: 'Re-run lint',
      tool: 'wiki_lint',
      arguments: {},
      available: true
    },
    {
      id: 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals',
      kind: 'check-proposals',
      label: 'Check related proposals',
      tool: 'wiki_proposals',
      arguments: {},
      available: true
    }
  ]);
  assert.equal(
    snapshot.proposals[0]?.items[0]?.actions[0]?.id,
    'proposal:pending-review/merge-guidance-github-copilot-instructions-md:refresh-review-pages'
  );
});

test('maintenance inbox can resolve an action by stable id', async () => {
  const resolved = await findMaintenanceInboxAction(
    'lint:stale-claim:docs/wiki/living-wiki-model.md:read-wiki-page',
    sampleFindings,
    sampleProposals,
    {
      reviewPageExists: async (reviewPath) => reviewPath.endsWith('merge-guidance-github-copilot-instructions-md.md')
    }
  );

  assert.deepEqual(resolved, {
    action: {
      id: 'lint:stale-claim:docs/wiki/living-wiki-model.md:read-wiki-page',
      kind: 'read-wiki-page',
      label: 'Read wiki page',
      tool: 'wiki_read',
      arguments: { slug: 'living-wiki-model' },
      available: true
    },
    source: {
      type: 'lint',
      bucket: 'review-now',
      rule: 'stale-claim',
      path: 'docs/wiki/living-wiki-model.md'
    }
  });
});