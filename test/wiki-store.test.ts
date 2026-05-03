import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const storeModulePath = path.join(repoRoot, 'src', 'wiki', 'store.ts');

async function loadStoreForFixture(fixtureName: string) {
  const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', fixtureName);
  const previousCwd = process.cwd();
  process.chdir(fixtureRoot);

  try {
    return await import(`${pathToFileURL(storeModulePath).href}?fixture=${fixtureName}-${Date.now()}`);
  } finally {
    process.chdir(previousCwd);
  }
}

test('healthy wiki fixture lists, reads, searches, and lints cleanly', async () => {
  const store = await loadStoreForFixture('healthy-wiki');

  const pages = await store.listWikiPages();
  assert.deepEqual(
    pages.map((page: { slug: string }) => page.slug),
    ['architecture', 'project-log']
  );

  const architecture = await store.readWikiPage('architecture');
  assert.match(architecture, /Healthy fixture architecture summary\./);

  const matches = await store.searchWikiPages('project log');
  assert.deepEqual(
    matches.map((page: { slug: string }) => page.slug),
    ['architecture', 'project-log']
  );

  const findings = await store.lintWikiPages();
  assert.deepEqual(findings, []);

  const proposals = await store.listWikiProposals();
  assert.deepEqual(proposals, []);

  const proposalPages = await store.writeWikiProposalPages();
  assert.deepEqual(proposalPages, []);

  const context = await store.buildWikiContext('recent architecture changes', { maxPages: 2 });
  assert.equal(context.query, 'recent architecture changes');
  assert.match(context.briefing, /Read first: architecture, project-log\./);
  assert.deepEqual(context.readFirst, ['architecture', 'project-log']);
  assert.deepEqual(
    context.pages.map((page: { slug: string }) => page.slug),
    ['architecture', 'project-log']
  );
  assert.equal(context.claims.length, 1);
  assert.equal(context.claims[0].pageSlug, 'architecture');
  assert.equal(context.claims[0].status, 'current');
  assert.equal(context.claims[0].text, 'The architecture page is a canonical briefing page for the healthy fixture.');
  assert.deepEqual(context.claims[0].sources, [{ label: 'Project Log', slug: 'project-log' }]);
  assert.deepEqual(context.guidanceFiles, [
    {
      path: '.github/copilot-instructions.md',
      kind: 'copilot-instructions',
      summary: 'Healthy fixture guidance for Copilot agents.'
    },
    {
      path: 'AGENTS.md',
      kind: 'agents',
      summary: 'Healthy fixture agent operating notes.'
    }
  ]);
  assert.deepEqual(context.pages[0].evidence.matchedTerms, ['architecture', 'changes']);
  assert.deepEqual(context.pages[0].evidence.relatedPages, ['project-log']);
  assert.deepEqual(context.recentLogEntries, [
    '- Added project log context for briefing tests.',
    '- Healthy fixture shipped its first architecture note.'
  ]);
  assert.deepEqual(context.findings, []);
  assert.deepEqual(context.openQuestions, []);
});

test('problem wiki fixture reports missing headings, summaries, and orphan pages', async () => {
  const store = await loadStoreForFixture('problem-wiki');

  const findings = await store.lintWikiPages();
  assert.deepEqual(
    findings.map((finding: { rule: string; slug: string }) => `${finding.slug}:${finding.rule}`),
    [
      '.github/copilot-instructions.md:conflicting-guidance',
      '.github/copilot-instructions.md:duplicate-guidance',
      '.github/copilot-instructions.md:oversized-guidance',
      '.github/copilot-instructions.md:stale-guidance-reference',
      '.github/instructions/check.instructions.md:conflicting-guidance',
      '.github/instructions/check.instructions.md:unrouted-guidance',
      'AGENTS.md:conflicting-guidance',
      'AGENTS.md:duplicate-guidance',
      'AGENTS.md:oversized-guidance',
      'AGENTS.md:stale-guidance-reference',
      'linked-page:stale-claim',
      'linked-page:unsupported-claim',
      'no-heading:missing-h1',
      'no-heading:missing-summary',
      'no-heading:orphan-page',
      'orphan:missing-h1',
      'orphan:missing-summary',
      'orphan:orphan-page',
      'skills/redundant/SKILL.md:dormant-skill'
    ]
  );

  const context = await store.buildWikiContext('linked page', { maxPages: 1, includeLint: false });
  assert.deepEqual(context.readFirst, ['linked-page']);
  assert.equal(context.claims.length, 2);
  assert.deepEqual(context.guidanceFiles, [
    {
      path: '.github/copilot-instructions.md',
      kind: 'copilot-instructions',
      summary: 'Oversized problem fixture agent notes.'
    },
    {
      path: '.github/instructions/check.instructions.md',
      kind: 'instruction',
      summary: 'Do not run npm run check before reporting completion.'
    },
    {
      path: 'AGENTS.md',
      kind: 'agents',
      summary: 'Oversized problem fixture agent notes.'
    },
    {
      path: 'skills/redundant/SKILL.md',
      kind: 'skill',
      summary: 'Dormant redundant fixture skill.'
    }
  ]);
  assert.deepEqual(context.openQuestions, [
    'Verify linked-page: The linked page is the only page that matters. (status: needs-review). Review linked-page.',
    'Add at least one supporting source for linked-page: The linked page defines the whole project..'
  ]);

  const contextWithLint = await store.buildWikiContext('linked page', { maxPages: 1 });
  assert.match(
    contextWithLint.openQuestions.join('\n'),
    /Resolve conflicting-guidance in \.github\/instructions\/check\.instructions\.md:/
  );
  assert.match(
    contextWithLint.openQuestions.join('\n'),
    /Resolve stale-guidance-reference in AGENTS\.md:/
  );
  assert.match(
    contextWithLint.openQuestions.join('\n'),
    /Resolve unrouted-guidance in \.github\/instructions\/check\.instructions\.md:/
  );
  assert.match(
    contextWithLint.openQuestions.join('\n'),
    /Resolve dormant-skill in skills\/redundant\/SKILL\.md:/
  );

  const proposals = await store.listWikiProposals();
  assert.deepEqual(proposals, [
    {
      kind: 'merge-guidance',
      summary: 'Merge duplicate guidance into .github/copilot-instructions.md',
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
      rationale: 'These guidance files share the same normalized content and should route through one canonical entry file before the redundant copies are archived.'
    },
    {
      kind: 'route-guidance',
      summary: 'Trim .github/copilot-instructions.md and route to docs/wiki/linked-page.md',
      reviewSlug: 'pending-review/route-guidance-github-copilot-instructions-md',
      reviewPath: 'docs/wiki/pending-review/route-guidance-github-copilot-instructions-md.md',
      guidancePath: '.github/copilot-instructions.md',
      targetPaths: ['docs/wiki/linked-page.md'],
      rationale: 'This guidance file exceeds the preferred length and already links to canonical local docs pages that can carry the detailed workflow.'
    },
    {
      kind: 'route-guidance',
      summary: 'Trim AGENTS.md and route to docs/wiki/linked-page.md',
      reviewSlug: 'pending-review/route-guidance-agents-md',
      reviewPath: 'docs/wiki/pending-review/route-guidance-agents-md.md',
      guidancePath: 'AGENTS.md',
      targetPaths: ['docs/wiki/linked-page.md'],
      rationale: 'This guidance file exceeds the preferred length and already links to canonical local docs pages that can carry the detailed workflow.'
    }
  ]);

  const pendingReviewRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki', 'docs', 'wiki', 'pending-review');
  await fs.rm(pendingReviewRoot, { recursive: true, force: true });
  try {
    await fs.mkdir(pendingReviewRoot, { recursive: true });
    await fs.writeFile(
      path.join(pendingReviewRoot, 'obsolete-review.md'),
      '# Old Proposal\n\nReviewable deterministic maintenance proposal.\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(pendingReviewRoot, 'manual-note.md'),
      '# Manual Note\n\nKeep this pending-review page.\n',
      'utf8'
    );

    const proposalPages = await store.writeWikiProposalPages();
    assert.deepEqual(
      proposalPages.map((page: { slug: string; proposalKind: string }) => `${page.slug}:${page.proposalKind}`),
      [
        'pending-review/merge-guidance-github-copilot-instructions-md:merge-guidance',
        'pending-review/route-guidance-agents-md:route-guidance',
        'pending-review/route-guidance-github-copilot-instructions-md:route-guidance'
      ]
    );
    assert.deepEqual(
      proposalPages.map((page: { path: string }) => page.path),
      [
        'docs/wiki/pending-review/merge-guidance-github-copilot-instructions-md.md',
        'docs/wiki/pending-review/route-guidance-agents-md.md',
        'docs/wiki/pending-review/route-guidance-github-copilot-instructions-md.md'
      ]
    );

    const mergeReview = await store.readWikiPage('pending-review/merge-guidance-github-copilot-instructions-md');
    assert.match(mergeReview, /Review merge guidance for \.github\/copilot-instructions\.md/);
    assert.match(mergeReview, /Archive AGENTS\.md at docs\/wiki\/archive-guidance\/AGENTS\.md/);

    const routeReview = await store.readWikiPage('pending-review/route-guidance-agents-md');
    assert.match(routeReview, /Review route guidance for AGENTS\.md/);
    assert.match(routeReview, /Route detailed workflow to docs\/wiki\/linked-page\.md/);

    await assert.rejects(() => store.readWikiPage('pending-review/obsolete-review'));
    const manualReview = await store.readWikiPage('pending-review/manual-note');
    assert.match(manualReview, /Keep this pending-review page\./);
  } finally {
    await fs.rm(pendingReviewRoot, { recursive: true, force: true });
  }
});

test('pagePathFromSlug rejects unsafe path input', async () => {
  const store = await loadStoreForFixture('healthy-wiki');

  assert.throws(() => store.pagePathFromSlug('../escape'), /Invalid wiki slug/);
  assert.throws(() => store.pagePathFromSlug('/absolute'), /Invalid wiki slug/);
});

test('route-guidance proposals can be auto-applied into short routed guidance files', async () => {
  const store = await loadStoreForFixture('problem-wiki');
  const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki');
  const agentsPath = path.join(fixtureRoot, 'AGENTS.md');
  const pendingReviewRoot = path.join(fixtureRoot, 'docs', 'wiki', 'pending-review');
  const originalAgents = await fs.readFile(agentsPath, 'utf8');

  try {
    await fs.rm(pendingReviewRoot, { recursive: true, force: true });
    await store.writeWikiProposalPages();

    const result = await store.applyWikiProposal('pending-review/route-guidance-agents-md');
    assert.deepEqual(result, {
      reviewSlug: 'pending-review/route-guidance-agents-md',
      proposalKind: 'route-guidance',
      updatedPaths: ['AGENTS.md'],
      removedReviewSlugs: [
        'pending-review/merge-guidance-github-copilot-instructions-md',
        'pending-review/route-guidance-agents-md'
      ],
      activeReviewSlugs: ['pending-review/route-guidance-github-copilot-instructions-md']
    });

    const rewrittenAgents = await fs.readFile(agentsPath, 'utf8');
    assert.match(rewrittenAgents, /^# Agent Operating Notes/m);
    assert.match(rewrittenAgents, /Oversized problem fixture agent notes\./);
    assert.match(rewrittenAgents, /Detailed workflow lives in the wiki pages below\./);
    assert.match(rewrittenAgents, /- Read \[Linked Page\]\(docs\/wiki\/linked-page\.md\)\./);
    assert.ok(rewrittenAgents.split(/\r?\n/).length < 40);

    const findings = await store.lintWikiPages();
    assert.ok(!findings.some((finding: { slug: string; rule: string }) => finding.slug === 'AGENTS.md' && finding.rule === 'oversized-guidance'));

    const proposals = await store.listWikiProposals();
    assert.ok(!proposals.some((proposal: { reviewSlug: string }) => proposal.reviewSlug === 'pending-review/route-guidance-agents-md'));
    await assert.rejects(() => store.readWikiPage('pending-review/route-guidance-agents-md'));
  } finally {
    await fs.writeFile(agentsPath, originalAgents, 'utf8');
    await fs.rm(pendingReviewRoot, { recursive: true, force: true });
  }
});

test('merge-guidance proposals can be auto-applied into short pointer entry files', async () => {
  const store = await loadStoreForFixture('problem-wiki');
  const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki');
  const agentsPath = path.join(fixtureRoot, 'AGENTS.md');
  const pendingReviewRoot = path.join(fixtureRoot, 'docs', 'wiki', 'pending-review');
  const originalAgents = await fs.readFile(agentsPath, 'utf8');

  try {
    await fs.rm(pendingReviewRoot, { recursive: true, force: true });
    await store.writeWikiProposalPages();

    const result = await store.applyWikiProposal('pending-review/merge-guidance-github-copilot-instructions-md');
    assert.deepEqual(result, {
      reviewSlug: 'pending-review/merge-guidance-github-copilot-instructions-md',
      proposalKind: 'merge-guidance',
      updatedPaths: ['AGENTS.md'],
      removedReviewSlugs: [
        'pending-review/merge-guidance-github-copilot-instructions-md',
        'pending-review/route-guidance-agents-md'
      ],
      activeReviewSlugs: ['pending-review/route-guidance-github-copilot-instructions-md']
    });

    const rewrittenAgents = await fs.readFile(agentsPath, 'utf8');
    assert.match(rewrittenAgents, /^# Agent Operating Notes/m);
    assert.match(rewrittenAgents, /Oversized problem fixture agent notes\./);
    assert.match(rewrittenAgents, /Canonical guidance lives in \[Fixture Instructions\]\(\.github\/copilot-instructions\.md\)\./);
    assert.match(rewrittenAgents, /Detailed workflow lives in the wiki pages below\./);
    assert.match(rewrittenAgents, /- Read \[Linked Page\]\(docs\/wiki\/linked-page\.md\)\./);
    assert.ok(rewrittenAgents.split(/\r?\n/).length < 40);

    const findings = await store.lintWikiPages();
    assert.ok(!findings.some((finding: { slug: string; rule: string }) => finding.slug === 'AGENTS.md' && finding.rule === 'duplicate-guidance'));
    assert.ok(!findings.some((finding: { slug: string; rule: string }) => finding.slug === 'AGENTS.md' && finding.rule === 'oversized-guidance'));

    const proposals = await store.listWikiProposals();
    assert.ok(!proposals.some((proposal: { reviewSlug: string }) => proposal.reviewSlug === 'pending-review/merge-guidance-github-copilot-instructions-md'));
    assert.ok(!proposals.some((proposal: { reviewSlug: string }) => proposal.reviewSlug === 'pending-review/route-guidance-agents-md'));
    await assert.rejects(() => store.readWikiPage('pending-review/merge-guidance-github-copilot-instructions-md'));
    await assert.rejects(() => store.readWikiPage('pending-review/route-guidance-agents-md'));
  } finally {
    await fs.writeFile(agentsPath, originalAgents, 'utf8');
    await fs.rm(pendingReviewRoot, { recursive: true, force: true });
  }
});
