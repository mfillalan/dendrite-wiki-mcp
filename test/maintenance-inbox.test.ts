import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaintenanceInboxPage, buildMaintenanceInboxSnapshot, findMaintenanceInboxAction } from '@dendrite/wiki';

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
        suggestedPath: 'docs/wiki/archive-guidance/AGENTS.md',
        reviewStatus: 'pending-review',
        reason: 'Archive only after the duplicate guidance has been reviewed and the pointer rewrite has been accepted.'
      }
    ],
    rationale: 'Duplicate guidance should route through one canonical entry file.'
  }
];

const sampleMemoryFindings = [
  {
    kind: 'stale' as const,
    summary: 'Memory is stale by age: Legacy setup note for the architecture page.',
    reason: 'Last updated 90 days ago, which is older than the 30-day review threshold.',
    memoryIds: ['mem_stale'],
    records: [
      {
        id: 'mem_stale',
        kind: 'lesson',
        status: 'active',
        summary: 'Legacy setup note for the architecture page.',
        text: 'Legacy setup note for the architecture page.',
        tags: [],
        relatedFiles: [],
        relatedPages: ['architecture'],
        sources: [{ kind: 'wiki', label: 'architecture', slug: 'architecture' }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        lastRecalledAt: '2026-02-02T00:00:00.000Z',
        recallCount: 1
      }
    ]
  },
  {
    kind: 'unsupported' as const,
    summary: 'Memory has no supporting sources: CLI alias note without provenance.',
    reason: 'No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.',
    memoryIds: ['mem_unsupported'],
    records: [
      {
        id: 'mem_unsupported',
        kind: 'fact',
        status: 'active',
        summary: 'CLI alias note without provenance.',
        text: 'CLI alias note without provenance.',
        tags: [],
        relatedFiles: [],
        relatedPages: [],
        sources: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        lastRecalledAt: '2026-05-03T00:00:00.000Z',
        recallCount: 1
      }
    ]
  },
  {
    kind: 'duplicate' as const,
    summary: 'Duplicate memory candidates: The review bridge needs a trusted token.',
    reason: 'Exact normalized text matches across 2 active memories.',
    memoryIds: ['mem_duplicate_a', 'mem_duplicate_b'],
    records: [
      {
        id: 'mem_duplicate_a',
        kind: 'lesson',
        status: 'active',
        summary: 'The review bridge needs a trusted token.',
        text: 'The review bridge needs a trusted token.',
        tags: [],
        relatedFiles: [],
        relatedPages: ['review-bridge'],
        sources: [{ kind: 'wiki', label: 'review-bridge', slug: 'review-bridge' }],
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
        sources: [{ kind: 'wiki', label: 'review-bridge', slug: 'review-bridge' }],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T12:00:00.000Z',
        lastRecalledAt: '2026-05-02T00:00:00.000Z',
        recallCount: 1
      }
    ]
  },
  {
    kind: 'contradiction' as const,
    summary: 'Contradictory memory candidates: The review bridge requires a trusted token before apply actions are allowed.',
    reason: 'Opposite polarity across 2 active memories with high shared context (action, appli, bridge, review, token, trust).',
    memoryIds: ['mem_contradiction_a', 'mem_contradiction_b'],
    records: [
      {
        id: 'mem_contradiction_a',
        kind: 'lesson',
        status: 'active',
        summary: 'The review bridge requires a trusted token before apply actions are allowed.',
        text: 'The review bridge requires a trusted token before apply actions are allowed.',
        tags: [],
        relatedFiles: [],
        relatedPages: ['review-bridge'],
        sources: [{ kind: 'wiki', label: 'review-bridge', slug: 'review-bridge' }],
        createdAt: '2026-05-03T00:00:00.000Z',
        updatedAt: '2026-05-03T00:00:00.000Z',
        lastRecalledAt: '2026-05-03T00:00:00.000Z',
        recallCount: 1
      },
      {
        id: 'mem_contradiction_b',
        kind: 'lesson',
        status: 'active',
        summary: 'The review bridge does not require a trusted token before apply actions are allowed.',
        text: 'The review bridge does not require a trusted token before apply actions are allowed.',
        tags: [],
        relatedFiles: [],
        relatedPages: ['review-bridge'],
        sources: [{ kind: 'wiki', label: 'review-bridge', slug: 'review-bridge' }],
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        lastRecalledAt: '2026-05-02T00:00:00.000Z',
        recallCount: 1
      }
    ]
  },
  {
    kind: 'promotion-ready' as const,
    summary: 'Memory is promotion-ready: Architecture changes should be logged in project-log.',
    reason: 'Recalled 3 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.',
    memoryIds: ['mem_promote'],
    records: [
      {
        id: 'mem_promote',
        kind: 'lesson',
        status: 'active',
        summary: 'Architecture changes should be logged in project-log.',
        text: 'Architecture changes should be logged in project-log.',
        tags: [],
        relatedFiles: [],
        relatedPages: ['pending-memory-promotion'],
        sources: [
          { kind: 'wiki', label: 'pending-memory-promotion', slug: 'pending-memory-promotion' },
          { kind: 'wiki', label: 'architecture', slug: 'architecture' }
        ],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        lastRecalledAt: '2026-05-03T00:00:00.000Z',
        recallCount: 3
      }
    ]
  }
];

test('maintenance inbox page is a thin redirect stub that points to the Review Board with current counts', async () => {
  // The .md page used to be a ~1,300-line text dump of every active finding. That surface
  // was unreviewable at scale and duplicated what the interactive Review Board now shows
  // with action buttons + previews. The page was collapsed to a counts-only stub. The
  // structured maintenance-inbox.json snapshot (covered by the snapshot test below) is now
  // the authoritative carrier of grouped data.
  const page = await buildMaintenanceInboxPage(
    sampleFindings,
    sampleProposals,
    {
      reviewPageExists: async (reviewPath) => reviewPath.endsWith('merge-guidance-github-copilot-instructions-md.md'),
      memoryFindings: sampleMemoryFindings
    }
  );

  assert.match(page, /^# Maintenance Inbox$/m);
  assert.match(page, /\[Review Board\]\(\/review-board\)/);
  assert.match(page, /## Right Now/);
  assert.match(page, /- 2 active proposals/);
  assert.match(page, /- 3 active lint findings/);
  assert.match(page, /- 5 active memory review findings/);
  assert.match(page, /- 0 active observation clusters/);
  // The dump-era sections must NOT appear — those are what the Review Board renders now.
  assert.doesNotMatch(page, /## Active Proposals/);
  assert.doesNotMatch(page, /## Active Lint Findings/);
  assert.doesNotMatch(page, /## Active Memory Review Findings/);
  assert.doesNotMatch(page, /## What To Do Next/);
  // Stub stays small — well under 30 lines.
  assert.ok(page.split('\n').length < 30, `expected stub to stay under 30 lines, got ${page.split('\n').length}`);
});

test('maintenance inbox snapshot returns grouped structured data', async () => {
  const snapshot = await buildMaintenanceInboxSnapshot(sampleFindings, sampleProposals, {
    reviewPageExists: async (reviewPath) => reviewPath.endsWith('merge-guidance-github-copilot-instructions-md.md'),
    memoryFindings: sampleMemoryFindings
  });

  assert.deepEqual(snapshot.status, {
    proposalCount: 2,
    lintFindingCount: 3,
    memoryFindingCount: 5,
    proposalGroups: [
      { kind: 'merge-guidance', count: 1 },
      { kind: 'route-guidance', count: 1 }
    ],
    lintRuleGroups: [
      { bucket: 'review-now', bucketTitle: 'Review Now', rule: 'conflicting-guidance', count: 1 },
      { bucket: 'review-now', bucketTitle: 'Review Now', rule: 'stale-claim', count: 1 },
      { bucket: 'cleanup', bucketTitle: 'Cleanup Queue', rule: 'duplicate-guidance', count: 1 }
    ],
    memoryKindGroups: [
      { kind: 'stale', title: 'Stale', count: 1 },
      { kind: 'unsupported', title: 'Unsupported', count: 1 },
      { kind: 'duplicate', title: 'Duplicate', count: 1 },
      { kind: 'contradiction', title: 'Contradiction', count: 1 },
      { kind: 'promotion-ready', title: 'Promotion Ready', count: 1 }
    ],
    observationClusterCount: 0
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
  assert.deepEqual(snapshot.memoryBuckets.map((bucket) => ({ kind: bucket.kind, count: bucket.count })), [
    { kind: 'stale', count: 1 },
    { kind: 'unsupported', count: 1 },
    { kind: 'duplicate', count: 1 },
    { kind: 'contradiction', count: 1 },
    { kind: 'promotion-ready', count: 1 }
  ]);
  assert.deepEqual(snapshot.memoryBuckets[0]?.items[0], {
    summary: 'Memory is stale by age: Legacy setup note for the architecture page.',
    reason: 'Last updated 90 days ago, which is older than the 30-day review threshold.',
    memoryIds: ['mem_stale'],
    records: [
      {
        id: 'mem_stale',
        kind: 'lesson',
        text: 'Legacy setup note for the architecture page.',
        recallCount: 1,
        updatedAt: '2026-02-01T00:00:00.000Z',
        sources: ['wiki:architecture'],
        relatedFiles: [],
        relatedPages: ['architecture']
      }
    ],
    actions: [
      {
        id: 'memory:stale:mem_stale:archive-memory',
        kind: 'archive-memory',
        label: 'Archive memory',
        tool: 'memory_forget',
        arguments: {
          id: 'mem_stale',
          mode: 'archive'
        },
        available: true
      }
    ]
  });
  assert.deepEqual(snapshot.memoryBuckets[1]?.items[0], {
    summary: 'Memory has no supporting sources: CLI alias note without provenance.',
    reason: 'No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.',
    memoryIds: ['mem_unsupported'],
    records: [
      {
        id: 'mem_unsupported',
        kind: 'fact',
        text: 'CLI alias note without provenance.',
        recallCount: 1,
        updatedAt: '2026-05-02T00:00:00.000Z',
        sources: [],
        relatedFiles: [],
        relatedPages: []
      }
    ],
    actions: [
      {
        id: 'memory:unsupported:mem_unsupported:archive-memory',
        kind: 'archive-memory',
        label: 'Archive memory',
        tool: 'memory_forget',
        arguments: {
          id: 'mem_unsupported',
          mode: 'archive'
        },
        available: true
      }
    ]
  });
  assert.deepEqual(snapshot.memoryBuckets[2]?.items[0], {
    summary: 'Duplicate memory candidates: The review bridge needs a trusted token.',
    reason: 'Exact normalized text matches across 2 active memories.',
    memoryIds: ['mem_duplicate_a', 'mem_duplicate_b'],
    records: [
      {
        id: 'mem_duplicate_a',
        kind: 'lesson',
        text: 'The review bridge needs a trusted token.',
        recallCount: 2,
        updatedAt: '2026-05-03T00:00:00.000Z',
        sources: ['wiki:review-bridge'],
        relatedFiles: [],
        relatedPages: ['review-bridge']
      },
      {
        id: 'mem_duplicate_b',
        kind: 'lesson',
        text: 'The review bridge needs a trusted token.',
        recallCount: 1,
        updatedAt: '2026-05-01T12:00:00.000Z',
        sources: ['wiki:review-bridge'],
        relatedFiles: [],
        relatedPages: ['review-bridge']
      }
    ],
    actions: [
      {
        id: 'memory:duplicate:mem_duplicate_b:archive-memory',
        kind: 'archive-memory',
        label: 'Archive older duplicate',
        tool: 'memory_forget',
        arguments: {
          id: 'mem_duplicate_b',
          mode: 'archive'
        },
        available: true
      }
    ]
  });
  assert.deepEqual(snapshot.memoryBuckets[3]?.items[0], {
    summary: 'Contradictory memory candidates: The review bridge requires a trusted token before apply actions are allowed.',
    reason: 'Opposite polarity across 2 active memories with high shared context (action, appli, bridge, review, token, trust).',
    memoryIds: ['mem_contradiction_a', 'mem_contradiction_b'],
    records: [
      {
        id: 'mem_contradiction_a',
        kind: 'lesson',
        text: 'The review bridge requires a trusted token before apply actions are allowed.',
        recallCount: 1,
        updatedAt: '2026-05-03T00:00:00.000Z',
        sources: ['wiki:review-bridge'],
        relatedFiles: [],
        relatedPages: ['review-bridge']
      },
      {
        id: 'mem_contradiction_b',
        kind: 'lesson',
        text: 'The review bridge does not require a trusted token before apply actions are allowed.',
        recallCount: 1,
        updatedAt: '2026-05-02T00:00:00.000Z',
        sources: ['wiki:review-bridge'],
        relatedFiles: [],
        relatedPages: ['review-bridge']
      }
    ],
    actions: []
  });
  assert.deepEqual(snapshot.memoryBuckets[4]?.items[0]?.actions, [
    {
      id: 'memory:promotion-ready:mem_promote:draft-memory-promotion',
      kind: 'draft-memory-promotion',
      label: 'Draft promotion',
      tool: 'memory_promote',
      arguments: {
        memoryIds: ['mem_promote'],
        mode: 'draft'
      },
      available: true
    },
    {
      id: 'memory:promotion-ready:mem_promote:apply-memory-promotion',
      kind: 'apply-memory-promotion',
      label: 'Apply promotion',
      tool: 'memory_promote',
      arguments: {
        memoryIds: ['mem_promote'],
        mode: 'apply'
      },
      available: false,
      reason: 'The target wiki page pending-memory-promotion does not exist yet. Draft the promotion first and create or choose a canonical target before applying it.'
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

test('maintenance inbox cannot resolve memory action ids when memoryFindings is omitted (regression: bridge must always pass memory findings)', async () => {
  // Regression guard for a bug that landed when the memory hygiene work shipped: the
  // review bridge called findMaintenanceInboxAction(actionId, findings, proposals)
  // without options.memoryFindings, so memory action ids always resolved to undefined
  // (and the bridge returned 404 unknown-maintenance-action). This test pins the
  // contract: callers MUST opt in to memory findings explicitly.
  const resolvedWithoutMemoryFindings = await findMaintenanceInboxAction(
    'memory:promotion-ready:mem_promote:apply-memory-promotion',
    sampleFindings,
    sampleProposals
  );
  assert.equal(resolvedWithoutMemoryFindings, undefined);

  const resolvedWithMemoryFindings = await findMaintenanceInboxAction(
    'memory:promotion-ready:mem_promote:apply-memory-promotion',
    sampleFindings,
    sampleProposals,
    { memoryFindings: sampleMemoryFindings }
  );
  assert.notEqual(resolvedWithMemoryFindings, undefined);
});

test('maintenance inbox can resolve a promotion-ready memory action by stable id', async () => {
  const resolved = await findMaintenanceInboxAction(
    'memory:promotion-ready:mem_promote:apply-memory-promotion',
    sampleFindings,
    sampleProposals,
    {
      memoryFindings: sampleMemoryFindings
    }
  );

  assert.deepEqual(resolved, {
    action: {
      id: 'memory:promotion-ready:mem_promote:apply-memory-promotion',
      kind: 'apply-memory-promotion',
      label: 'Apply promotion',
      tool: 'memory_promote',
      arguments: {
        memoryIds: ['mem_promote'],
        mode: 'apply'
      },
      available: false,
      reason: 'The target wiki page pending-memory-promotion does not exist yet. Draft the promotion first and create or choose a canonical target before applying it.'
    },
    source: {
      type: 'memory',
      kind: 'promotion-ready',
      memoryIds: ['mem_promote']
    }
  });
});

test('maintenance inbox can resolve a duplicate cleanup memory action by stable id', async () => {
  const resolved = await findMaintenanceInboxAction(
    'memory:duplicate:mem_duplicate_b:archive-memory',
    sampleFindings,
    sampleProposals,
    {
      memoryFindings: sampleMemoryFindings
    }
  );

  assert.deepEqual(resolved, {
    action: {
      id: 'memory:duplicate:mem_duplicate_b:archive-memory',
      kind: 'archive-memory',
      label: 'Archive older duplicate',
      tool: 'memory_forget',
      arguments: {
        id: 'mem_duplicate_b',
        mode: 'archive'
      },
      available: true
    },
    source: {
      type: 'memory',
      kind: 'duplicate',
      memoryIds: ['mem_duplicate_a', 'mem_duplicate_b']
    }
  });
});

// The angle-bracket escaping test that used to live here is no longer applicable: the
// .md page no longer renders memory text (it's a thin redirect stub now). The original
// concern — Vue parsing literal `<name>` substrings in memory bodies as malformed tags —
// only mattered when the dump page interpolated memory text into VitePress markdown. The
// Vue Review Board renders memory text via `{{ }}` text interpolation, which Vue treats as
// HTML-encoded text content (not parsed markup), so no escaping is needed there.