import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');
const serverEntryPoint = path.join(repoRoot, 'src', 'index.ts');

function textContent(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content
    ?.filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n') ?? '';
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
      ['wiki_apply_proposal', 'wiki_context', 'wiki_index', 'wiki_lint', 'wiki_log', 'wiki_proposals', 'wiki_read', 'wiki_search', 'wiki_write', 'wiki_write_proposals']
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