import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDendriteWorkspace } from '../src/install.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');

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
    assert.ok(!result.written.includes('.github/hooks/dendrite-wiki-benchmark.json'));
    await assert.rejects(fs.access(path.join(tempRoot, '.github', 'hooks', 'dendrite-wiki-benchmark.json')));
    assert.ok(result.written.includes('.github/hooks/dendrite-wiki-session-start.json'));
    assert.ok(result.written.includes('.github/hooks/dendrite-wiki-session-handoff.json'));
    assert.ok(result.written.includes('.github/hooks/dendrite-wiki-observations.json'));

    const indexContent = await fs.readFile(path.join(tempRoot, 'docs', 'index.md'), 'utf8');
    assert.match(indexContent, /Operator Workflow/);
    assert.match(indexContent, /## First Session Checklist/);

    // First-Session Accelerator (plan Phase C): the seeded pages are now richer.
    // We assert on stable markers that were enhanced; full runtime protocol injection
    // is tested via context + skill tests in follow-up.
    const projectPlan = await fs.readFile(path.join(tempRoot, 'docs', 'project-plan.md'), 'utf8');
    assert.match(projectPlan, /Current Goal/);
    assert.match(projectPlan, /Update this page whenever project direction/);

    const seededArchitecture = await fs.readFile(path.join(tempRoot, 'docs', 'wiki', 'architecture.md'), 'utf8');
    assert.match(seededArchitecture, /System Map/);
    assert.match(seededArchitecture, /First Edits/);

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

    const observationsHook = JSON.parse(
      await fs.readFile(path.join(tempRoot, '.github', 'hooks', 'dendrite-wiki-observations.json'), 'utf8')
    ) as { event: string; matcher: string; command: string; args: string[] };
    assert.equal(observationsHook.event, 'post-tool-use');
    assert.equal(observationsHook.matcher, 'Edit|Write|MultiEdit|Bash');
    assert.equal(observationsHook.command, 'dendrite-wiki');
    assert.deepEqual(observationsHook.args, ['observations:capture']);

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
        PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
        Stop?: Array<{ hooks: Array<{ type: string; command: string }> }>;
      };
    };
    const sessionStartCommand = claudeSettings.hooks.SessionStart[0]?.hooks[0];
    assert.equal(sessionStartCommand?.type, 'command');
    assert.match(sessionStartCommand?.command ?? '', /SessionStart/);
    assert.match(sessionStartCommand?.command ?? '', /wiki_context/);
    assert.match(sessionStartCommand?.command ?? '', /memory_handoff/);
    assert.match(sessionStartCommand?.command ?? '', /wiki_skill_load/, 'session-start should mention wiki_skill_load');
    assert.match(sessionStartCommand?.command ?? '', /enforces these rituals at the hook layer/, 'session-start should announce hook-layer enforcement');

    const postToolUseEntry = claudeSettings.hooks.PostToolUse[0];
    assert.equal(postToolUseEntry?.matcher, 'mcp__dendrite-wiki-mcp__wiki_context');
    assert.match(postToolUseEntry?.hooks[0]?.command ?? '', /memory_remember/);
    assert.match(postToolUseEntry?.hooks[0]?.command ?? '', /wiki_log/);

    // The third PostToolUse entry covers ritual-state tracking via post-tool-mark.mjs.
    // The matcher must include all four ritual MCP tools so wiki_context/wiki_log/
    // memory_remember/memory_handoff state stays current for the PreToolUse blocker
    // and Stop hook to consult.
    const stateTrackingEntry = claudeSettings.hooks.PostToolUse.find((entry) =>
      entry.matcher.includes('mcp__dendrite-wiki-mcp__wiki_context') &&
      entry.matcher.includes('mcp__dendrite-wiki-mcp__wiki_log') &&
      entry.matcher.includes('mcp__dendrite-wiki-mcp__memory_remember') &&
      entry.matcher.includes('mcp__dendrite-wiki-mcp__memory_handoff')
    );
    assert.ok(stateTrackingEntry, 'PostToolUse should include a ritual-state-tracking matcher');
    assert.match(stateTrackingEntry?.hooks[0]?.command ?? '', /post-tool-mark\.mjs/);

    const userPromptCommand = claudeSettings.hooks.UserPromptSubmit[0]?.hooks[0]?.command ?? '';
    assert.match(userPromptCommand, /source==='compact'/);
    assert.match(userPromptCommand, /Re-anchor on dendrite-wiki rituals/);

    const preToolUseEntry = claudeSettings.hooks.PreToolUse[0];
    assert.equal(preToolUseEntry?.matcher, 'Edit|Write|MultiEdit|NotebookEdit', 'PreToolUse should match all edit-class tools');
    // First hook is the blocker, second is skills:hook. Order matters: blocker
    // must run first so a deny short-circuits before skills:hook does any work.
    assert.match(preToolUseEntry?.hooks[0]?.command ?? '', /pre-edit-block\.mjs/, 'first PreToolUse hook should be the ritual blocker');
    assert.match(preToolUseEntry?.hooks[1]?.command ?? '', /skills:hook/, 'second PreToolUse hook should be skills:hook');

    // Stop hook denies turn-end if edits happened without wiki_log / memory_remember / memory_handoff.
    assert.ok(claudeSettings.hooks.Stop, 'Stop hook should be configured');
    assert.match(claudeSettings.hooks.Stop?.[0]?.hooks[0]?.command ?? '', /pre-stop-block\.mjs/);

    // The rendered pre-stop-block.mjs must enforce the memory-deposit gate (B1).
    // Without this constant the script would silently accept sessions that made
    // edits but never deposited a durable lesson — the drift asymmetry the
    // brain-faithfulness roadmap closes.
    const preStopBlockSource = await fs.readFile(
      path.join(tempRoot, '.claude', 'hooks', 'pre-stop-block.mjs'),
      'utf8'
    );
    assert.match(preStopBlockSource, /MEMORY_REMEMBER_REQUIRED_EDITS/, 'pre-stop-block must define the memory-deposit constant');
    assert.match(preStopBlockSource, /missing\.push\('memory_remember'\)/, 'pre-stop-block must add memory_remember to the missing list when not called');
    assert.match(preStopBlockSource, /lastMemoryRememberAt/, 'pre-stop-block must read lastMemoryRememberAt from session state');

    // The four hook scripts must be present on disk so the configured commands resolve.
    for (const script of ['lib.mjs', 'pre-edit-block.mjs', 'post-tool-mark.mjs', 'pre-stop-block.mjs']) {
      await fs.access(path.join(tempRoot, '.claude', 'hooks', script));
    }

    const skillsHookManifest = JSON.parse(
      await fs.readFile(path.join(tempRoot, '.github', 'hooks', 'dendrite-wiki-skills.json'), 'utf8')
    ) as { event: string; matcher: string; command: string; args: string[] };
    assert.equal(skillsHookManifest.event, 'pre-tool-use');
    assert.equal(skillsHookManifest.matcher, 'Edit|Write|MultiEdit');
    assert.deepEqual(skillsHookManifest.args, ['skills:hook']);

    assert.match(agentSkill, /wiki_skill_load/, 'agent skill should mention the new wiki_skill_load tool');
    assert.match(agentSkill, /skills:hook/, 'agent skill should mention the PreToolUse skills hook');

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
    assert.match(codexConfig, /\[features\]/, 'codex config.toml should include [features] section');
    assert.match(codexConfig, /hooks = true/, 'hooks feature flag must be enabled for hooks to fire');

    assert.ok(result.written.includes('.codex/hooks.json'), 'codex profile should write .codex/hooks.json');
    assert.ok(
      result.written.includes('plugins/dendrite-wiki-mcp/.codex-plugin/plugin.json'),
      'codex profile should write a local plugin manifest'
    );
    assert.ok(
      result.written.includes('plugins/dendrite-wiki-mcp/.mcp.json'),
      'codex profile should write plugin MCP config'
    );
    assert.ok(
      result.written.includes('.agents/plugins/marketplace.json'),
      'codex profile should write a local plugin marketplace'
    );
    const codexPluginMcp = JSON.parse(
      await fs.readFile(path.join(tempRoot, 'plugins', 'dendrite-wiki-mcp', '.mcp.json'), 'utf8')
    ) as { mcpServers: { 'dendrite-wiki-mcp': { command: string; args: string[] } } };
    assert.deepEqual(codexPluginMcp.mcpServers['dendrite-wiki-mcp'].command, 'npx');
    assert.deepEqual(codexPluginMcp.mcpServers['dendrite-wiki-mcp'].args, ['-y', 'dendrite-wiki-mcp']);
    assert.ok(result.written.includes('.cursor/hooks.json'), 'cursor profile should write .cursor/hooks.json');
    assert.ok(result.written.includes('.github/agents/dendrite.agent.md'), 'copilot agent file should be written');
    const copilotAgent = await fs.readFile(path.join(tempRoot, '.github', 'agents', 'dendrite.agent.md'), 'utf8');
    assert.match(copilotAgent, /^---\nname: dendrite/, 'copilot agent file must have YAML frontmatter starting with name');
    assert.match(copilotAgent, /hooks:/, 'copilot agent must declare hooks');
    assert.match(copilotAgent, /sessionStart:/, 'copilot agent must include sessionStart hook');
    assert.match(copilotAgent, /userPromptSubmitted:/, 'copilot agent must include userPromptSubmitted hook');
    assert.match(copilotAgent, /dendrite-wiki ritual:hook/, 'copilot agent must invoke ritual:hook');
    assert.match(copilotAgent, /chat\.useCustomAgentHooks/, 'copilot agent must document the required preview setting');
    const cursorHooks = JSON.parse(
      await fs.readFile(path.join(tempRoot, '.cursor', 'hooks.json'), 'utf8')
    ) as {
      hooks: { beforeMCPExecution?: Array<{ command: string }> };
    };
    const cursorCommand = cursorHooks.hooks.beforeMCPExecution?.[0]?.command ?? '';
    assert.match(cursorCommand, /dendrite-wiki ritual:cursor-hook/, 'cursor beforeMCPExecution must invoke ritual:cursor-hook');
    const codexHooks = JSON.parse(
      await fs.readFile(path.join(tempRoot, '.codex', 'hooks.json'), 'utf8')
    ) as {
      hooks: {
        SessionStart?: unknown[];
        PostToolUse?: unknown[];
        UserPromptSubmit?: Array<{ hooks: Array<{ command: string }> }>;
      };
    };
    assert.ok(Array.isArray(codexHooks.hooks.SessionStart), 'codex hooks.json should declare SessionStart');
    assert.ok(Array.isArray(codexHooks.hooks.PostToolUse), 'codex hooks.json should declare PostToolUse');
    const upsCommand = codexHooks.hooks.UserPromptSubmit?.[0]?.hooks?.[0]?.command ?? '';
    assert.match(upsCommand, /dendrite-wiki ritual:hook/, 'codex UserPromptSubmit hook must invoke ritual:hook');

    const secondResult = await installDendriteWorkspace({ root: tempRoot, mode: 'package' });
    assert.equal(secondResult.written.length, 0);
    assert.ok(secondResult.unchanged.includes('AGENTS.md'));
    assert.ok(secondResult.unchanged.includes('docs/index.md'));
    // The feature flag should be idempotent — running install again should not duplicate it.
    const codexConfigAfter = await fs.readFile(path.join(tempRoot, '.codex', 'config.toml'), 'utf8');
    const featuresMatches = codexConfigAfter.match(/\[features\]/g);
    assert.equal(featuresMatches?.length, 1, '[features] section should appear exactly once after re-install');
    const flagMatches = codexConfigAfter.match(/hooks = true/g);
    assert.equal(flagMatches?.length, 1, 'hooks flag should appear exactly once after re-install');
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

interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runCli(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', cliPath, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code }));
  });
}

test('init --ide claude-code installs the claude profile', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-ide-claude-'));
  const result = await runCli(tempRoot, ['init', '--ide', 'claude-code']);
  assert.equal(result.exitCode, 0, result.stderr);
  await fs.access(path.join(tempRoot, '.mcp.json'));
  await fs.access(path.join(tempRoot, '.claude', 'settings.json'));
  // Claude profile must NOT write Cursor or Copilot configs.
  await assert.rejects(fs.access(path.join(tempRoot, '.cursor', 'mcp.json')));
  await assert.rejects(fs.access(path.join(tempRoot, '.vscode', 'mcp.json')));
});

test('init --ide gemini-cli maps to the antigravity profile', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-ide-gemini-'));
  const tempHome = await mkdtemp(path.join(tmpdir(), 'dendrite-ide-gemini-home-'));
  // installDendriteWorkspace honors HOME on POSIX and USERPROFILE on Windows when
  // resolving user-scoped writes; the spawn must set both so the test does not write
  // into the developer's real ~/.gemini directory.
  const result = await runCli(tempRoot, ['init', '--ide', 'gemini-cli'], {
    HOME: tempHome,
    USERPROFILE: tempHome
  });
  assert.equal(result.exitCode, 0, result.stderr);
  await fs.access(path.join(tempHome, '.gemini', 'antigravity', 'mcp_config.json'));
});

test('init --ide rejects unknown IDE values with a useful error', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-ide-bad-'));
  const result = await runCli(tempRoot, ['init', '--ide', 'totally-fake-ide']);
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Unsupported --ide value/);
  assert.match(result.stderr, /claude-code/, 'error should list known IDE aliases');
});

test('installer-inlined ritual hook scripts stay byte-for-byte identical to .claude/hooks/*.mjs', async () => {
  // src/install.ts contains four `build*Hook()` functions that return the script
  // bodies as template strings. The functions are intentionally inlined (rather
  // than reading from disk at install time) so the npm package can ship them
  // without bundling extra files. The cost is drift risk: if `.claude/hooks/*.mjs`
  // is edited but the corresponding `build*Hook()` is not, downstream installs
  // would diverge silently. This test ships a temp install, reads each generated
  // script, and asserts it equals the source-of-truth at `.claude/hooks/`.
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-install-drift-'));
  try {
    await installDendriteWorkspace({ root: tempRoot, mode: 'package' });

    for (const script of ['lib.mjs', 'pre-edit-block.mjs', 'post-tool-mark.mjs', 'pre-stop-block.mjs']) {
      const sourceOfTruth = await fs.readFile(path.join(repoRoot, '.claude', 'hooks', script), 'utf8');
      const installed = await fs.readFile(path.join(tempRoot, '.claude', 'hooks', script), 'utf8');
      // Normalize CRLF to LF for cross-platform safety. The installer always
      // writes LF; the working tree may have CRLF on Windows depending on
      // core.autocrlf, so the comparison must be ending-insensitive.
      const normalize = (text: string): string => text.replace(/\r\n/g, '\n');
      assert.equal(
        normalize(installed),
        normalize(sourceOfTruth),
        `Drift detected: ${script} inlined in src/install.ts no longer matches .claude/hooks/${script}. If you edited the source, also update the corresponding build*Hook() function in src/install.ts (and vice versa).`
      );
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
