import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');
const problemFixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki');
const serverEntryPoint = path.join(repoRoot, 'src', 'index.ts');
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function createTransport(cwd: string, benchmarkEvents: 'enabled' | 'disabled' = 'disabled'): StdioClientTransport {
  return new StdioClientTransport({
    command: npxCommand,
    args: ['tsx', serverEntryPoint],
    cwd,
    stderr: 'pipe',
    env: {
      ...process.env,
      DENDRITE_WIKI_DISABLE_BENCHMARK_EVENTS: benchmarkEvents === 'enabled' ? '0' : '1',
      // Bypass the universal MCP-side ritual gate in integration tests. Tests
      // exercise the gated tools directly without first calling wiki_context;
      // the gate behavior itself is covered by dedicated tests in
      // test/ritual-state.test.ts.
      DENDRITE_DISABLE_RITUAL_GATE: '1'
    }
  });
}

function textContent(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content
    ?.filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n') ?? '';
}

function jsonContent<T>(result: { content?: Array<{ type: string; text?: string }> }): T {
  // The first text block is always the JSON payload. Any subsequent text blocks
  // are ritual-state footers appended by wrapToolResponse() in src/server.ts.
  const first = result.content?.find((item) => item.type === 'text')?.text ?? '';
  return JSON.parse(first) as T;
}

test('MCP server exposes and serves the wiki tool surface over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-smoke-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const toolList = await client.listTools();
    assert.deepEqual(
      toolList.tools.map((tool) => tool.name).sort(),
      ['memory_forget', 'memory_handoff', 'memory_promote', 'memory_promote_skill', 'memory_recall', 'memory_remember', 'memory_review', 'skill_export', 'skill_import', 'wiki_apply_proposal', 'wiki_context', 'wiki_execute_maintenance_action', 'wiki_generate_api_reference', 'wiki_graph', 'wiki_index', 'wiki_insert_chart', 'wiki_lint', 'wiki_log', 'wiki_maintenance_inbox', 'wiki_proposals', 'wiki_read', 'wiki_replace_chart', 'wiki_search', 'wiki_skill_load', 'wiki_skills_list', 'wiki_synthesize_claims', 'wiki_synthesize_guidance', 'wiki_synthesize_proposals', 'wiki_write', 'wiki_write_proposals']
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
          memoryFindingCount: number;
          proposalGroups: unknown[];
          lintRuleGroups: unknown[];
          memoryKindGroups: unknown[];
        };
        nextSteps: string[];
        proposals: unknown[];
        lintBuckets: unknown[];
        memoryBuckets: unknown[];
        observationClusters: unknown[];
      }>(maintenanceInboxResult),
      {
        status: {
          proposalCount: 0,
          lintFindingCount: 0,
          memoryFindingCount: 0,
          observationClusterCount: 0,
          proposalGroups: [],
          lintRuleGroups: [],
          memoryKindGroups: []
        },
        nextSteps: [
          'Read [Proposal Workflow](./proposal-workflow.md) for the review and apply flow.',
          'No proposal pages need to be generated right now.',
          'The lint queue is clear right now.',
          'The memory review queue is clear right now.',
          'No raw observation clusters have crossed the promotion threshold yet.'
        ],
        proposals: [],
        lintBuckets: [],
        memoryBuckets: [],
        observationClusters: []
      }
    );

    const executeLintActionResult = await client.callTool({
      name: 'wiki_execute_maintenance_action',
      arguments: { actionId: 'lint:stale-claim:docs/wiki/living-wiki-model.md:read-wiki-page' }
    });
    assert.equal(executeLintActionResult.isError, true);
    assert.match(textContent(executeLintActionResult), /Unknown maintenance action/);

    const rememberForContextResult = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'Healthy fixture agents should read the architecture page first because it is the canonical local briefing.',
        kind: 'lesson',
        relatedPages: ['architecture'],
        sources: ['wiki:architecture']
      }
    });
    assert.notEqual(rememberForContextResult.isError, true);

    const contextResult = await client.callTool({
      name: 'wiki_context',
      arguments: { query: 'recent architecture changes', maxPages: 2 }
    });
    assert.notEqual(contextResult.isError, true);
    assert.match(textContent(contextResult), /"briefing": "Read first: architecture, project-log\./);
    assert.match(textContent(contextResult), /"readFirst": \[/);
    assert.match(textContent(contextResult), /"slug": "architecture"/);
    assert.match(textContent(contextResult), /"slug": "project-log"/);
    assert.match(textContent(contextResult), /project-local memory/);
    assert.match(textContent(contextResult), /"memories": \[/);
    assert.match(textContent(contextResult), /Healthy fixture agents should read the architecture page first because it is the canonical local briefing\./);
    assert.match(textContent(contextResult), /"claims": \[/);
    assert.match(textContent(contextResult), /"guidanceFiles": \[/);
    assert.match(textContent(contextResult), /"path": "AGENTS.md"/);
    assert.match(textContent(contextResult), /"pageSlug": "architecture"/);
    assert.match(textContent(contextResult), /"matchedTerms": \[/);
    assert.match(textContent(contextResult), /"recentLogEntries"/);
    assert.match(textContent(contextResult), /"openQuestions": \[\]/);
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server inserts and replaces Mermaid charts via wiki_insert_chart / wiki_replace_chart', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-chart-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-chart-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    // Insert a flowchart at the end of the architecture page.
    const flowSource = 'flowchart TD\n  Agent --> InsertTool\n  InsertTool --> Wiki\n  Wiki --> Browser\n';
    const insertResult = await client.callTool({
      name: 'wiki_insert_chart',
      arguments: {
        slug: 'architecture',
        mermaidSource: flowSource,
        anchorKind: 'end-of-page',
        chartKind: 'flowchart',
        caption: 'Smoke test insert'
      }
    });
    assert.notEqual(insertResult.isError, true);
    const insertPayload = jsonContent<{ chartId: string; noop: boolean }>(insertResult);
    assert.match(insertPayload.chartId, /^auto-flowchart-[0-9a-f]{7}$/);
    assert.equal(insertPayload.noop, false);

    // The page on disk should now contain the marker comment + the mermaid fence.
    const arch = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'architecture.md'), 'utf8');
    assert.match(arch, new RegExp(`<!-- chart:${insertPayload.chartId} -->`));
    assert.match(arch, /```mermaid/);
    assert.match(arch, /\*Figure: Smoke test insert\*/);

    // Idempotency: identical insert is a no-op.
    const insertAgain = await client.callTool({
      name: 'wiki_insert_chart',
      arguments: {
        slug: 'architecture',
        mermaidSource: flowSource,
        anchorKind: 'end-of-page',
        chartKind: 'flowchart'
      }
    });
    const insertAgainPayload = jsonContent<{ chartId: string; noop: boolean }>(insertAgain);
    assert.equal(insertAgainPayload.noop, true);
    assert.equal(insertAgainPayload.chartId, insertPayload.chartId);

    // Replace with a new diagram.
    const newSource = 'flowchart LR\n  Start --> Done\n';
    const replaceResult = await client.callTool({
      name: 'wiki_replace_chart',
      arguments: {
        slug: 'architecture',
        chartId: insertPayload.chartId,
        newSource
      }
    });
    assert.notEqual(replaceResult.isError, true);
    const replacePayload = jsonContent<{ chartId: string; noop: boolean }>(replaceResult);
    assert.notEqual(replacePayload.chartId, insertPayload.chartId);
    assert.equal(replacePayload.noop, false);

    // Old marker gone, new marker present.
    const archAfter = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'architecture.md'), 'utf8');
    assert.ok(!archAfter.includes(`<!-- chart:${insertPayload.chartId}`), 'old chart marker should be removed');
    assert.match(archAfter, new RegExp(`<!-- chart:${replacePayload.chartId} -->`));

    // Validation failure path: prose source returns an error response.
    const proseResult = await client.callTool({
      name: 'wiki_insert_chart',
      arguments: {
        slug: 'architecture',
        mermaidSource: 'this is not mermaid at all',
        anchorKind: 'end-of-page'
      }
    });
    assert.equal(proseResult.isError, true);
    const errorPayload = jsonContent<{ error: { code: string; name: string; message: string } }>(proseResult);
    assert.equal(errorPayload.error.code, 'chart-validation-failed');
    assert.equal(errorPayload.error.name, 'ChartValidationError');

    // dryRun should not modify the page even on a fresh chartId.
    const beforeDry = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'architecture.md'), 'utf8');
    const dryResult = await client.callTool({
      name: 'wiki_insert_chart',
      arguments: {
        slug: 'architecture',
        mermaidSource: 'flowchart TD\n  Dry --> Run\n',
        anchorKind: 'end-of-page',
        chartKind: 'flowchart',
        dryRun: true
      }
    });
    assert.notEqual(dryResult.isError, true);
    const dryPayload = jsonContent<{ chartId: string; dryRun: boolean }>(dryResult);
    assert.equal(dryPayload.dryRun, true);
    const afterDry = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'architecture.md'), 'utf8');
    assert.equal(afterDry, beforeDry, 'dryRun must not modify the file on disk');
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server can write wiki pages and append project log entries over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-write-log-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-write-log-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const writeResult = await client.callTool({
      name: 'wiki_write',
      arguments: {
        slug: 'new-briefing',
        content: '# New Briefing\n\nNew briefing summary.\n'
      }
    });
    assert.notEqual(writeResult.isError, true);
    assert.match(textContent(writeResult), /Wrote wiki page: new-briefing/);

    const readResult = await client.callTool({
      name: 'wiki_read',
      arguments: { slug: 'new-briefing' }
    });
    assert.notEqual(readResult.isError, true);
    assert.match(textContent(readResult), /New briefing summary/);

    const logResult = await client.callTool({
      name: 'wiki_log',
      arguments: { entry: 'Recorded MCP write/log integration coverage.' }
    });
    assert.notEqual(logResult.isError, true);
    assert.match(textContent(logResult), /Appended project log entry/);

    const projectLog = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'project-log.md'), 'utf8');
    assert.match(projectLog, /Recorded MCP write\/log integration coverage\./);
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server writes automatic local benchmark event artifacts over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-benchmark-events-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });
  await fs.rm(path.join(tempFixtureRoot, 'docs', 'public', 'dendrite-benchmark-events-summary.json'), { force: true });
  await fs.rm(path.join(tempFixtureRoot, 'local-data'), { recursive: true, force: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-benchmark-event-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot, 'enabled');

  await client.connect(transport);

  try {
    const contextResult = await client.callTool({
      name: 'wiki_context',
      arguments: { query: 'recent architecture changes', maxPages: 2 }
    });
    assert.notEqual(contextResult.isError, true);

    const writeResult = await client.callTool({
      name: 'wiki_write',
      arguments: {
        slug: 'architecture',
        content: '# Architecture\n\nHealthy fixture architecture summary.\n\nAutomatic benchmark event coverage.\n'
      }
    });
    assert.notEqual(writeResult.isError, true);

    const logResult = await client.callTool({
      name: 'wiki_log',
      arguments: { entry: 'Recorded automatic local benchmark event capture coverage.' }
    });
    assert.notEqual(logResult.isError, true);

    const eventLog = await fs.readFile(path.join(tempFixtureRoot, 'local-data', 'benchmark-events.jsonl'), 'utf8');
    const events = eventLog
      .trim()
      .split(/\r?\n/u)
      .map((line) => JSON.parse(line) as { event: string; trigger: string });

    assert.ok(events.some((event) => event.event === 'session_started' && event.trigger === 'server'));
    assert.ok(events.some((event) => event.event === 'context_requested' && event.trigger === 'wiki_context'));
    assert.ok(events.filter((event) => event.event === 'wiki_updated').length >= 2);
    assert.ok(events.filter((event) => event.event === 'maintenance_state_changed').length >= 2);

    const summary = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'docs', 'public', 'dendrite-benchmark-events-summary.json'), 'utf8')
    ) as {
      byType: Record<string, number>;
      usage: { wikiUpdateCount: number; maintenanceStateChangeCount: number };
      orientation: { latestContextPageCount: number | null };
      maintenance: { acceptedProposalCount: number; latestLintFindingCount: number | null };
    };

    assert.ok(summary.byType.session_started >= 1);
    assert.ok(summary.byType.context_requested >= 1);
    assert.ok(summary.usage.wikiUpdateCount >= 2);
    assert.ok(summary.usage.maintenanceStateChangeCount >= 2);
    assert.equal(summary.maintenance.acceptedProposalCount, 0);
    assert.equal(summary.maintenance.latestLintFindingCount, 0);
    assert.equal(summary.orientation.latestContextPageCount, 2);
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server resolves wiki files from a separate target workspace cwd', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-target-workspace-'));
  await fs.mkdir(path.join(tempRoot, 'docs', 'wiki'), { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, 'docs', 'index.md'),
    '# Target Workspace Index\n\nThis target workspace should stay isolated from the source repository.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(tempRoot, 'docs', 'wiki', 'architecture.md'),
    '# Target Architecture\n\nTarget workspace architecture summary.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(tempRoot, 'docs', 'wiki', 'project-log.md'),
    '# Project Log\n\nTarget workspace project log summary.\n',
    'utf8'
  );

  const client = new Client({ name: 'dendrite-wiki-mcp-target-workspace-test', version: '0.1.0' });
  const transport = createTransport(tempRoot);

  await client.connect(transport);

  try {
    const readResult = await client.callTool({
      name: 'wiki_read',
      arguments: { slug: 'architecture' }
    });
    assert.notEqual(readResult.isError, true);
    assert.match(textContent(readResult), /Target workspace architecture summary/);

    const writeResult = await client.callTool({
      name: 'wiki_write',
      arguments: {
        slug: 'target-only',
        content: '# Target Only\n\nTarget-only wiki page summary.\n'
      }
    });
    assert.notEqual(writeResult.isError, true);
    await assert.rejects(() => fs.readFile(path.join(repoRoot, 'docs', 'wiki', 'target-only.md'), 'utf8'));
    assert.match(await fs.readFile(path.join(tempRoot, 'docs', 'wiki', 'target-only.md'), 'utf8'), /Target-only wiki page summary/);
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server can execute a maintenance inbox action over stdio for non-empty problem state', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-execute-action-test', version: '0.1.0' });
  const transport = createTransport(problemFixtureRoot);

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
  const transport = createTransport(problemFixtureRoot);

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
  const transport = createTransport(problemFixtureRoot);

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
        memoryFindingCount: number;
        proposalGroups: Array<{ kind: string; count: number }>;
        lintRuleGroups: Array<{ bucket: string; bucketTitle: string; rule: string; count: number }>;
        memoryKindGroups: Array<{ kind: string; title: string; count: number }>;
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
      memoryBuckets: Array<{
        kind: string;
        count: number;
        items: Array<{ summary: string; reason: string; memoryIds: string[] }>;
      }>;
    }>(inboxResult);

    assert.equal(inbox.status.proposalCount, 3);
    assert.equal(inbox.status.lintFindingCount, 19);
    assert.equal(inbox.status.memoryFindingCount, 0);
    assert.deepEqual(inbox.status.proposalGroups, [
      { kind: 'route-guidance', count: 2 },
      { kind: 'merge-guidance', count: 1 }
    ]);
    assert.deepEqual(inbox.status.memoryKindGroups, []);
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
    assert.deepEqual(inbox.memoryBuckets, []);
  } finally {
    await client.close();
  }
});

test('MCP server exposes and executes approved memory promotion maintenance actions over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-memory-maintenance-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });
  // local-data/ is gitignored on the fixtures so a fresh clone (CI runner) doesn't have
  // it; ensure the parent directory exists before the seed write.
  await fs.mkdir(path.join(tempFixtureRoot, 'local-data'), { recursive: true });
  await fs.writeFile(
    path.join(tempFixtureRoot, 'local-data', 'project-memories.json'),
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
          relatedPages: ['architecture'],
          sources: [
            { kind: 'wiki', slug: 'architecture', label: 'architecture' }
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

  const client = new Client({ name: 'dendrite-wiki-mcp-memory-maintenance-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const inboxResult = await client.callTool({
      name: 'wiki_maintenance_inbox',
      arguments: {}
    });
    assert.notEqual(inboxResult.isError, true);
    const inbox = jsonContent<{
      status: { memoryFindingCount: number; memoryKindGroups: Array<{ kind: string; count: number }> };
      memoryBuckets: Array<{
        kind: string;
        items: Array<{ memoryIds: string[]; actions: Array<{ id: string; kind: string; tool: string; available: boolean }> }>;
      }>;
    }>(inboxResult);
    assert.equal(inbox.status.memoryFindingCount, 1);
    assert.deepEqual(inbox.status.memoryKindGroups, [{ kind: 'promotion-ready', title: 'Promotion Ready', count: 1 }]);
    assert.deepEqual(inbox.memoryBuckets.map((bucket) => bucket.kind), ['promotion-ready']);
    assert.deepEqual(inbox.memoryBuckets[0]?.items[0]?.memoryIds, ['mem_review_bridge_token']);
    assert.deepEqual(
      inbox.memoryBuckets[0]?.items[0]?.actions.map((action) => ({ kind: action.kind, available: action.available })),
      [
        { kind: 'draft-memory-promotion', available: true },
        { kind: 'apply-memory-promotion', available: true }
      ]
    );

    const draftActionResult = await client.callTool({
      name: 'wiki_execute_maintenance_action',
      arguments: { actionId: 'memory:promotion-ready:mem_review_bridge_token:draft-memory-promotion' }
    });
    assert.notEqual(draftActionResult.isError, true);
    const draftPayload = jsonContent<{
      source: { type: string; kind?: string; memoryIds?: string[] };
      resultKind: string;
      resultSummary: string;
      result: { mode: string; targetPage: { slug: string; exists: boolean } };
    }>(draftActionResult);
    assert.deepEqual(draftPayload.source, {
      type: 'memory',
      kind: 'promotion-ready',
      memoryIds: ['mem_review_bridge_token']
    });
    assert.equal(draftPayload.resultKind, 'drafted-memory-promotion');
    assert.equal(draftPayload.resultSummary, 'Drafted a wiki promotion for 1 project-local memory.');
    assert.equal(draftPayload.result.mode, 'draft');
    assert.equal(draftPayload.result.targetPage.slug, 'architecture');
    assert.equal(draftPayload.result.targetPage.exists, true);

    const applyActionResult = await client.callTool({
      name: 'wiki_execute_maintenance_action',
      arguments: { actionId: 'memory:promotion-ready:mem_review_bridge_token:apply-memory-promotion' }
    });
    assert.notEqual(applyActionResult.isError, true);
    const applyPayload = jsonContent<{
      source: { type: string; kind?: string; memoryIds?: string[] };
      resultKind: string;
      resultSummary: string;
      result: { mode: string; applied: boolean; updatedPaths: string[]; projectLogEntry?: string };
    }>(applyActionResult);
    assert.deepEqual(applyPayload.source, {
      type: 'memory',
      kind: 'promotion-ready',
      memoryIds: ['mem_review_bridge_token']
    });
    assert.equal(applyPayload.resultKind, 'applied-memory-promotion');
    assert.equal(applyPayload.resultSummary, 'Applied a wiki promotion for 1 project-local memory.');
    assert.equal(applyPayload.result.mode, 'apply');
    assert.equal(applyPayload.result.applied, true);
    assert.deepEqual(applyPayload.result.updatedPaths, ['docs/wiki/architecture.md', 'docs/wiki/project-log.md']);
    assert.equal(applyPayload.result.projectLogEntry, 'Promoted project-local memory mem_review_bridge_token into architecture.');

    const architecturePage = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'architecture.md'), 'utf8');
    assert.match(architecturePage, /## Promoted Lessons\n\n- The review bridge needs a trusted token\./);

    const projectLog = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'project-log.md'), 'utf8');
    assert.match(projectLog, /Promoted project-local memory mem_review_bridge_token into architecture\./);
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server keeps missing-target memory promotions draft-only over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-memory-maintenance-blocked-'));
  const tempFixtureRoot = path.join(tempRoot, 'problem-wiki');
  await fs.cp(problemFixtureRoot, tempFixtureRoot, { recursive: true });
  await fs.mkdir(path.join(tempFixtureRoot, 'local-data'), { recursive: true });
  await fs.writeFile(
    path.join(tempFixtureRoot, 'local-data', 'project-memories.json'),
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
            { kind: 'wiki', slug: 'review-bridge', label: 'review-bridge' },
            { kind: 'wiki', slug: 'architecture', label: 'architecture' }
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

  const client = new Client({ name: 'dendrite-wiki-mcp-memory-maintenance-blocked-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const inboxResult = await client.callTool({
      name: 'wiki_maintenance_inbox',
      arguments: {}
    });
    assert.notEqual(inboxResult.isError, true);
    const inbox = jsonContent<{
      memoryBuckets: Array<{
        kind: string;
        items: Array<{ actions: Array<{ kind: string; available: boolean; reason?: string }> }>;
      }>;
    }>(inboxResult);
    assert.deepEqual(
      inbox.memoryBuckets[0]?.items[0]?.actions.map((action) => ({ kind: action.kind, available: action.available, reason: action.reason })),
      [
        { kind: 'draft-memory-promotion', available: true, reason: undefined },
        {
          kind: 'apply-memory-promotion',
          available: false,
          reason: 'The target wiki page review-bridge does not exist yet. Draft the promotion first and create or choose a canonical target before applying it.'
        }
      ]
    );

    const applyActionResult = await client.callTool({
      name: 'wiki_execute_maintenance_action',
      arguments: { actionId: 'memory:promotion-ready:mem_review_bridge_token:apply-memory-promotion' }
    });
    assert.equal(applyActionResult.isError, true);
    assert.match(
      textContent(applyActionResult),
      /The target wiki page review-bridge does not exist yet\. Draft the promotion first and create or choose a canonical target before applying it\./
    );
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server can archive an older duplicate memory maintenance action over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-memory-maintenance-duplicate-'));
  const tempFixtureRoot = path.join(tempRoot, 'problem-wiki');
  await fs.cp(problemFixtureRoot, tempFixtureRoot, { recursive: true });
  await fs.mkdir(path.join(tempFixtureRoot, 'local-data'), { recursive: true });
  await fs.writeFile(
    path.join(tempFixtureRoot, 'local-data', 'project-memories.json'),
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
          sources: [{ kind: 'wiki', slug: 'review-bridge', label: 'review-bridge' }],
          createdAt: '2026-05-02T00:00:00.000Z',
          updatedAt: '2026-05-03T00:00:00.000Z',
          lastRecalledAt: '2026-05-03T00:00:00.000Z',
          recallCount: 1
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
          sources: [{ kind: 'wiki', slug: 'review-bridge', label: 'review-bridge' }],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T12:00:00.000Z',
          lastRecalledAt: '2026-05-02T00:00:00.000Z',
          recallCount: 1
        }
      ]
    }, null, 2)}\n`,
    'utf8'
  );

  const client = new Client({ name: 'dendrite-wiki-mcp-memory-maintenance-duplicate-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const inboxResult = await client.callTool({
      name: 'wiki_maintenance_inbox',
      arguments: {}
    });
    assert.notEqual(inboxResult.isError, true);
    const inbox = jsonContent<{
      status: { memoryFindingCount: number; memoryKindGroups: Array<{ kind: string; title: string; count: number }> };
      memoryBuckets: Array<{
        kind: string;
        items: Array<{ memoryIds: string[]; actions: Array<{ id: string; kind: string; available: boolean }> }>;
      }>;
    }>(inboxResult);
    assert.equal(inbox.status.memoryFindingCount, 1);
    assert.deepEqual(inbox.status.memoryKindGroups, [{ kind: 'duplicate', title: 'Duplicate', count: 1 }]);
    assert.deepEqual(inbox.memoryBuckets[0]?.items[0]?.memoryIds, ['mem_duplicate_a', 'mem_duplicate_b']);
    assert.deepEqual(
      inbox.memoryBuckets[0]?.items[0]?.actions.map((action) => ({ id: action.id, kind: action.kind, available: action.available })),
      [
        {
          id: 'memory:duplicate:mem_duplicate_b:archive-memory',
          kind: 'archive-memory',
          available: true
        }
      ]
    );

    const archiveActionResult = await client.callTool({
      name: 'wiki_execute_maintenance_action',
      arguments: { actionId: 'memory:duplicate:mem_duplicate_b:archive-memory' }
    });
    assert.notEqual(archiveActionResult.isError, true);
    const archivePayload = jsonContent<{
      source: { type: string; kind?: string; memoryIds?: string[] };
      resultKind: string;
      resultSummary: string;
      result: { id: string; mode: string; removed: boolean; record?: { id: string; status: string } };
    }>(archiveActionResult);
    assert.deepEqual(archivePayload.source, {
      type: 'memory',
      kind: 'duplicate',
      memoryIds: ['mem_duplicate_a', 'mem_duplicate_b']
    });
    assert.equal(archivePayload.resultKind, 'forgotten-project-memory');
    assert.equal(archivePayload.resultSummary, 'Archived 1 project-local memory.');
    assert.equal(archivePayload.result.id, 'mem_duplicate_b');
    assert.equal(archivePayload.result.mode, 'archive');
    assert.equal(archivePayload.result.removed, true);
    assert.equal(archivePayload.result.record?.id, 'mem_duplicate_b');
    assert.equal(archivePayload.result.record?.status, 'archived');

    const memoryStore = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'local-data', 'project-memories.json'), 'utf8')
    ) as { memories: Array<{ id: string; status: string }> };
    assert.deepEqual(memoryStore.memories.map((record) => ({ id: record.id, status: record.status })), [
      { id: 'mem_duplicate_a', status: 'active' },
      { id: 'mem_duplicate_b', status: 'archived' }
    ]);
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server returns preview summaries in non-empty proposal output over stdio', async () => {
  const client = new Client({ name: 'dendrite-wiki-mcp-proposals-test', version: '0.1.0' });
  const transport = createTransport(problemFixtureRoot);

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
  const transport = createTransport(problemFixtureRoot);
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
  const transport = createTransport(problemFixtureRoot);
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
  const transport = createTransport(problemFixtureRoot);

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
  const transport = createTransport(problemFixtureRoot);

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

test('MCP server can remember, recall, and forget project-local memories over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-memory-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-memory-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const emptyRecallResult = await client.callTool({
      name: 'memory_recall',
      arguments: { query: 'server wiring', maxItems: 5 }
    });
    assert.notEqual(emptyRecallResult.isError, true);
    assert.deepEqual(jsonContent<{ query: string; memories: unknown[] }>(emptyRecallResult), {
      query: 'server wiring',
      memories: []
    });

    const rememberResult = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'When editing the MCP server, check src/server.ts first because tool registration lives there.',
        kind: 'lesson',
        tags: ['server', 'orientation'],
        relatedFiles: ['src/server.ts'],
        relatedPages: ['architecture'],
        sources: ['file:src/server.ts', 'wiki:architecture', 'decision:server-tool-surface']
      }
    });
    assert.notEqual(rememberResult.isError, true);
    const rememberPayload = jsonContent<{
      record: {
        id: string;
        kind: string;
        summary: string;
        relatedFiles: string[];
        relatedPages: string[];
        sources: Array<{ kind: string; slug: string }>;
      };
    }>(rememberResult);
    assert.match(rememberPayload.record.id, /^mem_/);
    assert.equal(rememberPayload.record.kind, 'lesson');
    assert.deepEqual(rememberPayload.record.relatedFiles, ['src/server.ts']);
    assert.deepEqual(rememberPayload.record.relatedPages, ['architecture']);
    assert.deepEqual(
      rememberPayload.record.sources.map((source) => `${source.kind}:${source.slug}`),
      ['decision:server-tool-surface', 'file:src/server.ts', 'wiki:architecture']
    );

    const recallResult = await client.callTool({
      name: 'memory_recall',
      arguments: {
        query: 'server wiring tool registration',
        relatedFiles: ['src/server.ts'],
        relatedPages: ['architecture'],
        maxItems: 5
      }
    });
    assert.notEqual(recallResult.isError, true);
    const recallPayload = jsonContent<{
      query: string;
      memories: Array<{
        id: string;
        summary: string;
        recallCount: number;
        lastRecalledAt: string;
        score: number;
        reasons: string[];
      }>;
    }>(recallResult);
    assert.equal(recallPayload.query, 'server wiring tool registration');
    assert.equal(recallPayload.memories.length, 1);
    assert.equal(recallPayload.memories[0]?.id, rememberPayload.record.id);
    assert.ok((recallPayload.memories[0]?.score ?? 0) > 0);
    assert.equal(recallPayload.memories[0]?.recallCount, 1);
    assert.match(recallPayload.memories[0]?.lastRecalledAt ?? '', /T/);
    assert.ok(recallPayload.memories[0]?.reasons.some((reason) => /summary matches|memory text mentions|matched 1 related file/.test(reason)));

    const forgetResult = await client.callTool({
      name: 'memory_forget',
      arguments: { id: rememberPayload.record.id }
    });
    assert.notEqual(forgetResult.isError, true);
    const forgetPayload = jsonContent<{
      id: string;
      mode: string;
      removed: boolean;
      record?: { id: string; status: string; recallCount: number };
    }>(forgetResult);
    assert.equal(forgetPayload.id, rememberPayload.record.id);
    assert.equal(forgetPayload.mode, 'archive');
    assert.equal(forgetPayload.removed, true);
    assert.equal(forgetPayload.record?.id, rememberPayload.record.id);
    assert.equal(forgetPayload.record?.status, 'archived');
    assert.equal(forgetPayload.record?.recallCount, 1);

    const archivedRecallResult = await client.callTool({
      name: 'memory_recall',
      arguments: {
        query: 'server wiring tool registration',
        relatedFiles: ['src/server.ts'],
        relatedPages: ['architecture'],
        maxItems: 5
      }
    });
    assert.notEqual(archivedRecallResult.isError, true);
    assert.deepEqual(jsonContent<{ query: string; memories: unknown[] }>(archivedRecallResult), {
      query: 'server wiring tool registration',
      memories: []
    });

    const memoryStore = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'local-data', 'project-memories.json'), 'utf8')
    ) as {
      schemaVersion: number;
      memories: Array<{ id: string; status: string; recallCount: number }>;
    };
    assert.equal(memoryStore.schemaVersion, 1);
    assert.equal(memoryStore.memories.length, 1);
    assert.equal(memoryStore.memories[0]?.id, rememberPayload.record.id);
    assert.equal(memoryStore.memories[0]?.status, 'archived');
    assert.equal(memoryStore.memories[0]?.recallCount, 1);
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server can review project-local memories for hygiene over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-memory-review-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-memory-review-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const staleRememberResult = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'Legacy setup note for the healthy fixture architecture.',
        kind: 'lesson',
        relatedPages: ['architecture'],
        sources: ['wiki:architecture']
      }
    });
    const staleId = jsonContent<{ record: { id: string } }>(staleRememberResult).record.id;

    const unsupportedRememberResult = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'Remember that this unsupported note still needs a real source attached.',
        kind: 'warning'
      }
    });
    const unsupportedId = jsonContent<{ record: { id: string } }>(unsupportedRememberResult).record.id;

    const duplicateRememberResultA = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'The local review bridge needs a trusted token before apply actions are allowed.',
        kind: 'lesson',
        sources: ['wiki:architecture']
      }
    });
    const duplicateIdA = jsonContent<{ record: { id: string } }>(duplicateRememberResultA).record.id;

    const duplicateRememberResultB = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'The local review bridge needs a trusted token before apply actions are allowed.',
        kind: 'lesson',
        sources: ['wiki:architecture']
      }
    });
    const duplicateIdB = jsonContent<{ record: { id: string } }>(duplicateRememberResultB).record.id;

    const contradictionRememberResultA = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'The review bridge requires a trusted token before apply actions are allowed.',
        kind: 'lesson',
        relatedPages: ['review-bridge'],
        sources: ['wiki:review-bridge']
      }
    });
    const contradictionIdA = jsonContent<{ record: { id: string } }>(contradictionRememberResultA).record.id;

    const contradictionRememberResultB = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'The review bridge does not require a trusted token before apply actions are allowed.',
        kind: 'lesson',
        relatedPages: ['review-bridge'],
        sources: ['wiki:review-bridge']
      }
    });
    const contradictionIdB = jsonContent<{ record: { id: string } }>(contradictionRememberResultB).record.id;

    const promotionRememberResult = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'Architecture changes should also be reflected in the project log after implementation changes land.',
        kind: 'lesson',
        relatedPages: ['architecture', 'project-log'],
        sources: ['wiki:architecture', 'wiki:project-log']
      }
    });
    const promotionId = jsonContent<{ record: { id: string } }>(promotionRememberResult).record.id;

    const memoryStorePath = path.join(tempFixtureRoot, 'local-data', 'project-memories.json');
    const memoryStore = JSON.parse(await fs.readFile(memoryStorePath, 'utf8')) as {
      schemaVersion: number;
      memories: Array<{ id: string; createdAt: string; updatedAt: string }>;
    };
    const staleRecord = memoryStore.memories.find((record) => record.id === staleId);
    assert.ok(staleRecord);
    staleRecord.createdAt = '2025-01-01T00:00:00.000Z';
    staleRecord.updatedAt = '2025-01-01T00:00:00.000Z';
    await fs.writeFile(memoryStorePath, `${JSON.stringify(memoryStore, null, 2)}\n`, 'utf8');

    for (let index = 0; index < 2; index += 1) {
      const recallResult = await client.callTool({
        name: 'memory_recall',
        arguments: {
          query: 'architecture project log changes',
          relatedPages: ['architecture', 'project-log'],
          maxItems: 1
        }
      });
      assert.notEqual(recallResult.isError, true);
    }

    const reviewResult = await client.callTool({
      name: 'memory_review',
      arguments: { staleAfterDays: 30, minPromotionRecallCount: 2 }
    });
    assert.notEqual(reviewResult.isError, true);
    const reviewPayload = jsonContent<{
      summary: {
        reviewedRecords: number;
        stale: number;
        unsupported: number;
        skillPromotionReady: number;
        duplicateGroups: number;
        contradictionGroups: number;
        promotionReady: number;
        findings: number;
      };
      findings: Array<{
        kind: string;
        summary: string;
        reason: string;
        memoryIds: string[];
        records: Array<{ id: string; recallCount: number }>;
      }>;
    }>(reviewResult);

    assert.equal(reviewPayload.summary.reviewedRecords, 7);
    assert.equal(reviewPayload.summary.stale, 1);
    assert.equal(reviewPayload.summary.unsupported, 1);
    assert.equal(reviewPayload.summary.duplicateGroups, 1);
    assert.equal(reviewPayload.summary.contradictionGroups, 1);
    assert.equal(reviewPayload.summary.promotionReady, 1);
    assert.equal(reviewPayload.summary.skillPromotionReady, 0, 'no seeded memory has file/tag context that infers a skill scope');
    assert.equal(reviewPayload.summary.findings, 5);

    const staleFinding = reviewPayload.findings.find((finding) => finding.kind === 'stale');
    assert.deepEqual(staleFinding?.memoryIds, [staleId]);
    assert.match(staleFinding?.reason ?? '', /older than the 30-day review threshold/);

    const unsupportedFinding = reviewPayload.findings.find((finding) => finding.kind === 'unsupported');
    assert.deepEqual(unsupportedFinding?.memoryIds, [unsupportedId]);
    assert.match(unsupportedFinding?.reason ?? '', /No supporting sources are attached/);

    const duplicateFinding = reviewPayload.findings.find((finding) => finding.kind === 'duplicate');
    assert.deepEqual(new Set(duplicateFinding?.memoryIds ?? []), new Set([duplicateIdA, duplicateIdB]));
    assert.match(duplicateFinding?.reason ?? '', /Exact normalized text matches across 2 active memories/);

    const contradictionFinding = reviewPayload.findings.find((finding) => finding.kind === 'contradiction');
    assert.deepEqual(new Set(contradictionFinding?.memoryIds ?? []), new Set([contradictionIdA, contradictionIdB]));
    assert.match(contradictionFinding?.reason ?? '', /Opposite polarity across 2 active memories with high shared context/);

    const promotionFinding = reviewPayload.findings.find((finding) => finding.kind === 'promotion-ready');
    assert.deepEqual(promotionFinding?.memoryIds, [promotionId]);
    assert.equal(promotionFinding?.records[0]?.recallCount, 2);
    assert.match(promotionFinding?.reason ?? '', /Recalled 2 times and backed by 2 sources/);
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server groups near-duplicate project-local memories for hygiene review over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-memory-near-duplicate-review-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-memory-near-duplicate-review-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const firstRememberResult = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'The review bridge requires a trusted token before apply actions are allowed during maintenance review.',
        kind: 'lesson',
        sources: ['wiki:review-bridge']
      }
    });
    const firstId = jsonContent<{ record: { id: string } }>(firstRememberResult).record.id;

    const secondRememberResult = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'Maintenance review apply actions require a trusted token in the review bridge before they are allowed.',
        kind: 'lesson',
        sources: ['wiki:review-bridge']
      }
    });
    const secondId = jsonContent<{ record: { id: string } }>(secondRememberResult).record.id;

    const reviewResult = await client.callTool({
      name: 'memory_review',
      arguments: { staleAfterDays: 30, minPromotionRecallCount: 10 }
    });
    assert.notEqual(reviewResult.isError, true);
    const reviewPayload = jsonContent<{
      summary: { duplicateGroups: number; findings: number };
      findings: Array<{ kind: string; summary: string; reason: string; memoryIds: string[] }>;
    }>(reviewResult);

    assert.equal(reviewPayload.summary.duplicateGroups, 1);
    const duplicateFinding = reviewPayload.findings.find((finding) => finding.kind === 'duplicate');
    assert.ok(duplicateFinding);
    assert.match(duplicateFinding?.summary ?? '', /Near-duplicate memory candidates/);
    assert.match(duplicateFinding?.reason ?? '', /High normalized term overlap across 2 active memories/);
    assert.deepEqual(new Set(duplicateFinding?.memoryIds ?? []), new Set([firstId, secondId]));
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server can draft wiki promotion text for project-local memories over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-memory-promote-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-memory-promote-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const rememberResult = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'Architecture updates should be mirrored in the project log when they change project truth.',
        kind: 'lesson',
        relatedPages: ['architecture'],
        sources: ['wiki:architecture', 'wiki:project-log']
      }
    });
    assert.notEqual(rememberResult.isError, true);
    const memoryId = jsonContent<{ record: { id: string } }>(rememberResult).record.id;

    const promotionResult = await client.callTool({
      name: 'memory_promote',
      arguments: { memoryIds: [memoryId] }
    });
    assert.notEqual(promotionResult.isError, true);
    const promotionPayload = jsonContent<{
      draft: {
        mode: string;
        memoryIds: string[];
        targetPage: { slug: string; path: string; title: string; exists: boolean };
        sectionHeading: string;
        proposedText: string;
        sourceRefs: string[];
        rationale: string;
        warnings: string[];
        undoPath: string;
      };
    }>(promotionResult);

    assert.equal(promotionPayload.draft.mode, 'draft');
    assert.deepEqual(promotionPayload.draft.memoryIds, [memoryId]);
    assert.equal(promotionPayload.draft.targetPage.slug, 'architecture');
    assert.equal(promotionPayload.draft.targetPage.path, 'docs/wiki/architecture.md');
    assert.equal(promotionPayload.draft.targetPage.title, 'Architecture');
    assert.equal(promotionPayload.draft.targetPage.exists, true);
    assert.equal(promotionPayload.draft.sectionHeading, '## Promoted Lessons');
    assert.match(promotionPayload.draft.proposedText, /Architecture updates should be mirrored in the project log/);
    assert.match(promotionPayload.draft.proposedText, /Sources: wiki:architecture, wiki:project-log/);
    assert.deepEqual(promotionPayload.draft.sourceRefs, ['wiki:architecture', 'wiki:project-log']);
    assert.match(promotionPayload.draft.rationale, /would be promoted into architecture/);
    assert.deepEqual(promotionPayload.draft.warnings, []);
    assert.match(promotionPayload.draft.undoPath, /does not mutate files/);

    const architectureContent = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'architecture.md'), 'utf8');
    assert.doesNotMatch(architectureContent, /Promoted Lessons/);
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server can apply wiki promotion text for project-local memories over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-memory-promote-apply-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-memory-promote-apply-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const rememberResult = await client.callTool({
      name: 'memory_remember',
      arguments: {
        text: 'Architecture updates should be mirrored in the project log when they change project truth.',
        kind: 'lesson',
        relatedPages: ['architecture'],
        sources: ['wiki:architecture', 'wiki:project-log']
      }
    });
    assert.notEqual(rememberResult.isError, true);
    const memoryId = jsonContent<{ record: { id: string } }>(rememberResult).record.id;

    const promotionResult = await client.callTool({
      name: 'memory_promote',
      arguments: { memoryIds: [memoryId], mode: 'apply' }
    });
    assert.notEqual(promotionResult.isError, true);
    const promotionPayload = jsonContent<{
      result: {
        mode: string;
        memoryIds: string[];
        targetPage: { slug: string; path: string; title: string; created: boolean };
        applied: boolean;
        skippedBecauseUnchanged: boolean;
        updatedPaths: string[];
        projectLogEntry: string;
        undoPath: string;
      };
    }>(promotionResult);

    assert.equal(promotionPayload.result.mode, 'apply');
    assert.deepEqual(promotionPayload.result.memoryIds, [memoryId]);
    assert.equal(promotionPayload.result.targetPage.slug, 'architecture');
    assert.equal(promotionPayload.result.targetPage.created, false);
    assert.equal(promotionPayload.result.applied, true);
    assert.equal(promotionPayload.result.skippedBecauseUnchanged, false);
    assert.deepEqual(promotionPayload.result.updatedPaths, ['docs/wiki/architecture.md', 'docs/wiki/project-log.md']);
    assert.match(promotionPayload.result.projectLogEntry, /Promoted project-local memory/);
    assert.match(promotionPayload.result.undoPath, /git diff/);

    const architectureContent = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'architecture.md'), 'utf8');
    assert.match(architectureContent, /## Promoted Lessons/);
    assert.match(architectureContent, /Architecture updates should be mirrored in the project log/);

    const projectLogContent = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'project-log.md'), 'utf8');
    assert.match(projectLogContent, /Promoted project-local memory/);
    assert.match(projectLogContent, new RegExp(memoryId));
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('MCP server can capture a session handoff and surface it in wiki_context over stdio', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-mcp-memory-handoff-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const client = new Client({ name: 'dendrite-wiki-mcp-memory-handoff-test', version: '0.1.0' });
  const transport = createTransport(tempFixtureRoot);

  await client.connect(transport);

  try {
    const handoffResult = await client.callTool({
      name: 'memory_handoff',
      arguments: {
        summary: 'Continue architecture follow-up before widening workflow hooks.',
        nextSteps: [
          'Update the architecture page if the handoff format changes again.',
          'Keep the roadmap tracker in sync with the next implementation pass.'
        ],
        openQuestions: ['Should workflow hooks write the handoff automatically at session end?'],
        relatedPages: ['architecture'],
        sources: ['wiki:architecture']
      }
    });
    assert.notEqual(handoffResult.isError, true);
    const handoffPayload = jsonContent<{
      record: {
        id: string;
        kind: string;
        tags: string[];
        relatedPages: string[];
        text: string;
      };
    }>(handoffResult);
    assert.match(handoffPayload.record.id, /^mem_/);
    assert.equal(handoffPayload.record.kind, 'handoff');
    assert.deepEqual(handoffPayload.record.tags, ['handoff']);
    assert.deepEqual(handoffPayload.record.relatedPages, ['architecture']);
    assert.match(handoffPayload.record.text, /Handoff summary:/);
    assert.match(handoffPayload.record.text, /Next steps:/);
    assert.match(handoffPayload.record.text, /Open questions:/);

    const contextResult = await client.callTool({
      name: 'wiki_context',
      arguments: { query: 'recent architecture changes', maxPages: 2 }
    });
    assert.notEqual(contextResult.isError, true);
    const contextPayload = jsonContent<{
      briefing: string;
      handoffs: Array<{ id: string; kind: string; recallCount: number; reasons: string[]; text: string }>;
      memories: Array<{ id: string; kind: string }>;
    }>(contextResult);

    assert.match(contextPayload.briefing, /1 recent session handoff is included/);
    assert.equal(contextPayload.handoffs.length, 1);
    assert.equal(contextPayload.handoffs[0]?.id, handoffPayload.record.id);
    assert.equal(contextPayload.handoffs[0]?.kind, 'handoff');
    assert.equal(contextPayload.handoffs[0]?.recallCount, 1);
    assert.ok(contextPayload.handoffs[0]?.reasons.some((reason) => /session handoff|related page/.test(reason)));
    assert.match(contextPayload.handoffs[0]?.text ?? '', /Continue architecture follow-up before widening workflow hooks/);
    assert.ok(contextPayload.memories.every((memory) => memory.kind !== 'handoff'));
  } finally {
    await client.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});