import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installDendriteWorkspace } from '../src/install.js';

test('workspace installer writes MCP configs and agent customization files', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-install-'));

  try {
    const result = await installDendriteWorkspace({ root: tempRoot, mode: 'package' });
    assert.ok(result.written.includes('.vscode/mcp.json'));
    assert.ok(result.written.includes('.cursor/mcp.json'));
    assert.ok(result.written.includes('.mcp.json'));
    assert.ok(result.written.includes('docs/index.md'));
    assert.ok(result.written.includes('docs/project-plan.md'));
    assert.ok(result.written.includes('docs/wiki/operator-workflow.md'));
    assert.ok(result.written.includes('.github/prompts/dendrite-wiki-session.prompt.md'));
    assert.ok(result.written.includes('.agents/skills/dendrite-wiki/SKILL.md'));
    assert.ok(result.written.includes('.github/hooks/dendrite-wiki-benchmark.json'));

    const indexContent = await fs.readFile(path.join(tempRoot, 'docs', 'index.md'), 'utf8');
    assert.match(indexContent, /Operator Workflow/);
    assert.match(indexContent, /## First Session Checklist/);

    const operatorWorkflow = await fs.readFile(path.join(tempRoot, 'docs', 'wiki', 'operator-workflow.md'), 'utf8');
    assert.match(operatorWorkflow, /## Daily Loop/);

    const architecture = await fs.readFile(path.join(tempRoot, 'docs', 'wiki', 'architecture.md'), 'utf8');
    assert.match(architecture, /lifecycle: active/);
    assert.match(architecture, /## First Edits/);

    const vscodeConfig = JSON.parse(await fs.readFile(path.join(tempRoot, '.vscode', 'mcp.json'), 'utf8')) as {
      servers: { 'dendrite-wiki-mcp': { type: string; command: string; args: string[] } };
    };
    assert.deepEqual(vscodeConfig.servers['dendrite-wiki-mcp'], {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'dendrite-wiki-mcp']
    });

    const claudeConfig = JSON.parse(await fs.readFile(path.join(tempRoot, '.mcp.json'), 'utf8')) as {
      mcpServers: { 'dendrite-wiki-mcp': { command: string; args: string[] } };
    };
    assert.deepEqual(claudeConfig.mcpServers['dendrite-wiki-mcp'], {
      command: 'npx',
      args: ['-y', 'dendrite-wiki-mcp']
    });

    const secondResult = await installDendriteWorkspace({ root: tempRoot, mode: 'package' });
    assert.equal(secondResult.written.length, 0);
    assert.ok(secondResult.unchanged.includes('AGENTS.md'));
    assert.ok(secondResult.unchanged.includes('docs/index.md'));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('workspace installer can write development-mode MCP configs', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-install-dev-'));

  try {
    await installDendriteWorkspace({ root: tempRoot, mode: 'dev' });
    const vscodeConfig = JSON.parse(await fs.readFile(path.join(tempRoot, '.vscode', 'mcp.json'), 'utf8')) as {
      servers: { 'dendrite-wiki-mcp': { type: string; command: string; args: string[]; cwd: string } };
    };
    assert.deepEqual(vscodeConfig.servers['dendrite-wiki-mcp'], {
      type: 'stdio',
      command: 'npm',
      args: ['run', 'dev'],
      cwd: '${workspaceFolder}'
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});