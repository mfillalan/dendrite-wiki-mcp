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
      ['wiki_apply_proposal', 'wiki_context', 'wiki_index', 'wiki_lint', 'wiki_log', 'wiki_maintenance_inbox', 'wiki_proposals', 'wiki_read', 'wiki_search', 'wiki_write', 'wiki_write_proposals']
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
    assert.match(textContent(searchResult), /project-log/);

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
          actions: Array<{ kind: string; tool: string; available: boolean }>;
        }>;
      }>;
      lintBuckets: Array<{
        bucket: string;
        count: number;
        rules: Array<{
          rule: string;
          count: number;
          items: Array<{ path: string; actions: Array<{ kind: string; tool: string; available: boolean }> }>;
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