import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');
const problemFixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki');
const serverEntryPoint = path.join(repoRoot, 'src', 'index.ts');

function textContent(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content
    ?.filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n') ?? '';
}

function jsonContent<T>(result: { content?: Array<{ type: string; text?: string }> }): T {
  return JSON.parse(textContent(result)) as T;
}

test('MCP server exposes and serves the wiki tool surface over stdio', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', serverEntryPoint],
    cwd: fixtureRoot,
    stderr: 'pipe'
  });

  await client.connect(transport);

  try {
    const toolList = await client.listTools();
    assert.deepEqual(
      toolList.tools.map((tool) => tool.name).sort(),
      ['wiki_apply_proposal', 'wiki_context', 'wiki_execute_maintenance_action', 'wiki_graph', 'wiki_index', 'wiki_lint', 'wiki_log', 'wiki_maintenance_inbox', 'wiki_proposals', 'wiki_read', 'wiki_search', 'wiki_synthesize_claims', 'wiki_synthesize_guidance', 'wiki_synthesize_proposals', 'wiki_write', 'wiki_write_proposals']
    );

    const readResult = await client.callTool({
      name: 'wiki_read',
      arguments: { slug: 'architecture' }
    });
    assert.notEqual(readResult.isError, true);
    assert.match(textContent(readResult), /Healthy fixture architecture summary\./);

    const searchResult = await client.callTool({
      name: 'wiki_search',
      arguments: { query: 'project log' }
    });
    assert.notEqual(searchResult.isError, true);
    const searchPayload = jsonContent<{
      pages: Array<{ slug: string; score: number; reasons: string[]; graph: { inboundLinks: number; relatedPages: string[] } }>;
    }>(searchResult);
    assert.deepEqual(searchPayload.pages.map((page) => page.slug), ['project-log', 'architecture']);
    assert.ok(searchPayload.pages[0]?.score > 0);
    assert.ok(searchPayload.pages[0]?.reasons.length > 0);
    assert.deepEqual(searchPayload.pages[0]?.graph.relatedPages, ['architecture']);

    const graphResult = await client.callTool({
      name: 'wiki_graph',
      arguments: {}
    });
    assert.notEqual(graphResult.isError, true);
    const graphPayload = jsonContent<{
      pages: number;
      nodes: Array<{ slug: string; inboundLinks: number; outgoingLinks: string[]; staleClaimCount: number }>;
    }>(graphResult);
    assert.equal(graphPayload.pages, 2);
    assert.ok(graphPayload.nodes.some((node) => node.slug === 'architecture' && node.outgoingLinks.includes('project-log')));

    const lintResult = await client.callTool({
      name: 'wiki_lint',
      arguments: {}
    });
    assert.notEqual(lintResult.isError, true);
    assert.match(textContent(lintResult), /"findings": \[\]/);

    const proposalsResult = await client.callTool({
      name: 'wiki_proposals',
      arguments: {}
    });
    assert.notEqual(proposalsResult.isError, true);
    assert.match(textContent(proposalsResult), /"proposals": \[\]/);

    const writeProposalsResult = await client.callTool({
      name: 'wiki_write_proposals',
      arguments: {}
    });
    assert.notEqual(writeProposalsResult.isError, true);
    assert.match(textContent(writeProposalsResult), /"pages": \[\]/);

    const synthesisResult = await client.callTool({
      name: 'wiki_synthesize_proposals',
      arguments: {}
    });
    assert.notEqual(synthesisResult.isError, true);
    const synthesisPayload = jsonContent<{
      provider: { kind: string; status: string; reason?: string };
      proposals: unknown[];
    }>(synthesisResult);
    assert.equal(synthesisPayload.provider.kind, 'none');
    assert.equal(synthesisPayload.provider.status, 'disabled');
    assert.match(synthesisPayload.provider.reason ?? '', /Optional synthesis is disabled/);
    assert.deepEqual(synthesisPayload.proposals, []);

    const claimSynthesisResult = await client.callTool({
      name: 'wiki_synthesize_claims',
      arguments: {}
    });
    assert.notEqual(claimSynthesisResult.isError, true);
    const claimSynthesisPayload = jsonContent<{
      provider: { kind: string; status: string };
      claims: unknown[];
    }>(claimSynthesisResult);
    assert.equal(claimSynthesisPayload.provider.kind, 'none');
    assert.equal(claimSynthesisPayload.provider.status, 'disabled');
    assert.deepEqual(claimSynthesisPayload.claims, []);

    const guidanceSynthesisResult = await client.callTool({
      name: 'wiki_synthesize_guidance',
      arguments: { maxItems: 1 }
    });
    assert.notEqual(guidanceSynthesisResult.isError, true);
    const guidanceSynthesisPayload = jsonContent<{
      provider: { kind: string; status: string };
      guidanceFiles: Array<{ path: string; synthesisStatus: string }>;
    }>(guidanceSynthesisResult);
    assert.equal(guidanceSynthesisPayload.provider.kind, 'none');
    assert.equal(guidanceSynthesisPayload.provider.status, 'disabled');
    assert.equal(guidanceSynthesisPayload.guidanceFiles[0]?.path, '.github/copilot-instructions.md');
    assert.equal(guidanceSynthesisPayload.guidanceFiles[0]?.synthesisStatus, 'disabled');

    const maintenanceInboxResult = await client.callTool({
      name: 'wiki_maintenance_inbox',
      arguments: {}
    });
    assert.notEqual(maintenanceInboxResult.isError, true);
    assert.deepEqual(
      jsonContent<{
        status: {
          proposalCount: number;
          lintFindingCount: number;
          proposalGroups: unknown[];
          lintRuleGroups: unknown[];
        };
        nextSteps: string[];
        proposals: unknown[];
        lintBuckets: unknown[];
      }>(maintenanceInboxResult),
      {
        status: {
          proposalCount: 0,
          lintFindingCount: 0,
          proposalGroups: [],
          lintRuleGroups: []
        },
        nextSteps: [
          'Read [Proposal Workflow](./proposal-workflow.md) for the review and apply flow.',
          'No proposal pages need to be generated right now.',
          'The lint queue is clear right now.'
        ],
        proposals: [],
        lintBuckets: []
      }
    );

    const executeLintActionResult = await client.callTool({
      name: 'wiki_execute_maintenance_action',
      arguments: { actionId: 'lint:stale-claim:docs/wiki/living-wiki-model.md:read-wiki-page' }
    });
    assert.equal(executeLintActionResult.isError, true);
    assert.match(textContent(executeLintActionResult), /Unknown maintenance action/);

    const contextResult = await client.callTool({
      name: 'wiki_context',
      arguments: { query: 'recent architecture changes', maxPages: 2 }
    });
    assert.notEqual(contextResult.isError, true);
    assert.match(textContent(contextResult), /"briefing": "Read first: architecture, project-log\./);
    assert.match(textContent(contextResult), /"readFirst": \[/);
    assert.match(textContent(contextResult), /"slug": "architecture"/);
    assert.match(textContent(contextResult), /"slug": "project-log"/);
    assert.match(textContent(contextResult), /"claims": \[/);
    assert.match(textContent(contextResult), /"guidanceFiles": \[/);
    assert.match(textContent(contextResult), /"path": "AGENTS.md"/);
    assert.match(textContent(contextResult), /"pageSlug": "architecture"/);
    assert.match(textContent(contextResult), /"matchedTerms": \[/);
    assert.match(textContent(contextResult), /"recentLogEntries"/);
    assert.match(textContent(contextResult), /"openQuestions": \[\]/);
  } finally {
    await client.close();
  }
});

test('MCP server can execute a maintenance inbox action over stdio for non-empty problem state', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-execute-action-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', serverEntryPoint],
    cwd: problemFixtureRoot,
    stderr: 'pipe'
  });

  await client.connect(transport);

  try {
    const executeActionResult = await client.callTool({
      name: 'wiki_execute_maintenance_action',
      arguments: { actionId: 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals' }
    });
    assert.notEqual(executeActionResult.isError, true);

    const payload = jsonContent<{
      actionId: string;
      action: { kind: string; tool: string; available: boolean };
      source: { type: string; rule?: string; path?: string };
      resultKind: string;
      resultSummary: string;
      result: { proposals: Array<{ reviewSlug: string }> };
    }>(executeActionResult);

    assert.equal(payload.actionId, 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals');
    assert.deepEqual(payload.action, {
      id: 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals',
      kind: 'check-proposals',
      label: 'Check related proposals',
      tool: 'wiki_proposals',
      arguments: {},
      available: true
    });
    assert.deepEqual(payload.source, {
      type: 'lint',
      bucket: 'cleanup',
      rule: 'duplicate-guidance',
      path: '.github/copilot-instructions.md'
    });
    assert.equal(payload.resultKind, 'proposal-list');
    assert.equal(payload.resultSummary, 'Found 3 active proposals.');
    assert.ok(payload.result.proposals.some((proposal) => proposal.reviewSlug === 'pending-review/merge-guidance-github-copilot-instructions-md'));
  } finally {
    await client.close();
  }
});

test('MCP server returns normalized result kinds for executed maintenance actions', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-result-kind-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', serverEntryPoint],
    cwd: problemFixtureRoot,
    stderr: 'pipe'
  });

  await client.connect(transport);

  try {
    const readActionResult = await client.callTool({
      name: 'wiki_execute_maintenance_action',
      arguments: { actionId: 'lint:stale-claim:docs/wiki/linked-page.md:read-wiki-page' }
    });
    assert.notEqual(readActionResult.isError, true);
    const payload = jsonContent<{
      actionId: string;
      action: { kind: string; tool: string };
      source: { type: string; rule?: string; path?: string };
      resultKind: string;
      resultSummary: string;
      result: { text: string };
    }>(readActionResult);
    assert.equal(payload.actionId, 'lint:stale-claim:docs/wiki/linked-page.md:read-wiki-page');
    assert.deepEqual(payload.action, {
      id: 'lint:stale-claim:docs/wiki/linked-page.md:read-wiki-page',
      kind: 'read-wiki-page',
      label: 'Read wiki page',
      tool: 'wiki_read',
      arguments: { slug: 'linked-page' },
      available: true
    });
    assert.deepEqual(payload.source, {
      type: 'lint',
      bucket: 'review-now',
      rule: 'stale-claim',
      path: 'docs/wiki/linked-page.md'
    });
    assert.equal(payload.resultKind, 'wiki-page-text');
    assert.equal(payload.resultSummary, 'Read wiki page: linked-page.');
    assert.deepEqual(payload.result, {
      text: await fs.readFile(path.join(problemFixtureRoot, 'docs', 'wiki', 'linked-page.md'), 'utf8')
    });
  } finally {
    await client.close();
  }
});

test('MCP server returns grouped maintenance inbox data over stdio for non-empty problem state', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-inbox-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', serverEntryPoint],
    cwd: problemFixtureRoot,
    stderr: 'pipe'
  });

  await client.connect(transport);

  try {
    const inboxResult = await client.callTool({
      name: 'wiki_maintenance_inbox',
      arguments: {}
    });
    assert.notEqual(inboxResult.isError, true);

    const inbox = jsonContent<{
      status: {
        proposalCount: number;
        lintFindingCount: number;
        proposalGroups: Array<{ kind: string; count: number }>;
        lintRuleGroups: Array<{ bucket: string; bucketTitle: string; rule: string; count: number }>;
      };
      nextSteps: string[];
      proposals: Array<{
        kind: string;
        count: number;
        items: Array<{
          reviewSlug: string;
          reviewPageExists: boolean;
          actions: Array<{ id: string; kind: string; tool: string; available: boolean }>;
        }>;
      }>;
      lintBuckets: Array<{
        bucket: string;
        count: number;
        rules: Array<{
          rule: string;
          count: number;
          items: Array<{ path: string; actions: Array<{ id: string; kind: string; tool: string; available: boolean }> }>;
        }>;
      }>;
    }>(inboxResult);

    assert.equal(inbox.status.proposalCount, 3);
    assert.equal(inbox.status.lintFindingCount, 19);
    assert.deepEqual(inbox.status.proposalGroups, [
      { kind: 'route-guidance', count: 2 },
      { kind: 'merge-guidance', count: 1 }
    ]);
    assert.match(inbox.nextSteps.join('\n'), /wiki_write_proposals/);
    assert.deepEqual(inbox.proposals.map((group) => ({ kind: group.kind, count: group.count })), [
      { kind: 'merge-guidance', count: 1 },
      { kind: 'route-guidance', count: 2 }
    ]);
    assert.ok(inbox.proposals.flatMap((group) => group.items).every((item) => item.reviewPageExists === false));
    assert.deepEqual(inbox.proposals[0]?.items[0]?.actions.map((action) => action.kind), [
      'refresh-review-pages',
      'read-review-page',
      'apply-proposal'
    ]);
    assert.equal(
      inbox.proposals[0]?.items[0]?.actions[0]?.id,
      'proposal:pending-review/merge-guidance-github-copilot-instructions-md:refresh-review-pages'
    );
    assert.equal(inbox.proposals[0]?.items[0]?.actions[2]?.tool, 'wiki_apply_proposal');
    assert.equal(inbox.proposals[0]?.items[0]?.actions[1]?.available, false);
    assert.deepEqual(inbox.lintBuckets.map((bucket) => ({ bucket: bucket.bucket, count: bucket.count })), [
      { bucket: 'review-now', count: 7 },
      { bucket: 'cleanup', count: 12 }
    ]);
    assert.ok(inbox.lintBuckets[0]?.rules.some((rule) => rule.rule === 'conflicting-guidance'));
    assert.ok(inbox.lintBuckets[1]?.rules.some((rule) => rule.rule === 'duplicate-guidance'));
    const duplicateGuidanceItem = inbox.lintBuckets[1]?.rules
      .find((rule) => rule.rule === 'duplicate-guidance')
      ?.items[0];
    assert.deepEqual(duplicateGuidanceItem?.actions.map((action) => action.kind), ['rerun-lint', 'check-proposals']);
    assert.equal(
      duplicateGuidanceItem?.actions[1]?.id,
      'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals'
    );
  } finally {
    await client.close();
  }
});

test('MCP server returns preview summaries in non-empty proposal output over stdio', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-proposals-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', serverEntryPoint],
    cwd: problemFixtureRoot,
    stderr: 'pipe'
  });

  await client.connect(transport);

  try {
    const proposalsResult = await client.callTool({
      name: 'wiki_proposals',
      arguments: {}
    });
    assert.notEqual(proposalsResult.isError, true);

    const proposals = jsonContent<{
      proposals: Array<{
        kind: string;
        reviewSlug: string;
        currentStateSummary: string;
        afterApplySummary: string;
      }>;
    }>(proposalsResult);

    assert.ok(proposals.proposals.length > 0);

    const mergeProposal = proposals.proposals.find((proposal) => proposal.kind === 'merge-guidance');
    assert.ok(mergeProposal);
    assert.equal(mergeProposal.reviewSlug, 'pending-review/merge-guidance-github-copilot-instructions-md');
    assert.match(mergeProposal.currentStateSummary, /AGENTS\.md currently duplicate \.github\/copilot-instructions\.md\./);
    assert.match(mergeProposal.afterApplySummary, /AGENTS\.md become short pointers to \.github\/copilot-instructions\.md/);

    const routeProposal = proposals.proposals.find((proposal) => proposal.reviewSlug === 'pending-review/route-guidance-agents-md');
    assert.ok(routeProposal);
    assert.match(routeProposal.currentStateSummary, /AGENTS\.md is longer than the preferred guidance length\./);
    assert.match(routeProposal.afterApplySummary, /AGENTS\.md becomes a short entry file that routes to docs\/wiki\/linked-page\.md\./);
  } finally {
    await client.close();
  }
});

test('MCP server can auto-apply a route-guidance proposal over stdio', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-apply-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', serverEntryPoint],
    cwd: problemFixtureRoot,
    stderr: 'pipe'
  });
  const agentsPath = path.join(problemFixtureRoot, 'AGENTS.md');
  const pendingReviewRoot = path.join(problemFixtureRoot, 'docs', 'wiki', 'pending-review');
  const originalAgents = await fs.readFile(agentsPath, 'utf8');

  await fs.rm(pendingReviewRoot, { recursive: true, force: true });

  await client.connect(transport);

  try {
    const writeProposalsResult = await client.callTool({
      name: 'wiki_write_proposals',
      arguments: {}
    });
    assert.notEqual(writeProposalsResult.isError, true);

    const applyResult = await client.callTool({
      name: 'wiki_apply_proposal',
      arguments: { reviewSlug: 'pending-review/route-guidance-agents-md' }
    });
    assert.notEqual(applyResult.isError, true);
    assert.deepEqual(jsonContent<{ reviewSlug: string; proposalKind: string; updatedPaths: string[]; removedReviewSlugs: string[]; activeReviewSlugs: string[] }>(applyResult), {
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
    assert.match(rewrittenAgents, /Detailed workflow lives in the wiki pages below\./);
    assert.match(rewrittenAgents, /- Read \[Linked Page\]\(docs\/wiki\/linked-page\.md\)\./);
    assert.ok(rewrittenAgents.split(/\r?\n/).length < 40);

    const proposalsResult = await client.callTool({
      name: 'wiki_proposals',
      arguments: {}
    });
    assert.notEqual(proposalsResult.isError, true);
    const proposals = jsonContent<{ proposals: Array<{ reviewSlug: string }> }>(proposalsResult);
    assert.ok(!proposals.proposals.some((proposal) => proposal.reviewSlug === 'pending-review/route-guidance-agents-md'));
    await assert.rejects(() => fs.readFile(path.join(pendingReviewRoot, 'route-guidance-agents-md.md'), 'utf8'));
  } finally {
    await client.close();
    await fs.writeFile(agentsPath, originalAgents, 'utf8');
    await fs.rm(pendingReviewRoot, { recursive: true, force: true });
  }
});

test('MCP server can auto-apply a merge-guidance proposal over stdio', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-merge-apply-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', serverEntryPoint],
    cwd: problemFixtureRoot,
    stderr: 'pipe'
  });
  const agentsPath = path.join(problemFixtureRoot, 'AGENTS.md');
  const pendingReviewRoot = path.join(problemFixtureRoot, 'docs', 'wiki', 'pending-review');
  const originalAgents = await fs.readFile(agentsPath, 'utf8');

  await fs.rm(pendingReviewRoot, { recursive: true, force: true });

  await client.connect(transport);

  try {
    const writeProposalsResult = await client.callTool({
      name: 'wiki_write_proposals',
      arguments: {}
    });
    assert.notEqual(writeProposalsResult.isError, true);

    const applyResult = await client.callTool({
      name: 'wiki_apply_proposal',
      arguments: { reviewSlug: 'pending-review/merge-guidance-github-copilot-instructions-md' }
    });
    assert.notEqual(applyResult.isError, true);
    assert.deepEqual(jsonContent<{ reviewSlug: string; proposalKind: string; updatedPaths: string[]; removedReviewSlugs: string[]; activeReviewSlugs: string[] }>(applyResult), {
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
    assert.match(rewrittenAgents, /Canonical guidance lives in \[Fixture Instructions\]\(\.github\/copilot-instructions\.md\)\./);
    assert.match(rewrittenAgents, /Detailed workflow lives in the wiki pages below\./);
    assert.match(rewrittenAgents, /- Read \[Linked Page\]\(docs\/wiki\/linked-page\.md\)\./);
    assert.ok(rewrittenAgents.split(/\r?\n/).length < 40);

    const proposalsResult = await client.callTool({
      name: 'wiki_proposals',
      arguments: {}
    });
    assert.notEqual(proposalsResult.isError, true);
    const proposals = jsonContent<{ proposals: Array<{ reviewSlug: string }> }>(proposalsResult);
    assert.ok(!proposals.proposals.some((proposal) => proposal.reviewSlug === 'pending-review/merge-guidance-github-copilot-instructions-md'));
    assert.ok(!proposals.proposals.some((proposal) => proposal.reviewSlug === 'pending-review/route-guidance-agents-md'));
    await assert.rejects(() => fs.readFile(path.join(pendingReviewRoot, 'merge-guidance-github-copilot-instructions-md.md'), 'utf8'));
    await assert.rejects(() => fs.readFile(path.join(pendingReviewRoot, 'route-guidance-agents-md.md'), 'utf8'));
  } finally {
    await client.close();
    await fs.writeFile(agentsPath, originalAgents, 'utf8');
    await fs.rm(pendingReviewRoot, { recursive: true, force: true });
  }
});

test('MCP server returns bounded proposal synthesis output with provider none by default', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-synthesis-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', serverEntryPoint],
    cwd: problemFixtureRoot,
    stderr: 'pipe'
  });

  await client.connect(transport);

  try {
    const synthesisResult = await client.callTool({
      name: 'wiki_synthesize_proposals',
      arguments: { maxItems: 2 }
    });
    assert.notEqual(synthesisResult.isError, true);

    const payload = jsonContent<{
      provider: { kind: string; status: string; reason?: string };
      proposals: Array<{ reviewSlug: string; synthesisStatus: string; failureReason?: string }>;
    }>(synthesisResult);

    assert.equal(payload.provider.kind, 'none');
    assert.equal(payload.provider.status, 'disabled');
    assert.equal(payload.proposals.length, 2);
    assert.equal(payload.proposals[0]?.synthesisStatus, 'disabled');
    assert.match(payload.proposals[0]?.failureReason ?? '', /Optional synthesis is disabled/);
  } finally {
    await client.close();
  }
});

test('MCP server returns agent handoff synthesis for stale claims and guidance over stdio', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-synthesis-handoff-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', serverEntryPoint],
    cwd: problemFixtureRoot,
    stderr: 'pipe'
  });

  await client.connect(transport);

  try {
    const claimSynthesisResult = await client.callTool({
      name: 'wiki_synthesize_claims',
      arguments: { provider: 'agent', pageSlug: 'linked-page', maxItems: 1 }
    });
    assert.notEqual(claimSynthesisResult.isError, true);
    const claimPayload = jsonContent<{
      provider: { kind: string; status: string };
      claims: Array<{ pageSlug: string; synthesisStatus: string; handoffPrompt?: string }>;
    }>(claimSynthesisResult);
    assert.equal(claimPayload.provider.kind, 'agent');
    assert.equal(claimPayload.provider.status, 'ready');
    assert.equal(claimPayload.claims[0]?.pageSlug, 'linked-page');
    assert.equal(claimPayload.claims[0]?.synthesisStatus, 'handoff');
    assert.match(claimPayload.claims[0]?.handoffPrompt ?? '', /stale or non-current wiki claim/);

    const guidanceSynthesisResult = await client.callTool({
      name: 'wiki_synthesize_guidance',
      arguments: { provider: 'agent', guidancePath: 'AGENTS.md' }
    });
    assert.notEqual(guidanceSynthesisResult.isError, true);
    const guidancePayload = jsonContent<{
      provider: { kind: string; status: string };
      guidanceFiles: Array<{ path: string; synthesisStatus: string; handoffPrompt?: string }>;
    }>(guidanceSynthesisResult);
    assert.equal(guidancePayload.provider.kind, 'agent');
    assert.equal(guidancePayload.provider.status, 'ready');
    assert.equal(guidancePayload.guidanceFiles[0]?.path, 'AGENTS.md');
    assert.equal(guidancePayload.guidanceFiles[0]?.synthesisStatus, 'handoff');
    assert.match(guidancePayload.guidanceFiles[0]?.handoffPrompt ?? '', /distilling an agent guidance file/);
  } finally {
    await client.close();
  }
});