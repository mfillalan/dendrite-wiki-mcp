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
    assert.ok(result.written.includes('.codex/config.toml'));
    assert.ok(result.written.includes('.continue/mcpServers/dendrite-wiki-mcp.json'));
    assert.ok(result.written.includes('docs/index.md'));
    assert.ok(result.written.includes('docs/project-plan.md'));
    assert.ok(result.written.includes('docs/wiki/benchmark-report.md'));
    assert.ok(result.written.includes('docs/wiki/telemetry-status.md'));
    assert.ok(result.written.includes('docs/public/dendrite-telemetry-status.json'));
    assert.ok(result.written.includes('docs/wiki/operator-workflow.md'));
    assert.ok(result.written.includes('.github/prompts/dendrite-wiki-session.prompt.md'));
    assert.ok(result.written.includes('.agents/skills/dendrite-wiki/SKILL.md'));
    assert.ok(result.written.includes('.github/hooks/dendrite-wiki-benchmark.json'));
    assert.ok(result.written.includes('.github/hooks/dendrite-wiki-session-start.json'));
    assert.ok(result.written.includes('.github/hooks/dendrite-wiki-session-handoff.json'));

    const indexContent = await fs.readFile(path.join(tempRoot, 'docs', 'index.md'), 'utf8');
    assert.match(indexContent, /Operator Workflow/);
    assert.match(indexContent, /## First Session Checklist/);

    const operatorWorkflow = await fs.readFile(path.join(tempRoot, 'docs', 'wiki', 'operator-workflow.md'), 'utf8');
    assert.match(operatorWorkflow, /## Daily Loop/);

    const agentsFile = await fs.readFile(path.join(tempRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsFile, /memory_handoff/);
    assert.match(agentsFile, /handoffs/);

    const seededAgentWorkflow = await fs.readFile(path.join(tempRoot, 'docs', 'wiki', 'agent-workflow.md'), 'utf8');
    assert.match(seededAgentWorkflow, /## Session Handoff Rule/);
    assert.match(seededAgentWorkflow, /memory_handoff/);

    const sessionStartHook = JSON.parse(
      await fs.readFile(path.join(tempRoot, '.github', 'hooks', 'dendrite-wiki-session-start.json'), 'utf8')
    ) as { event: string; tool: string };
    assert.equal(sessionStartHook.event, 'session-start');
    assert.equal(sessionStartHook.tool, 'wiki_context');

    const sessionHandoffHook = JSON.parse(
      await fs.readFile(path.join(tempRoot, '.github', 'hooks', 'dendrite-wiki-session-handoff.json'), 'utf8')
    ) as { event: string; tool: string };
    assert.equal(sessionHandoffHook.event, 'session-end');
    assert.equal(sessionHandoffHook.tool, 'memory_handoff');

    const claudeCommand = await fs.readFile(path.join(tempRoot, '.claude', 'commands', 'dendrite-wiki-session.md'), 'utf8');
    assert.match(claudeCommand, /memory_handoff/);

    const agentSkill = await fs.readFile(path.join(tempRoot, '.agents', 'skills', 'dendrite-wiki', 'SKILL.md'), 'utf8');
    assert.match(agentSkill, /memory_handoff/);

    const claudeSettingsPath = path.join(tempRoot, '.claude', 'settings.json');
    const claudeSettings = JSON.parse(await fs.readFile(claudeSettingsPath, 'utf8')) as {
      hooks: {
        SessionStart: Array<{ hooks: Array<{ type: string; command: string }> }>;
        PostToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
        UserPromptSubmit: Array<{ hooks: Array<{ type: string; command: string }> }>;
      };
    };
    const sessionStartCommand = claudeSettings.hooks.SessionStart[0]?.hooks[0];
    assert.equal(sessionStartCommand?.type, 'command');
    assert.match(sessionStartCommand?.command ?? '', /SessionStart/);
    assert.match(sessionStartCommand?.command ?? '', /wiki_context/);
    assert.match(sessionStartCommand?.command ?? '', /memory_handoff/);

    const postToolUseEntry = claudeSettings.hooks.PostToolUse[0];
    assert.equal(postToolUseEntry?.matcher, 'mcp__dendrite-wiki-mcp__wiki_context');
    assert.match(postToolUseEntry?.hooks[0]?.command ?? '', /memory_remember/);
    assert.match(postToolUseEntry?.hooks[0]?.command ?? '', /wiki_log/);

    const userPromptCommand = claudeSettings.hooks.UserPromptSubmit[0]?.hooks[0]?.command ?? '';
    assert.match(userPromptCommand, /source==='compact'/);
    assert.match(userPromptCommand, /Re-anchor on dendrite-wiki rituals/);

    const benchmarkReport = await fs.readFile(path.join(tempRoot, 'docs', 'wiki', 'benchmark-report.md'), 'utf8');
    assert.match(benchmarkReport, /<BenchmarkReport\s*\/>/);

    const telemetryStatus = await fs.readFile(path.join(tempRoot, 'docs', 'wiki', 'telemetry-status.md'), 'utf8');
    assert.match(telemetryStatus, /<TelemetryStatus\s*\/>/);

    const telemetryStatusArtifact = JSON.parse(
      await fs.readFile(path.join(tempRoot, 'docs', 'public', 'dendrite-telemetry-status.json'), 'utf8')
    ) as {
      sharingMode: string;
      sharingEnabled: boolean;
    };
    assert.equal(telemetryStatusArtifact.sharingMode, 'off');
    assert.equal(telemetryStatusArtifact.sharingEnabled, false);

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

    const continueConfig = JSON.parse(
      await fs.readFile(path.join(tempRoot, '.continue', 'mcpServers', 'dendrite-wiki-mcp.json'), 'utf8')
    ) as {
      mcpServers: { 'dendrite-wiki-mcp': { command: string; args: string[] } };
    };
    assert.deepEqual(continueConfig.mcpServers['dendrite-wiki-mcp'], {
      command: 'npx',
      args: ['-y', 'dendrite-wiki-mcp']
    });

    const codexConfig = await fs.readFile(path.join(tempRoot, '.codex', 'config.toml'), 'utf8');
    assert.match(codexConfig, /\[mcp_servers\."dendrite-wiki-mcp"\]/);
    assert.match(codexConfig, /command = "npx"/);
    assert.match(codexConfig, /args = \["-y","dendrite-wiki-mcp"\]/);

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

test('workspace installer can install a claude-only profile without unrelated client files', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-install-claude-'));

  try {
    const result = await installDendriteWorkspace({ root: tempRoot, mode: 'package', profile: 'claude' });
    assert.equal(result.profile, 'claude');
    assert.ok(result.written.includes('.mcp.json'));
    assert.ok(result.written.includes('.claude/commands/dendrite-wiki-session.md'));
    assert.ok(result.written.includes('.claude/settings.json'));
    assert.ok(result.written.includes('docs/index.md'));
    assert.ok(result.written.includes('docs/wiki/benchmark-report.md'));
    assert.ok(result.written.includes('docs/wiki/telemetry-status.md'));
    assert.ok(result.written.includes('docs/wiki/benchmark-log.md'));

    await assert.rejects(fs.access(path.join(tempRoot, '.vscode', 'mcp.json')));
    await assert.rejects(fs.access(path.join(tempRoot, '.cursor', 'mcp.json')));
    await assert.rejects(fs.access(path.join(tempRoot, '.github', 'copilot-instructions.md')));
    await assert.rejects(fs.access(path.join(tempRoot, 'AGENTS.md')));

    const claudeConfig = JSON.parse(await fs.readFile(path.join(tempRoot, '.mcp.json'), 'utf8')) as {
      mcpServers: { 'dendrite-wiki-mcp': { command: string; args: string[] } };
    };
    assert.deepEqual(claudeConfig.mcpServers['dendrite-wiki-mcp'], {
      command: 'npx',
      args: ['-y', 'dendrite-wiki-mcp']
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('workspace installer can install user-scoped antigravity config without writing unrelated local client files', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-install-antigravity-'));
  const tempHome = await mkdtemp(path.join(tmpdir(), 'dendrite-home-'));

  try {
    const result = await installDendriteWorkspace({
      root: tempRoot,
      userHomeDir: tempHome,
      mode: 'package',
      profile: 'antigravity'
    });

    assert.equal(result.profile, 'antigravity');
    assert.ok(result.written.includes('~/.gemini/antigravity/mcp_config.json'));
    assert.ok(result.written.includes('docs/index.md'));
    assert.ok(result.written.includes('docs/wiki/benchmark-report.md'));
    assert.ok(result.written.includes('docs/wiki/telemetry-status.md'));
    assert.ok(result.written.includes('docs/wiki/benchmark-log.md'));

    await assert.rejects(fs.access(path.join(tempRoot, '.vscode', 'mcp.json')));
    await assert.rejects(fs.access(path.join(tempRoot, '.cursor', 'mcp.json')));
    await assert.rejects(fs.access(path.join(tempRoot, '.mcp.json')));

    const antigravityConfig = JSON.parse(
      await fs.readFile(path.join(tempHome, '.gemini', 'antigravity', 'mcp_config.json'), 'utf8')
    ) as {
      mcpServers: { 'dendrite-wiki-mcp': { command: string; args: string[] } };
    };
    assert.deepEqual(antigravityConfig.mcpServers['dendrite-wiki-mcp'], {
      command: 'npx',
      args: ['-y', 'dendrite-wiki-mcp']
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});