/**
 * Workspace installer — `dendrite-wiki init`.
 *
 * Sets up Dendrite Wiki MCP inside a target project: writes the right MCP client config
 * for the operator's IDE (Claude Code, Cursor, Codex, Continue, Windsurf, Antigravity,
 * Copilot in VS Code), seeds a starter wiki under `docs/`, drops agent-guidance files
 * (`AGENTS.md`, `.github/copilot-instructions.md`, etc.) explaining the workflow, and
 * registers the PostToolUse / PreToolUse hooks that drive raw-observation capture and
 * skill matching.
 *
 * Three install modes select where the MCP client should call from:
 *   - `package` (default): clients run `npx -y dendrite-wiki-mcp` from the npm registry.
 *   - `dev`: clients run `npm run dev` against the workspace (used while developing this repo).
 *   - `built`: clients run `node dist/src/index.js` from the workspace's compiled output.
 *
 * The `--ide` flag is the friendlier surface; legacy `--profile` accepts the same set.
 * Idempotent — re-running `init` updates only files whose content changed.
 */
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { writeTelemetryStatusArtifact } from '@rarusoft/dendrite-wiki';

export type DendriteInstallMode = 'package' | 'dev' | 'built';
export type DendriteInstallProfile =
  | 'all'
  | 'claude'
  | 'copilot-vscode'
  | 'cursor'
  | 'codex'
  | 'continue'
  | 'windsurf'
  | 'antigravity';

export interface DendriteInstallOptions {
  root?: string;
  mode?: DendriteInstallMode;
  profile?: DendriteInstallProfile;
  userHomeDir?: string;
  packageName?: string;
  serverName?: string;
}

export interface DendriteInstallResult {
  root: string;
  mode: DendriteInstallMode;
  profile: DendriteInstallProfile;
  written: string[];
  unchanged: string[];
}

const defaultServerName = 'dendrite-wiki-mcp';
const defaultPackageName = 'dendrite-wiki-mcp';

export async function installDendriteWorkspace(options: DendriteInstallOptions = {}): Promise<DendriteInstallResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const mode = options.mode ?? 'package';
  const profile = options.profile ?? 'all';
  const userHomeDir = path.resolve(options.userHomeDir ?? homedir());
  const packageName = options.packageName ?? defaultPackageName;
  const serverName = options.serverName ?? defaultServerName;
  const result: DendriteInstallResult = { root, mode, profile, written: [], unchanged: [] };

  const plan = buildInstallPlan(profile);

  if (plan.clients.includes('vscode')) {
    await writeMcpConfig({
      path: path.join(root, '.vscode', 'mcp.json'),
      containerKey: 'servers',
      serverName,
      serverConfig: buildVsCodeServerConfig(mode, packageName),
      result
    });
  }
  if (plan.clients.includes('cursor')) {
    await writeMcpConfig({
      path: path.join(root, '.cursor', 'mcp.json'),
      containerKey: 'mcpServers',
      serverName,
      serverConfig: buildProjectServerConfig(mode, packageName),
      result
    });
  }
  if (plan.clients.includes('claude')) {
    await writeMcpConfig({
      path: path.join(root, '.mcp.json'),
      containerKey: 'mcpServers',
      serverName,
      serverConfig: buildProjectServerConfig(mode, packageName),
      result
    });
  }
  if (plan.clients.includes('codex')) {
    await writeCodexConfig({
      path: path.join(root, '.codex', 'config.toml'),
      serverName,
      serverConfig: buildCodexServerConfig(mode, packageName),
      result
    });
    await ensureCodexFeatureFlag({
      path: path.join(root, '.codex', 'config.toml'),
      flagName: 'hooks',
      result
    });
    await writeIfMissing(path.join(root, '.codex', 'hooks.json'), buildCodexHooks(), result);
    await writeCodexPluginWrapper({ root, mode, packageName, serverName, result });
  }
  if (plan.clients.includes('continue')) {
    await writeMcpConfig({
      path: path.join(root, '.continue', 'mcpServers', `${serverName}.json`),
      containerKey: 'mcpServers',
      serverName,
      serverConfig: buildProjectServerConfig(mode, packageName),
      result
    });
  }
  if (plan.clients.includes('windsurf')) {
    await writeMcpConfig({
      path: path.join(userHomeDir, '.codeium', 'windsurf', 'mcp_config.json'),
      displayPath: '~/.codeium/windsurf/mcp_config.json',
      containerKey: 'mcpServers',
      serverName,
      serverConfig: buildProjectServerConfig(mode, packageName),
      result
    });
  }
  if (plan.clients.includes('antigravity')) {
    await writeMcpConfig({
      path: path.join(userHomeDir, '.gemini', 'antigravity', 'mcp_config.json'),
      displayPath: '~/.gemini/antigravity/mcp_config.json',
      containerKey: 'mcpServers',
      serverName,
      serverConfig: buildProjectServerConfig(mode, packageName),
      result
    });
  }

  if (plan.assets.includes('agents-file')) {
    await writeIfMissing(path.join(root, 'AGENTS.md'), buildAgentsFile(), result);
  }
  if (plan.assets.includes('copilot-instructions')) {
    await writeIfMissing(path.join(root, '.github', 'copilot-instructions.md'), buildCopilotInstructions(), result);
  }
  if (plan.assets.includes('vscode-instructions')) {
    await writeIfMissing(path.join(root, '.github', 'instructions', 'dendrite-wiki.instructions.md'), buildVsCodeInstructions(), result);
  }
  if (plan.assets.includes('vscode-prompt')) {
    await writeIfMissing(path.join(root, '.github', 'prompts', 'dendrite-wiki-session.prompt.md'), buildVsCodePrompt(), result);
  }
  if (plan.assets.includes('cursor-rule')) {
    await writeIfMissing(path.join(root, '.cursor', 'rules', 'dendrite-wiki.mdc'), buildCursorRule(), result);
  }
  if (plan.clients.includes('cursor')) {
    await writeIfMissing(path.join(root, '.cursor', 'hooks.json'), buildCursorHooks(), result);
  }
  if (plan.assets.includes('claude-command')) {
    await writeIfMissing(path.join(root, '.claude', 'commands', 'dendrite-wiki-session.md'), buildClaudeCommand(), result);
  }
  if (plan.assets.includes('claude-settings')) {
    await writeIfMissing(path.join(root, '.claude', 'settings.json'), buildClaudeSettings(), result);
    // Ship the four ritual-enforcement hook scripts. They live under .claude/hooks/
    // because Claude Code is the primary blocker target, but Codex's hooks.json
    // references them from the same path so a single copy serves both clients.
    await writeRitualHookScripts(root, result);
  }
  if (plan.clients.includes('codex')) {
    // Codex shares the .claude/hooks/ scripts (matching hook input shape) when
    // claude-settings isn't already in the plan (e.g. profile=codex).
    await writeRitualHookScripts(root, result);
  }
  if (plan.assets.includes('copilot-agent')) {
    await writeIfMissing(path.join(root, '.github', 'agents', 'dendrite.agent.md'), buildCopilotAgent(), result);
  }
  if (plan.assets.includes('agent-skill')) {
    await writeIfMissing(path.join(root, '.agents', 'skills', 'dendrite-wiki', 'SKILL.md'), buildAgentSkill(), result);
  }
  if (plan.assets.includes('session-hooks')) {
    await writeIfMissing(
      path.join(root, '.github', 'hooks', 'dendrite-wiki-session-start.json'),
      buildSessionStartHookManifest(),
      result
    );
    await writeIfMissing(
      path.join(root, '.github', 'hooks', 'dendrite-wiki-session-handoff.json'),
      buildSessionHandoffHookManifest(),
      result
    );
    await writeIfMissing(
      path.join(root, '.github', 'hooks', 'dendrite-wiki-skills.json'),
      buildSkillsHookManifest(),
      result
    );
    await writeIfMissing(
      path.join(root, '.github', 'hooks', 'dendrite-wiki-observations.json'),
      buildObservationsHookManifest(),
      result
    );
  }
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'benchmark-log.md'), buildBenchmarkLog(), result);
  await writeSeedWiki(root, result);
  await writeSeedTelemetryStatusArtifact(root, result);

  return result;
}

async function writeSeedWiki(root: string, result: DendriteInstallResult): Promise<void> {
  await writeIfMissing(path.join(root, 'docs', 'index.md'), buildSeedIndex(), result);
  await writeIfMissing(path.join(root, 'docs', 'project-plan.md'), buildSeedProjectPlan(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'agent-workflow.md'), buildSeedAgentWorkflow(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'architecture.md'), buildSeedArchitecture(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'living-wiki-model.md'), buildSeedLivingWikiModel(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'operator-workflow.md'), buildSeedOperatorWorkflow(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'maintenance-inbox.md'), buildSeedMaintenanceInbox(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'maintenance-review.md'), buildSeedMaintenanceReview(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'proposal-workflow.md'), buildSeedProposalWorkflow(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'benchmark-report.md'), buildSeedBenchmarkReport(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'benchmarking.md'), buildSeedBenchmarking(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'telemetry-status.md'), buildSeedTelemetryStatus(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'mcp-installation.md'), buildSeedInstallationGuide(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'project-log.md'), buildSeedProjectLog(), result);
}

async function writeSeedTelemetryStatusArtifact(root: string, result: DendriteInstallResult): Promise<void> {
  const filePath = path.join(root, 'docs', 'public', 'dendrite-telemetry-status.json');
  const relativePath = 'docs/public/dendrite-telemetry-status.json';
  const existing = await fs.readFile(filePath, 'utf8').catch(() => undefined);

  if (existing !== undefined) {
    result.unchanged.push(relativePath);
    return;
  }

  await writeTelemetryStatusArtifact(root);
  result.written.push(relativePath);
}

function buildVsCodeServerConfig(mode: DendriteInstallMode, packageName: string): Record<string, unknown> {
  return { type: 'stdio', ...buildProjectServerConfig(mode, packageName), ...(mode === 'dev' ? { cwd: '${workspaceFolder}' } : {}) };
}

function buildCodexServerConfig(mode: DendriteInstallMode, packageName: string): Record<string, unknown> {
  return { ...buildProjectServerConfig(mode, packageName), ...(mode === 'package' ? {} : { cwd: '.' }) };
}

function buildProjectServerConfig(mode: DendriteInstallMode, packageName: string): Record<string, unknown> {
  if (mode === 'dev') {
    return { command: 'npm', args: ['run', 'dev'] };
  }

  if (mode === 'built') {
    return { command: 'node', args: ['dist/src/index.js'] };
  }

  return { command: 'npx', args: ['-y', packageName] };
}

async function writeCodexPluginWrapper(input: {
  root: string;
  mode: DendriteInstallMode;
  packageName: string;
  serverName: string;
  result: DendriteInstallResult;
}): Promise<void> {
  const pluginRoot = path.join(input.root, 'plugins', input.serverName);
  await writeIfMissing(
    path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
    buildCodexPluginManifest(input.serverName),
    input.result
  );
  await writeIfMissing(path.join(pluginRoot, '.mcp.json'), buildCodexPluginMcp(input), input.result);
  await writeIfMissing(
    path.join(pluginRoot, 'skills', 'dendrite-wiki', 'SKILL.md'),
    buildCodexPluginSkill(),
    input.result
  );
  await writeCodexPluginMarketplace({
    path: path.join(input.root, '.agents', 'plugins', 'marketplace.json'),
    serverName: input.serverName,
    result: input.result
  });
}

function buildCodexPluginManifest(serverName: string): string {
  return `${JSON.stringify(
    {
      name: serverName,
      version: '0.1.0',
      description: 'Project-local Dendrite Wiki MCP integration for Codex.',
      author: {
        name: 'Dendrite Wiki MCP',
        url: 'https://github.com/mfillalan/dendrite-wiki-mcp'
      },
      homepage: 'https://github.com/mfillalan/dendrite-wiki-mcp',
      repository: 'https://github.com/mfillalan/dendrite-wiki-mcp',
      license: 'Apache-2.0',
      keywords: ['dendrite', 'wiki', 'mcp', 'codex', 'memory'],
      skills: './skills/',
      mcpServers: './.mcp.json',
      interface: {
        displayName: 'Dendrite Wiki MCP',
        shortDescription: 'Project wiki, memory, and handoff MCP tools',
        longDescription:
          'Loads the local Dendrite Wiki MCP server and companion workflow skill so Codex can use project wiki context, memory, handoffs, lint, and documentation maintenance tools from this repository.',
        developerName: 'Dendrite Wiki MCP',
        category: 'Coding',
        capabilities: ['Interactive', 'Write'],
        websiteURL: 'https://github.com/mfillalan/dendrite-wiki-mcp',
        privacyPolicyURL: 'https://github.com/mfillalan/dendrite-wiki-mcp',
        termsOfServiceURL: 'https://github.com/mfillalan/dendrite-wiki-mcp',
        defaultPrompt: [
          'Load Dendrite wiki context for this repo',
          'Record a Dendrite project handoff',
          'Check Dendrite wiki maintenance'
        ],
        brandColor: '#2563EB',
        screenshots: []
      }
    },
    null,
    2
  )}\n`;
}

function buildCodexPluginMcp(input: {
  root: string;
  mode: DendriteInstallMode;
  packageName: string;
  serverName: string;
}): string {
  const serverConfig =
    input.mode === 'package'
      ? { command: 'npx', args: ['-y', input.packageName] }
      : { ...buildProjectServerConfig(input.mode, input.packageName), cwd: toPortablePath(input.root) };
  return `${JSON.stringify(
    {
      mcpServers: {
        [input.serverName]: {
          ...serverConfig,
          startup_timeout_sec: 60,
          note:
            'Local Dendrite Wiki MCP server. This plugin wrapper helps Codex IDE builds mount the MCP namespace reliably.'
        }
      }
    },
    null,
    2
  )}\n`;
}

function buildCodexPluginSkill(): string {
  return `---\nname: dendrite-wiki\ndescription: Use when starting or continuing work in a project that uses Dendrite Wiki MCP, especially when you need project status, persistent memory, documentation updates, or benchmark snapshots.\n---\n\n# Dendrite Wiki\n\nUse the Dendrite Wiki MCP server before substantial project work.\n\n1. Call \`wiki_context\` with the current task as \`query\`.\n2. Read the returned \`readFirst\` pages before editing.\n3. Use \`wiki_skill_load\` for relevant project skills returned by context.\n4. Record durable discoveries with \`memory_remember\`.\n5. Record meaningful project changes with \`wiki_log\`.\n6. Before stopping with unfinished work, call \`memory_handoff\`.\n\nIf native \`mcp__dendrite-wiki-mcp__*\` tools are absent, restart Codex or VS Code and verify that this repo has \`plugins/dendrite-wiki-mcp/.mcp.json\` plus \`.agents/plugins/marketplace.json\`.\n`;
}

async function writeCodexPluginMarketplace(input: {
  path: string;
  serverName: string;
  result: DendriteInstallResult;
}): Promise<void> {
  const current = await readJsonObject(input.path);
  const currentPlugins = Array.isArray(current.plugins) ? current.plugins : [];
  const entry = {
    name: input.serverName,
    source: {
      source: 'local',
      path: `./plugins/${input.serverName}`
    },
    policy: {
      installation: 'INSTALLED_BY_DEFAULT',
      authentication: 'ON_USE'
    },
    category: 'Coding'
  };
  const nextPlugins = [
    ...currentPlugins.filter(plugin => !(isRecord(plugin) && plugin.name === input.serverName)),
    entry
  ];
  const next = {
    ...current,
    name: typeof current.name === 'string' ? current.name : 'dendrite-local',
    interface: isRecord(current.interface)
      ? current.interface
      : {
          displayName: 'Dendrite Local'
        },
    plugins: nextPlugins
  };
  await writeIfChanged(input.path, `${JSON.stringify(next, null, 2)}\n`, input.result);
}

async function writeMcpConfig(input: {
  path: string;
  displayPath?: string;
  containerKey: 'servers' | 'mcpServers';
  serverName: string;
  serverConfig: Record<string, unknown>;
  result: DendriteInstallResult;
}): Promise<void> {
  const current = await readJsonObject(input.path);
  const currentServers = current[input.containerKey];
  const servers = isRecord(currentServers) ? currentServers : {};
  const next = {
    ...current,
    [input.containerKey]: {
      ...servers,
      [input.serverName]: input.serverConfig
    }
  };

  await writeIfChanged(input.path, `${JSON.stringify(next, null, 2)}\n`, input.result, input.displayPath);
}

async function writeCodexConfig(input: {
  path: string;
  serverName: string;
  serverConfig: Record<string, unknown>;
  result: DendriteInstallResult;
}): Promise<void> {
  const existing = await fs.readFile(input.path, 'utf8').catch(() => undefined);
  const newline = existing?.includes('\r\n') ? '\r\n' : '\n';
  const section = buildCodexSection(input.serverName, input.serverConfig).trimEnd().split('\n');

  if (existing === undefined) {
    await writeIfChanged(input.path, `${section.join(newline)}${newline}`, input.result);
    return;
  }

  const lines = existing.replace(/\r\n/g, '\n').split('\n');
  const header = section[0];
  const start = lines.findIndex((line) => line.trim() === header);

  let nextLines = lines;
  if (start === -1) {
    const prefix = existing.trim().length === 0 ? [] : ['', ''];
    nextLines = [...lines.slice(0, Math.max(lines.length - 1, 0)), ...prefix, ...section];
  } else {
    let end = start + 1;
    while (end < lines.length) {
      const currentLine = lines[end].trim();
      if (currentLine.startsWith('[') && currentLine.endsWith(']')) {
        break;
      }
      end += 1;
    }
    nextLines = [...lines.slice(0, start), ...section, ...lines.slice(end)];
  }

  const next = `${nextLines.join(newline).replace(/[\r\n]+$/, '')}${newline}`;
  await writeIfChanged(input.path, next, input.result);
}

async function ensureCodexFeatureFlag(input: {
  path: string;
  flagName: string;
  result: DendriteInstallResult;
}): Promise<void> {
  const existing = await fs.readFile(input.path, 'utf8').catch(() => undefined);
  if (existing === undefined) {
    return;
  }

  const newline = existing.includes('\r\n') ? '\r\n' : '\n';
  const lines = existing.replace(/\r\n/g, '\n').split('\n');
  const featuresHeader = '[features]';
  const headerIndex = lines.findIndex((line) => line.trim() === featuresHeader);
  const flagLine = `${input.flagName} = true`;

  if (headerIndex === -1) {
    // Append directly without blank-line padding. writeCodexConfig replaces the
    // [mcp_servers] section "until the next [section] header" and would strip any
    // intermediate blank lines on a re-run, so adjacency keeps the file idempotent.
    const next = [...lines.slice(0, Math.max(lines.length - 1, 0)), featuresHeader, flagLine];
    const nextContent = `${next.join(newline).replace(/[\r\n]+$/, '')}${newline}`;
    await writeIfChanged(input.path, nextContent, input.result);
    return;
  }

  // Walk forward until next section header to find the flag line, if present.
  let cursor = headerIndex + 1;
  let alreadyHasFlag = false;
  while (cursor < lines.length) {
    const trimmed = lines[cursor].trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) break;
    if (trimmed.startsWith(`${input.flagName} =`) || trimmed.startsWith(`${input.flagName}=`)) {
      alreadyHasFlag = true;
      break;
    }
    cursor += 1;
  }

  if (alreadyHasFlag) {
    return;
  }

  const next = [...lines.slice(0, headerIndex + 1), flagLine, ...lines.slice(headerIndex + 1)];
  const nextContent = `${next.join(newline).replace(/[\r\n]+$/, '')}${newline}`;
  await writeIfChanged(input.path, nextContent, input.result);
}

function buildCodexSection(serverName: string, serverConfig: Record<string, unknown>): string {
  const lines = [`[mcp_servers.${JSON.stringify(serverName)}]`];

  if (typeof serverConfig.command === 'string') {
    lines.push(`command = ${JSON.stringify(serverConfig.command)}`);
  }
  if (Array.isArray(serverConfig.args)) {
    lines.push(`args = ${JSON.stringify(serverConfig.args)}`);
  }
  if (isRecord(serverConfig.env) && Object.keys(serverConfig.env).length > 0) {
    lines.push('env = {');
    for (const [key, value] of Object.entries(serverConfig.env)) {
      lines.push(`  ${key} = ${JSON.stringify(value)}`);
    }
    lines.push('}');
  }
  if (typeof serverConfig.cwd === 'string') {
    lines.push(`cwd = ${JSON.stringify(serverConfig.cwd)}`);
  }

  return `${lines.join('\n')}\n`;
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const content = await fs.readFile(filePath, 'utf8').catch(() => undefined);
  if (!content) {
    return {};
  }

  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function writeIfMissing(filePath: string, content: string, result: DendriteInstallResult, displayPath?: string): Promise<void> {
  const existing = await fs.readFile(filePath, 'utf8').catch(() => undefined);
  if (existing !== undefined) {
    result.unchanged.push(displayPath ?? toPortablePath(path.relative(result.root, filePath)));
    return;
  }

  await writeIfChanged(filePath, content, result, displayPath);
}

async function writeIfChanged(filePath: string, content: string, result: DendriteInstallResult, displayPath?: string): Promise<void> {
  const relativePath = displayPath ?? toPortablePath(path.relative(result.root, filePath));
  const existing = await fs.readFile(filePath, 'utf8').catch(() => undefined);
  if (existing === content) {
    result.unchanged.push(relativePath);
    return;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  result.written.push(relativePath);
}

function toPortablePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function buildAgentsFile(): string {
  return `# Agent Operating Notes\n\nThis project uses Dendrite Wiki MCP for local project memory and browser-viewable documentation. The dendrite-wiki MCP rituals are not optional - if you skip them the project forgets what it learned last session.\n\n## Dendrite Workflow\n\n1. Read [docs/index.md](docs/index.md) before starting project work.\n2. **Always** call the MCP tool \`mcp__dendrite-wiki-mcp__wiki_context\` for any non-trivial task before acting. Do not gate this on whether context "feels needed" - call it. The response includes a \`skills\` array (top-3 matching project-local skill memories by default); call \`mcp__dendrite-wiki-mcp__wiki_skill_load\` with each skill id you want full content for.\n3. If \`wiki_context\` returns \`handoffs\`, read those first as the current session-resumption layer.\n4. Do not run benchmark snapshots or wiki refreshes as a session-start ritual. \`dendrite-wiki benchmark:snapshot\`, \`npm run wiki:refresh\`, and \`dendrite-wiki docs:api\` mutate generated files; run them only when the operator asks for a benchmark, generated-doc refresh, release check, or publish-prep validation.\n5. Whenever you discover a non-obvious lesson during work, immediately store it via \`mcp__dendrite-wiki-mcp__memory_remember\` so future sessions inherit it. If the lesson is tied to a specific file pattern, language, or framework, capture it as a skill from the start: pass \`kind: 'skill'\` and a \`scope\` object with at least one of \`filePatterns\`, \`frameworks\`, \`languages\`, or \`taskKeywords\` so it auto-surfaces on matching tasks.\n6. Keep durable project facts in wiki pages instead of chat history.\n7. Append meaningful progress to [docs/wiki/project-log.md](docs/wiki/project-log.md) via \`mcp__dendrite-wiki-mcp__wiki_log\`.\n8. When a session ends with unfinished work, call \`mcp__dendrite-wiki-mcp__memory_handoff\` with a short summary, next steps, and open questions so the next agent session can resume cleanly.\n9. Run the project's validation command before reporting code changes complete.\n\n## Skills Layer\n\nProject-local skill memories are scoped to task patterns (file globs, frameworks, languages, task keywords) and surface automatically when relevant:\n\n- \`wiki_context\` includes top-3 matching skill summaries by default; pass \`maxSkills\`, \`relatedFiles\`, \`languages\`, or \`frameworks\` to refine.\n- \`wiki_skills_list\` runs the matcher standalone with rich scope hints.\n- \`wiki_skill_load(id)\` returns the full skill body and increments its recall count so heavily-used skills rank higher next time.\n- The \`PreToolUse\` hook on \`Edit|Write|MultiEdit\` runs \`dendrite-wiki skills:hook\` and injects matching skill summaries before each file edit. The hook never blocks the edit - silent on errors.\n- Run \`mcp__dendrite-wiki-mcp__memory_review\` periodically; it surfaces \`skill-promotion-ready\` findings (high-recall lessons that look skill-shaped) with an inferred scope. Promote via \`mcp__dendrite-wiki-mcp__memory_promote_skill\` to convert the lesson into a scope-bound skill (the source memory is auto-superseded).\n\nIf this project is opened in Claude Code, the SessionStart hook in \`.claude/settings.json\` re-injects these rules every session so the agent cannot accidentally drift past them.\n`;
}
function buildCopilotInstructions(): string {
  return `# Dendrite Wiki MCP Instructions\n\nThis workspace uses Dendrite Wiki MCP as the project memory and documentation system.\n\n- Start by reading [docs/index.md](../docs/index.md) and asking for a \`wiki_context\` briefing when project context matters. The briefing includes a \`skills\` array (top-3 matching project-local skill memories); call \`wiki_skill_load(id)\` for any skill you want to act on.\n- If \`wiki_context\` returns \`handoffs\`, read those first as the current session-resumption layer.\n- Update or create wiki pages when work changes durable project knowledge.\n- Add source links to files, commands, or user decisions when practical.\n- Append meaningful progress to [docs/wiki/project-log.md](../docs/wiki/project-log.md).\n- When you learn a project-specific gotcha tied to a file pattern, language, or framework, capture it as a skill via \`memory_remember\` with \`kind: 'skill'\` and a \`scope\` object so it auto-surfaces on matching tasks. Otherwise capture as a regular memory; \`memory_review\` will surface it as a \`skill-promotion-ready\` candidate later if it earns it.\n- When ending a session with unfinished work, store a concise \`memory_handoff\` (summary, next steps, open questions) so the next agent picks up where this one stopped.\n- Keep documentation browser-friendly and concise.\n`;
}

function buildVsCodeInstructions(): string {
  return `---\ndescription: "Use when: working in a repository that has Dendrite Wiki MCP installed for project memory, documentation, or agent briefings."\n---\n\nUse Dendrite Wiki MCP as the shared project memory layer. Read [docs/index.md](../../docs/index.md), request a \`wiki_context\` briefing for non-trivial work (it surfaces matching skill memories alongside pages and handoffs — call \`wiki_skill_load(id)\` for the ones you want full content for), read any returned \`handoffs\` first, file durable discoveries back into the wiki or project log, capture project-specific gotchas as skill memories with a \`scope\` object so they auto-surface on matching tasks, and call \`memory_handoff\` at session end when work is unfinished.\n`;
}

function buildVsCodePrompt(): string {
  return `---\ndescription: "Start a Dendrite Wiki MCP session with project status, relevant pages, and documentation follow-up."\n---\n\nStart a project session using Dendrite Wiki MCP.\n\n1. Read [docs/index.md](../../docs/index.md).\n2. Call \`wiki_context\` for the user's current task. The response includes a \`skills\` array; call \`wiki_skill_load(id)\` for each surfaced skill you want full content for.\n3. If the response includes \`handoffs\`, read them first and treat them as the current session-resumption layer.\n4. Summarize current project status, relevant pages, open questions, and likely documentation updates.\n5. Keep product direction under human control; recommend next work only when it follows the documented vision.\n6. When you learn a project-specific gotcha tied to a file pattern or framework, capture it as a skill (\`memory_remember\` with \`kind: 'skill'\` and \`scope\`).\n7. When the session ends with unfinished work, call \`memory_handoff\` with a short summary, next steps, and open questions for the next agent.\n`;
}

function buildCursorRule(): string {
  return `---\ndescription: Dendrite Wiki MCP project memory workflow\nalwaysApply: true\n---\n\nThis repository uses Dendrite Wiki MCP. Read docs/index.md before project decisions, request a wiki_context briefing for non-trivial work and read any returned handoffs first, call wiki_skill_load(id) for any project-local skills surfaced in the briefing, capture project-specific gotchas as skill memories with a scope object so they auto-surface on matching tasks, update wiki pages when durable knowledge changes, append meaningful progress to docs/wiki/project-log.md, and call memory_handoff at session end when work remains unfinished.\n`;
}

// Write the four ritual-enforcement hook scripts to <root>/.claude/hooks/.
// These are the per-client (Claude Code, Codex) blockers that hard-deny
// Edit/Write/MultiEdit/NotebookEdit until wiki_context has been called for
// the current session, and hard-deny Stop until wiki_log was captured. The
// universal MCP-side gate in src/wiki/ritual-state.ts handles dendrite tool
// calls in clients without hook systems; these scripts handle the file-edit
// vector in clients that DO have hooks.
//
// Idempotency: writeIfMissing skips files whose content is unchanged so
// re-running `init` does not churn timestamps.
async function writeRitualHookScripts(root: string, result: DendriteInstallResult): Promise<void> {
  const dir = path.join(root, '.claude', 'hooks');
  await writeIfMissing(path.join(dir, 'lib.mjs'), buildHookLib(), result);
  await writeIfMissing(path.join(dir, 'pre-edit-block.mjs'), buildPreEditBlockHook(), result);
  await writeIfMissing(path.join(dir, 'post-tool-mark.mjs'), buildPostToolMarkHook(), result);
  await writeIfMissing(path.join(dir, 'pre-stop-block.mjs'), buildPreStopBlockHook(), result);
}

// The four hook-script builders below return EXACTLY the contents of the
// `.claude/hooks/*.mjs` files in this repo. The drift test in
// `test/install-hooks.test.ts` asserts they stay byte-for-byte identical, so a
// future edit to the source script must also update the inlined string here.
function buildHookLib(): string {
  return `// Shared state module for Claude Code ritual-enforcement hooks.
//
// Distinct from src/wiki/ritual-state.ts: that one tracks rituals across the MCP
// server process lifetime, which spans many Claude Code sessions. This one is keyed
// by Claude Code's per-chat \`session_id\` (from the hook input JSON) so a fresh
// chat starts fresh — and the PreToolUse blocker fires on the first edit attempt
// until \`wiki_context\` is actually called for the new session.
//
// Storage: \`.claude/claude-code-ritual-state.json\` (gitignored). One record at a
// time keyed by current session_id; older sessions are clobbered on session change.
// That's fine — state has no value after a session ends.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const STATE_FILE = path.join(process.cwd(), '.claude', 'claude-code-ritual-state.json');

export function readHookInput() {
  return new Promise((resolve) => {
    let buf = '';
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { buf += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(buf.trim() ? JSON.parse(buf) : {});
      } catch {
        resolve({});
      }
    });
    // Hard timeout so a misconfigured stdin can't hang Claude Code forever.
    setTimeout(() => resolve(buf.trim() ? safeJsonParse(buf) : {}), 1500).unref?.();
  });
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

export function readState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeState(state) {
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Best-effort; if the FS is read-only we degrade to non-enforcement rather
    // than crashing the hook (which would abort the user's tool call).
  }
}

// Returns the current state for \`sessionId\`, creating a fresh record if the
// stored state belongs to a different (older) session.
export function getOrInitSessionState(sessionId) {
  if (!sessionId) {
    // No session_id means we can't track anything reliably. Return a
    // permissive shape so the blocker degrades to "allow".
    return { sessionId: null, wikiContextCalled: true, _ephemeral: true };
  }
  const existing = readState();
  if (existing && existing.sessionId === sessionId) {
    return existing;
  }
  const fresh = {
    sessionId,
    startedAt: new Date().toISOString(),
    wikiContextCalled: false,
    wikiContextCalledAt: null,
    editCount: 0,
    bashCount: 0,
    lastWikiLogAt: null,
    lastMemoryRememberAt: null,
    memoryHandoffCalled: false
  };
  writeState(fresh);
  return fresh;
}

// Output a PreToolUse "deny" decision so Claude Code refuses the tool call.
// \`reason\` is shown back to the agent and is the only signal it has — make it
// actionable: name the exact tool to call.
export function denyPreToolUse(reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Output a Stop hook "block" so Claude Code refuses to end the turn until the
// agent does the prompted ritual.
export function blockStop(reason) {
  const out = { decision: 'block', reason };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Allow path: just exit 0 with no output.
export function allow() {
  process.exit(0);
}
`;
}

function buildPreEditBlockHook(): string {
  return `#!/usr/bin/env node
// PreToolUse hook on Edit|Write|MultiEdit|NotebookEdit.
//
// Hard-blocks the edit unless \`mcp__dendrite-wiki-mcp__wiki_context\` has been
// called for the current Claude Code session. The existing \`skills:hook\` is
// non-blocking by design (surfaces matching skills); this one closes the
// behavioral gap where the agent can ignore the SessionStart "MUST" guidance.

import { readHookInput, getOrInitSessionState, denyPreToolUse, allow } from './lib.mjs';

const input = await readHookInput();
const sessionId = input.session_id;
const state = getOrInitSessionState(sessionId);

if (state.wikiContextCalled) {
  allow();
}

denyPreToolUse(
  [
    'Ritual gate: you cannot Edit/Write/MultiEdit yet because you have not called mcp__dendrite-wiki-mcp__wiki_context for this session.',
    '',
    'Call it now with the user task as the query, e.g.:',
    '  mcp__dendrite-wiki-mcp__wiki_context({ query: "<one-line task summary>", maxPages: 3, maxSkills: 3 })',
    '',
    'If the result is too large, the tool returns a saved-file path — read it in chunks with offset/limit. Do not skip this; the briefing surfaces handoffs from prior sessions, ranked memories, relevant pages, and matching skills you would otherwise miss.',
    '',
    'After wiki_context returns, retry the edit.'
  ].join('\\n')
);
`;
}

function buildPostToolMarkHook(): string {
  return `#!/usr/bin/env node
// PostToolUse hook for the dendrite ritual tools and for edit-class tools.
//
// Updates \`.claude/claude-code-ritual-state.json\` based on which tool just ran:
//   - mcp__dendrite-wiki-mcp__wiki_context  → wikiContextCalled = true
//   - mcp__dendrite-wiki-mcp__wiki_log      → lastWikiLogAt = now
//   - mcp__dendrite-wiki-mcp__memory_remember → lastMemoryRememberAt = now
//   - mcp__dendrite-wiki-mcp__memory_handoff  → memoryHandoffCalled = true
//   - Edit | Write | MultiEdit | NotebookEdit → editCount += 1
//   - Bash                                    → bashCount += 1 (informational)
//
// For wiki_context specifically we ONLY mark called when the response is not
// an error. The "result too large" error returns a saved-file path the agent
// must then read; if we marked called on error, the gate would open before
// the agent actually got the briefing — a silent bypass.

import { readHookInput, getOrInitSessionState, writeState, allow } from './lib.mjs';

function toolResponseIsError(response) {
  if (!response || typeof response !== 'object') return false;
  if (response.is_error === true) return true;
  if (typeof response.error === 'string' && response.error.length > 0) return true;
  if (response.error && typeof response.error === 'object') return true;
  // MCP content-blocks with leading "Error:" text are also a clear failure signal.
  if (Array.isArray(response.content)) {
    for (const block of response.content) {
      if (block && block.type === 'text' && typeof block.text === 'string' && /^Error:/i.test(block.text.trim())) {
        return true;
      }
    }
  }
  return false;
}

const input = await readHookInput();
const sessionId = input.session_id;
const tool = input.tool_name ?? '';
const responseIsError = toolResponseIsError(input.tool_response);

if (!sessionId) allow();

const state = getOrInitSessionState(sessionId);
const now = new Date().toISOString();

switch (tool) {
  case 'mcp__dendrite-wiki-mcp__wiki_context':
    if (!responseIsError) {
      state.wikiContextCalled = true;
      state.wikiContextCalledAt = now;
    }
    // On error, leave wikiContextCalled as-is so the next Edit still gets
    // blocked and the agent is forced to retry / read the saved briefing file.
    break;
  case 'mcp__dendrite-wiki-mcp__wiki_log':
    state.lastWikiLogAt = now;
    break;
  case 'mcp__dendrite-wiki-mcp__memory_remember':
    state.lastMemoryRememberAt = now;
    break;
  case 'mcp__dendrite-wiki-mcp__memory_handoff':
    state.memoryHandoffCalled = true;
    break;
  case 'Edit':
  case 'Write':
  case 'MultiEdit':
  case 'NotebookEdit':
    state.editCount = (state.editCount ?? 0) + 1;
    break;
  case 'Bash':
    state.bashCount = (state.bashCount ?? 0) + 1;
    break;
  default:
    // Unmatched tool — no state change.
    break;
}

writeState(state);
allow();
`;
}

function buildPreStopBlockHook(): string {
  return `#!/usr/bin/env node
// Stop hook: blocks the assistant's "I'm done" turn-end if the session made
// substantive changes (edits, writes, bash actions) but did not capture the
// project log entry and (for plausibly unfinished work) a session handoff.
//
// Why a Stop blocker rather than just a reminder: the SessionStart guidance
// already says "MUST" but the agent has demonstrated it will drop the rituals
// once the immediate task feels concrete. The Stop hook is the last guardrail
// — by the time the agent tries to wrap up, this is the moment when wiki_log
// and memory_handoff would have the most context anyway.
//
// Idempotency: if \`stop_hook_active\` is true, Claude Code is already in a stop
// loop — exit clean to avoid an infinite block-loop.

import { readHookInput, getOrInitSessionState, blockStop, allow } from './lib.mjs';

const HANDOFF_REQUIRED_EDITS = 3; // below this we treat it as a small enough session that a handoff is optional
const MEMORY_REMEMBER_REQUIRED_EDITS = 1; // any edit deserves at least one durable lesson — closes the drift asymmetry vs wiki_log

const input = await readHookInput();

if (input.stop_hook_active === true) allow();

const sessionId = input.session_id;
if (!sessionId) allow();

const state = getOrInitSessionState(sessionId);
const edits = state.editCount ?? 0;
const wroteLog = !!state.lastWikiLogAt;
const wroteMemory = !!state.lastMemoryRememberAt;
const handoff = !!state.memoryHandoffCalled;

if (edits === 0) allow();

const missing = [];
if (!wroteLog) missing.push('wiki_log');
if (edits >= MEMORY_REMEMBER_REQUIRED_EDITS && !wroteMemory) missing.push('memory_remember');
if (edits >= HANDOFF_REQUIRED_EDITS && !handoff) missing.push('memory_handoff');

if (missing.length === 0) allow();

const reasonLines = [
  \`Ritual gate: this session made \${edits} edit\${edits === 1 ? '' : 's'} but is missing \${missing.join(' + ')}.\`,
  ''
];
if (!wroteLog) {
  reasonLines.push(
    'Call mcp__dendrite-wiki-mcp__wiki_log with a one-paragraph entry describing what changed and why. This is what makes the project self-documenting across sessions.'
  );
}
if (edits >= MEMORY_REMEMBER_REQUIRED_EDITS && !wroteMemory) {
  reasonLines.push(
    'Call mcp__dendrite-wiki-mcp__memory_remember at least once with a durable lesson, warning, or fact captured during this session. Lessons should explain the WHY (use "because", "since", "due to" — kind: "lesson"); warnings should describe what to avoid next time (kind: "warning"); facts should be source-backed (kind: "fact"). Without this call the session ends without depositing any durable signal and the memory layer silently loses ground.'
  );
}
if (edits >= HANDOFF_REQUIRED_EDITS && !handoff) {
  reasonLines.push(
    'Call mcp__dendrite-wiki-mcp__memory_handoff with a summary, next steps, and open questions so the next session resumes cleanly.'
  );
}
reasonLines.push('');
reasonLines.push('After these calls succeed you may end the turn.');

blockStop(reasonLines.join('\\n'));
`;
}

function buildClaudeSettings(): string {
  return `${JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/claude-code-settings.json',
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: "node -e \"console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:'You are working in a project that uses dendrite-wiki-mcp. Before any non-trivial task you MUST: (1) call the MCP tool mcp__dendrite-wiki-mcp__wiki_context with the user task, (2) if it returns handoffs, read those first as the current session-resumption layer, (3) read the top-ranked pages it surfaces, (4) call mcp__dendrite-wiki-mcp__wiki_skill_load(id) for each skill summary in the briefing you want full content for. During work, write durable lessons via mcp__dendrite-wiki-mcp__memory_remember (use kind=\\\"skill\\\" with a scope object when the lesson is tied to a file pattern, language, or framework) and append meaningful changes to the project log via mcp__dendrite-wiki-mcp__wiki_log. Do NOT run dendrite-wiki benchmark:snapshot, npm run wiki:refresh, or dendrite-wiki docs:api as a session-start ritual; they mutate generated artifacts and should run only when the operator asks for a benchmark, generated-doc refresh, release check, or publish-prep validation. At session end with unfinished work, also call mcp__dendrite-wiki-mcp__memory_handoff. These rituals are not optional in this project \\u2014 they are how the project keeps itself documented. NOTE: this project enforces these rituals at the hook layer \\u2014 your first Edit/Write/MultiEdit will be denied until wiki_context has been called for this session, and Stop will be denied until BOTH wiki_log AND memory_remember have been called at least once per session that made edits (plus memory_handoff for sessions with 3+ edits).'}}))\""
              }
            ]
          }
        ],
        PostToolUse: [
          {
            matcher: 'mcp__dendrite-wiki-mcp__wiki_context',
            hooks: [
              {
                type: 'command',
                command: "node -e \"console.log(JSON.stringify({hookSpecificOutput:{additionalContext:'wiki_context just loaded. Two ritual follow-ups during this work: (1) when you discover a non-obvious lesson, pitfall, or design constraint, IMMEDIATELY call mcp__dendrite-wiki-mcp__memory_remember \\u2014 treat it as having the same importance as git commit. (2) After each meaningful pass of work, append to the project log via mcp__dendrite-wiki-mcp__wiki_log. Do not batch these at the end of the session; capture them as they happen.'}}))\""
              }
            ]
          },
          {
            // Auto-capture raw observations for the C1 feeder stream. Reads the full
            // PostToolUse payload from stdin (session_id, tool_name, tool_input,
            // tool_response) and appends one record to local-data/raw-observations.jsonl.
            // Strictly separate from the curated memory store; cluster-based promotion
            // into curated memory ships in C1 slice 2. Hook failures never block.
            matcher: 'Edit|Write|MultiEdit|Bash',
            hooks: [
              {
                type: 'command',
                command: 'npx -y dendrite-wiki observations:capture'
              }
            ]
          },
          {
            // Tracks ritual state for the PreToolUse blocker and Stop hook.
            // Marks wikiContextCalled (only on success — error responses are skipped
            // so the "result too large" path does not silently bypass the gate),
            // records lastWikiLogAt / memoryHandoffCalled, and counts edits.
            matcher:
              'mcp__dendrite-wiki-mcp__wiki_context|mcp__dendrite-wiki-mcp__wiki_log|mcp__dendrite-wiki-mcp__memory_remember|mcp__dendrite-wiki-mcp__memory_handoff|Edit|Write|MultiEdit|NotebookEdit|Bash',
            hooks: [
              {
                type: 'command',
                command: 'node ./.claude/hooks/post-tool-mark.mjs'
              }
            ]
          }
        ],
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: "node -e \"let b='';process.stdin.on('data',d=>b+=d).on('end',()=>{try{const j=JSON.parse(b||'{}');if(j.source==='compact')console.log(JSON.stringify({hookSpecificOutput:{additionalContext:'Context was just compacted. Re-anchor on dendrite-wiki rituals: call mcp__dendrite-wiki-mcp__wiki_context if you have not done so for the current task, capture non-obvious lessons via mcp__dendrite-wiki-mcp__memory_remember as you discover them, append meaningful changes to the project log via mcp__dendrite-wiki-mcp__wiki_log, and call mcp__dendrite-wiki-mcp__memory_handoff at session end if work remains unfinished.'}}))}catch{}})\""
              },
              {
                type: 'command',
                command: 'npx -y dendrite-wiki ritual:hook'
              }
            ]
          }
        ],
        PreToolUse: [
          {
            // Two hooks, run in order:
            // 1. pre-edit-block.mjs hard-denies the edit if mcp__dendrite-wiki-mcp__wiki_context has
            //    not been called for the current Claude Code session_id. The blocker keys off the
            //    per-chat session_id from hook input, so a fresh chat starts fresh.
            // 2. skills:hook (existing) surfaces matching project-local skills as additionalContext.
            //    Per design: skills:hook NEVER blocks; if the blocker above allowed the call,
            //    skills:hook just augments context.
            matcher: 'Edit|Write|MultiEdit|NotebookEdit',
            hooks: [
              {
                type: 'command',
                command: 'node ./.claude/hooks/pre-edit-block.mjs'
              },
              {
                type: 'command',
                command: 'npx -y dendrite-wiki skills:hook'
              }
            ]
          }
        ],
        Stop: [
          {
            // Hard-denies the assistant's turn-end if the session made edits but did not
            // call mcp__dendrite-wiki-mcp__wiki_log (and, above 3 edits, also did not call
            // memory_handoff). Honors stop_hook_active to avoid infinite loops.
            hooks: [
              {
                type: 'command',
                command: 'node ./.claude/hooks/pre-stop-block.mjs'
              }
            ]
          }
        ]
      }
    },
    null,
    2
  )}\n`;
}

function buildCopilotAgent(): string {
  // GitHub Copilot in VS Code (preview): custom agents live at .github/agents/<name>.agent.md
  // with YAML frontmatter that supports a `hooks:` block, gated behind the
  // `chat.useCustomAgentHooks` setting. The user must select this agent for the
  // hooks to fire — Default Agent mode does not honor agent-scoped hooks.
  // The hook command output format mirrors Claude Code's, so we reuse ritual:hook.
  return `---
name: dendrite
description: "Use this agent for any non-trivial task in a project that uses Dendrite Wiki MCP. Loads the wiki briefing first, captures durable lessons during work, files a session handoff at the end."
tools:
  - "dendrite-wiki-mcp/*"
hooks:
  sessionStart:
    - command: "node -e \\"console.log(JSON.stringify({hookSpecificOutput:{additionalContext:'You are working in a project that uses dendrite-wiki-mcp. Before any non-trivial task you MUST: (1) call the MCP tool mcp__dendrite-wiki-mcp__wiki_context with the user task, (2) if it returns handoffs, read those first as the current session-resumption layer, (3) read the top-ranked pages it surfaces, (4) call mcp__dendrite-wiki-mcp__wiki_skill_load(id) for each skill summary in the briefing you want full content for. During work, write durable lessons via mcp__dendrite-wiki-mcp__memory_remember (use kind=\\"skill\\" with a scope object when the lesson is tied to a file pattern, language, or framework) and append meaningful changes to the project log via mcp__dendrite-wiki-mcp__wiki_log. At session end with unfinished work, call mcp__dendrite-wiki-mcp__memory_handoff.'}}))\\""
  userPromptSubmitted:
    - command: "npx -y dendrite-wiki ritual:hook"
  preToolUse:
    # Hard-deny attempt — Copilot's hook output format is presumed to mirror Claude
    # Code's hookSpecificOutput.permissionDecision='deny' shape. If Copilot ignores
    # it, this script is harmless (the additionalContext is still injected). If
    # Copilot honors it, the agent is forced to call wiki_context first.
    - matcher: "Edit|Write|MultiEdit|NotebookEdit"
      command: "node ./.claude/hooks/pre-edit-block.mjs"
    - matcher: "Edit|Write|MultiEdit"
      command: "npx -y dendrite-wiki skills:hook"
  postToolUse:
    - matcher: "mcp__dendrite-wiki-mcp__wiki_context"
      command: "node -e \\"console.log(JSON.stringify({hookSpecificOutput:{additionalContext:'wiki_context just loaded. Capture non-obvious lessons via mcp__dendrite-wiki-mcp__memory_remember as you discover them, and append meaningful changes via mcp__dendrite-wiki-mcp__wiki_log per pass — not batched at session end.'}}))\\""
    - matcher: "mcp__dendrite-wiki-mcp__wiki_context|mcp__dendrite-wiki-mcp__wiki_log|mcp__dendrite-wiki-mcp__memory_remember|mcp__dendrite-wiki-mcp__memory_handoff|Edit|Write|MultiEdit|NotebookEdit|Bash"
      command: "node ./.claude/hooks/post-tool-mark.mjs"
---

# Dendrite Agent

This is a Copilot custom agent for projects that use [Dendrite Wiki MCP](https://github.com/mfillalan/dendrite-wiki-mcp).

## When to use this agent

Select this agent in the VS Code Chat panel before any non-trivial coding task. It enforces the Dendrite ritual layer:

1. \`wiki_context\` is called first to load the project briefing (which surfaces matching skill memories alongside pages).
2. \`memory_remember\` captures lessons as they happen, not at session end. Skill-shaped lessons get \`kind: 'skill'\` + \`scope\` so they auto-surface on matching tasks.
3. \`wiki_log\` records meaningful changes to the project log.
4. \`memory_handoff\` files a session continuation note when work remains unfinished.

## Setup

This file relies on the preview \`chat.useCustomAgentHooks\` setting. To enable:

1. Open VS Code Settings (\`Cmd/Ctrl + ,\`).
2. Search for \`chat.useCustomAgentHooks\`.
3. Toggle it on.
4. Restart VS Code.
5. Open the Chat panel and select the \`dendrite\` agent from the agent picker.

If you stay in the default Agent mode, agent-scoped hooks do not fire and the universal MCP-side ritual checkpoint footer (which works in every client) is your only enforcement layer.

## What this agent does differently

The \`hooks:\` frontmatter above wires four lifecycle events:

- **sessionStart** — injects the full ritual contract once at session begin.
- **userPromptSubmitted** — runs \`dendrite-wiki ritual:hook\` on every user message, which reads the persisted ritual state and re-injects reminders if gaps exist.
- **preToolUse on Edit|Write|MultiEdit** — runs \`dendrite-wiki skills:hook\` to surface project-local skill memories matching the file being edited. Never blocks the edit.
- **postToolUse on wiki_context** — fires the per-pass capture nudge right after orientation loads, when the agent is most receptive.

This mirrors the Claude Code hook stack in \`.claude/settings.json\` and the Codex hook stack in \`.codex/hooks.json\`.
`;
}

function buildCursorHooks(): string {
  // Cursor's hook system supports six events but only beforeMCPExecution and
  // beforeShellExecution can return actionable JSON (permission/userMessage/agentMessage).
  // beforeSubmitPrompt cannot inject prompts, so we use beforeMCPExecution as the hook
  // point that fires before any MCP tool call across any server. The dendrite-wiki
  // ritual:cursor-hook subcommand outputs Cursor-shaped JSON with agentMessage when
  // ritual gaps exist; otherwise it stays silent and the call proceeds normally.
  return `${JSON.stringify(
    {
      version: 1,
      hooks: {
        beforeMCPExecution: [
          {
            command: 'npx -y dendrite-wiki ritual:cursor-hook'
          }
        ]
      }
    },
    null,
    2
  )}\n`;
}

function buildCodexHooks(): string {
  return `${JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: "node -e \"console.log(JSON.stringify({hookSpecificOutput:{additionalContext:'You are working in a project that uses dendrite-wiki-mcp. Before any non-trivial task you MUST: (1) call the MCP tool mcp__dendrite-wiki-mcp__wiki_context with the user task, (2) if it returns handoffs, read those first as the current session-resumption layer, (3) read the top-ranked pages it surfaces, (4) call mcp__dendrite-wiki-mcp__wiki_skill_load(id) for each skill summary in the briefing you want full content for. During work, write durable lessons via mcp__dendrite-wiki-mcp__memory_remember (use kind=\\\"skill\\\" with a scope object when the lesson is tied to a file pattern, language, or framework) and append meaningful changes to the project log via mcp__dendrite-wiki-mcp__wiki_log. At session end with unfinished work, call mcp__dendrite-wiki-mcp__memory_handoff. These rituals are not optional in this project \\u2014 they are how the project keeps itself documented.'}}))\""
              }
            ]
          }
        ],
        PreToolUse: [
          {
            // Two hooks, run in order:
            // 1. pre-edit-block.mjs hard-denies the edit unless wiki_context has been called
            //    for the current Codex session_id. Codex hook input shape matches Claude Code's,
            //    so the same script works for both clients.
            // 2. skills:hook surfaces matching project-local skills as additionalContext.
            matcher: 'Edit|Write|MultiEdit|NotebookEdit',
            hooks: [
              {
                type: 'command',
                command: 'node ./.claude/hooks/pre-edit-block.mjs'
              },
              {
                type: 'command',
                command: 'npx -y dendrite-wiki skills:hook'
              }
            ]
          }
        ],
        Stop: [
          {
            // Hard-denies turn-end if the session made edits without wiki_log
            // (and, above 3 edits, without memory_handoff).
            hooks: [
              {
                type: 'command',
                command: 'node ./.claude/hooks/pre-stop-block.mjs'
              }
            ]
          }
        ],
        PostToolUse: [
          {
            matcher: 'mcp__dendrite-wiki-mcp__wiki_context',
            hooks: [
              {
                type: 'command',
                command: "node -e \"console.log(JSON.stringify({hookSpecificOutput:{additionalContext:'wiki_context just loaded. Two ritual follow-ups during this work: (1) when you discover a non-obvious lesson, pitfall, or design constraint, IMMEDIATELY call mcp__dendrite-wiki-mcp__memory_remember \\u2014 treat it as having the same importance as git commit. If the lesson is tied to a file pattern, language, or framework, capture it as a skill (kind=\\\"skill\\\" with a scope object) so it auto-surfaces on matching tasks. (2) After each meaningful pass of work, append to the project log via mcp__dendrite-wiki-mcp__wiki_log. Do not batch these at the end of the session; capture them as they happen.'}}))\""
              }
            ]
          },
          {
            // C1: auto-capture raw observations into local-data/raw-observations.jsonl.
            // Strictly separate from curated memory; cluster-based promotion ships in slice 2.
            // Hook failures never block — observations:capture exits 0 on any error.
            matcher: 'Edit|Write|MultiEdit|Bash',
            hooks: [
              {
                type: 'command',
                command: 'npx -y dendrite-wiki observations:capture'
              }
            ]
          },
          {
            // Tracks ritual state for the PreToolUse blocker and Stop hook.
            matcher:
              'mcp__dendrite-wiki-mcp__wiki_context|mcp__dendrite-wiki-mcp__wiki_log|mcp__dendrite-wiki-mcp__memory_remember|mcp__dendrite-wiki-mcp__memory_handoff|Edit|Write|MultiEdit|NotebookEdit|Bash',
            hooks: [
              {
                type: 'command',
                command: 'node ./.claude/hooks/post-tool-mark.mjs'
              }
            ]
          }
        ],
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: 'npx -y dendrite-wiki ritual:hook'
              }
            ]
          }
        ]
      }
    },
    null,
    2
  )}\n`;
}

function buildClaudeCommand(): string {
  return `Start a Dendrite Wiki MCP project session.\n\n1. Read docs/index.md.\n2. Use the dendrite-wiki-mcp MCP tools to request a wiki_context briefing for the current task. The response includes a skills array (top-3 matching project-local skill memories); call wiki_skill_load(id) for each one you want full content for.\n3. If the response includes handoffs, read them first as the current session-resumption layer.\n4. Identify relevant pages and open questions, then proceed with project work while updating durable wiki knowledge and docs/wiki/project-log.md.\n5. When you learn a project-specific gotcha tied to a file pattern, language, or framework, capture it as a skill via memory_remember with kind='skill' and a scope object so it auto-surfaces on matching tasks. The PreToolUse hook on Edit/Write fires dendrite-wiki skills:hook automatically and injects matching skills before each file edit.\n6. When the session ends with unfinished work, call memory_handoff with a short summary, next steps, and open questions.\n`;
}

function buildAgentSkill(): string {
  return `---\nname: dendrite-wiki\ndescription: "Use when: starting or continuing work in a project that uses Dendrite Wiki MCP, especially when you need project status, persistent memory, documentation updates, or operator-requested benchmark snapshots."\n---\n\n# Dendrite Wiki\n\nUse this workflow when a project has Dendrite Wiki MCP installed.\n\n1. Read docs/index.md.\n2. Always call wiki_context for the current task before acting; treat returned handoffs as the current session-resumption layer and read them first. The briefing includes a skills array (top-3 by default); call wiki_skill_load(id) for each surfaced skill you want full content for.\n3. Use wiki_search or wiki_read for relevant pages.\n4. Update wiki pages via wiki_log and capture non-obvious lessons via memory_remember as they happen, not at the end. If the lesson is tied to a file pattern, language, or framework, mark it as a skill from the start: pass kind='skill' and a scope object with at least one of filePatterns, frameworks, languages, or taskKeywords. Otherwise capture as a regular memory; memory_review will surface skill-promotion-ready candidates with an inferred scope, and memory_promote_skill converts them to scope-bound skills.\n5. The PreToolUse hook on Edit/Write/MultiEdit runs dendrite-wiki skills:hook automatically and injects matching skill summaries before each file edit. Read the system reminder and call wiki_skill_load(id) for any skill that looks load-worthy.\n6. Do not run wiki:refresh, docs:api, or benchmark:snapshot as a session-start ritual. Those commands mutate generated artifacts and should run only when the operator asks for a benchmark, generated-doc refresh, release check, or publish-prep validation.\n7. When the session ends with unfinished work, call memory_handoff with a short summary, next steps, and open questions so the next agent can resume cleanly.\n`;
}
function buildSessionHandoffHookManifest(): string {
  return `${JSON.stringify(
    {
      name: 'dendrite-wiki-session-handoff',
      description: 'Optional prompt manifest for agents that support session-end hooks. When work remains unfinished, the agent should call the dendrite-wiki-mcp `memory_handoff` MCP tool with a short summary, next steps, and open questions so the next session resumes from `wiki_context.handoffs` instead of scraping chat history.',
      event: 'session-end',
      kind: 'agent-prompt',
      tool: 'memory_handoff',
      prompt: 'If this session ended with unfinished work, call the dendrite-wiki-mcp `memory_handoff` MCP tool with a one-paragraph summary, the next concrete step, and any open questions. Skip this hook only when the session reached a clean stopping point with no follow-up.'
    },
    null,
    2
  )}\n`;
}

function buildSkillsHookManifest(): string {
  return `${JSON.stringify(
    {
      name: 'dendrite-wiki-skills',
      description: 'Optional hook manifest for agents that support PreToolUse hooks on Edit/Write/MultiEdit. Reads the tool input JSON from stdin (Claude Code passes { tool_input: { file_path, ... } }) and outputs hookSpecificOutput.additionalContext with project-local skill summaries that match the file being edited. Hook failures NEVER block the Edit/Write — skills:hook exits 0 on any error so the file edit proceeds normally.',
      event: 'pre-tool-use',
      matcher: 'Edit|Write|MultiEdit',
      command: 'dendrite-wiki',
      args: ['skills:hook']
    },
    null,
    2
  )}\n`;
}

function buildObservationsHookManifest(): string {
  return `${JSON.stringify(
    {
      name: 'dendrite-wiki-observations',
      description:
        'Optional hook manifest for agents that support PostToolUse hooks. Appends one raw observation per matched tool call to local-data/raw-observations.jsonl. Strictly separated from the curated memory store: observations feed the maintenance inbox as cluster-based promotion candidates (slice 2) but never enter wiki_context recall directly. Hook failures NEVER block the agent — observations:capture exits 0 on any error. Opt out per-session with DENDRITE_RAW_OBSERVATIONS=off.',
      event: 'post-tool-use',
      matcher: 'Edit|Write|MultiEdit|Bash',
      command: 'dendrite-wiki',
      args: ['observations:capture']
    },
    null,
    2
  )}\n`;
}

function buildSessionStartHookManifest(): string {
  return `${JSON.stringify(
    {
      name: 'dendrite-wiki-session-start',
      description: 'Optional prompt manifest for agents that support session-start hooks. At the beginning of each session, the agent should call the dendrite-wiki-mcp `wiki_context` MCP tool for the user task and read any returned `handoffs` first as the current session-resumption layer.',
      event: 'session-start',
      kind: 'agent-prompt',
      tool: 'wiki_context',
      prompt: 'Before acting, call the dendrite-wiki-mcp `wiki_context` MCP tool with the user task. If the response includes `handoffs`, read those first and treat them as the current session-resumption layer.'
    },
    null,
    2
  )}\n`;
}

function buildBenchmarkLog(): string {
  return `# Benchmark Log\n\nThis page records Dendrite Wiki MCP benchmark snapshots for this project.\n\nRun \`dendrite-wiki benchmark:snapshot\` after meaningful work sessions to capture whether the wiki is becoming easier for agents and humans to use over time.\n\n## Snapshots\n\n| Timestamp | Label | Pages | Claims | Lint Findings | Proposals | Context Pages | Git Commit |\n|---|---|---:|---:|---:|---:|---:|---|\n`;
}

function buildSeedBenchmarkReport(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: generated\n---\n\n# Benchmark Report\n\nThis page is the local visual benchmark view for the project. It reads the generated history artifact after you run \`dendrite-wiki benchmark:snapshot\`.\n\n## How To Use It\n\n1. When the operator wants a benchmarked comparison, capture a baseline snapshot before the change.\n2. Capture another snapshot after the work, wiki updates, and validation are done.\n3. Open this page to compare the trend and read the plain-language summary.\n\n## Local-Only Contract\n\n- Reads \`docs/public/dendrite-benchmark-history.json\`.\n- Compares the earliest snapshot to the latest snapshot.\n- Stays useful even if telemetry is never enabled.\n\n<BenchmarkReport />\n`;
}

 function buildSeedIndex(): string {
  return `# Project Wiki

This is the project index. Agents and humans should read this page first.

Dendrite Wiki MCP turns project memory into a maintained set of markdown pages. Start here, then move into the pages that explain the project plan, architecture, workflows, and current maintenance state.

## First Session Checklist

1. Replace the placeholder sections in [Project Plan](./project-plan.md) with the real goal, milestone, and open questions for this project.
2. Fill in [Architecture](./wiki/architecture.md) with the important modules, boundaries, and code references.
3. Confirm [Operator Workflow](./wiki/operator-workflow.md) matches how this team wants to review documentation and maintenance work.
4. Ask the agent to request a \`wiki_context\` briefing before non-trivial work.
5. Capture a baseline snapshot after the first meaningful session.

## Core Pages

| Page | Purpose |
|---|---|
| [Project Plan](./project-plan.md) | Goals, milestones, priorities, and current decisions. |
| [Architecture](./wiki/architecture.md) | System boundaries, important modules, and proof links. |
| [Living Wiki Model](./wiki/living-wiki-model.md) | How pages, sources, claims, and backlinks should work. |
| [Agent Workflow](./wiki/agent-workflow.md) | What the coding agent should do before, during, and after work. |
| [Operator Workflow](./wiki/operator-workflow.md) | What the human operator reviews and maintains each day. |
| [Maintenance Inbox](./wiki/maintenance-inbox.md) | Current deterministic maintenance queue. |
| [Maintenance Review](./wiki/maintenance-review.md) | How maintenance actions are reviewed and applied. |
| [Proposal Workflow](./wiki/proposal-workflow.md) | How proposals move from suggestion to accepted cleanup. |
| [Benchmark Report](./wiki/benchmark-report.md) | Local visual benchmark summary for baseline versus latest progress. |
| [Benchmarking](./wiki/benchmarking.md) | How to measure whether the wiki is becoming easier to use. |
| [Telemetry Status](./wiki/telemetry-status.md) | Local consent state, event visibility, and future sharing posture. |
| [MCP Server Installation](./wiki/mcp-installation.md) | How this project connects agents to Dendrite Wiki MCP. |
| [Project Log](./wiki/project-log.md) | Chronological log of meaningful changes. |

## Working Thesis

A coding agent should not rediscover project knowledge on every prompt. It should orient from a small index, read relevant canonical pages, update those pages when work changes the truth, and file valuable answers back into the wiki.

## How To Use This Seed

Treat the seeded pages as starter contracts, not final truth. They are intentionally structured so the first real work session can replace placeholders with project-specific facts while keeping the same review and maintenance flow.

## Generated Catalog

<!-- WIKI_CATALOG_START -->

| Page | Slug |
|---|---|
| [Agent Workflow](./wiki/agent-workflow.md) | \`agent-workflow\` |
| [Architecture](./wiki/architecture.md) | \`architecture\` |
| [Benchmark Log](./wiki/benchmark-log.md) | \`benchmark-log\` |
| [Benchmark Report](./wiki/benchmark-report.md) | \`benchmark-report\` |
| [Benchmarking](./wiki/benchmarking.md) | \`benchmarking\` |
| [Living Wiki Model](./wiki/living-wiki-model.md) | \`living-wiki-model\` |
| [Maintenance Inbox](./wiki/maintenance-inbox.md) | \`maintenance-inbox\` |
| [Maintenance Review](./wiki/maintenance-review.md) | \`maintenance-review\` |
| [MCP Server Installation](./wiki/mcp-installation.md) | \`mcp-installation\` |
| [Operator Workflow](./wiki/operator-workflow.md) | \`operator-workflow\` |
| [Project Log](./wiki/project-log.md) | \`project-log\` |
| [Proposal Workflow](./wiki/proposal-workflow.md) | \`proposal-workflow\` |
| [Telemetry Status](./wiki/telemetry-status.md) | \`telemetry-status\` |

<!-- WIKI_CATALOG_END -->
`;
 }

function buildSeedProjectPlan(): string {
  return `# Project Plan

This page records the current project goals, delivery plan, and open questions. Replace the placeholder text in the first session so this page becomes the canonical summary of what the project is trying to achieve.

## Current Goal

Write one short paragraph that explains the user-facing outcome this project is trying to deliver and how success will be judged.

**Example (copy and adapt for a typical small TypeScript tool):**

> Give AI coding agents and their human operators a durable, browser-viewable, git-diffable living wiki + project-local memory store so the agent stops re-deriving the same architecture facts and the human can steer the product from real evidence. Success is measured by (1) first-try accuracy on recurring tasks improving over time (see Benchmark Report) and (2) the wiki remaining the single source of truth even after the agent is uninstalled.

## Current Milestone

- Name: _Replace with the current milestone name_
- Exit criteria: _Replace with the concrete bar for completion_
- Target date: _Optional_
- Owner: _Optional_

**Example:**

- Name: First-Session Accelerator
- Exit criteria: After dendrite-wiki init on a fresh repo, the agent's first real task produces 3+ real wiki pages with source-backed claims + 2+ scoped skills + a clean project-log entry. The bootstrap protocol block no longer appears on the second wiki_context call.
- Source: [Project Bootstrap Protocol in wiki_context]

## Active Workstreams

- [ ] Workstream 1: _Replace with the most important active stream_
- [ ] Workstream 2: _Replace with the second active stream_
- [ ] Workstream 3: _Remove if not needed_

## Recent Decisions

- Decision: _Replace with the most recent important product or architecture decision_
  Source: _Link to the relevant page, file, command, or decision note_

**Example:**

- Decision: The universal MCP-side ritual injection (every tool response) is the foundation; per-client hooks are hardening only.
  Source: file:src/server.ts, file:packages/memory/src/ritual-state.ts, [Agent Enforcement Architecture](./wiki/agent-enforcement-architecture.md)

## Open Questions

- Which workflows must stay under human review?
- Which pages should become canonical sources for the team?
- What does success look like for the next release?

## Update Rule

Update this page whenever project direction, milestone scope, or the definition of done changes. It should stay short enough that a new agent or teammate can read it first and understand what matters right now.
`;
}

function buildSeedAgentWorkflow(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Agent Workflow

Agents should treat the wiki as the first place to orient and the last place to file durable knowledge.

## Before Work

1. Read [docs/index.md](../index.md).
2. Ask Dendrite Wiki MCP for a \`wiki_context\` briefing when the task needs project context.
3. If \`wiki_context\` returns \`handoffs\`, read those first and treat them as the current session-resumption layer.
4. Read the pages most relevant to the task before making project decisions.
5. If the task changes project direction, also read [Project Plan](../project-plan.md) and [Architecture](./architecture.md).

## During Work

- Keep code changes focused.
- Use \`memory_handoff\` when you need to leave a structured continuation note for the next agent session.
- Update or create wiki pages when durable project knowledge changes.
- Add sources to commands, files, or user decisions when practical.
- Prefer linking to canonical pages instead of duplicating facts.
- If maintenance findings appear, route through [Proposal Workflow](./proposal-workflow.md) instead of improvising a separate review process.

## After Work

- Update affected pages.
- If work remains unfinished, store a concise \`memory_handoff\` entry with summary, next steps, and open questions so the next session can resume from \`wiki_context.handoffs\`.
- Append a short entry to [Project Log](./project-log.md).
- Run the project validation command before reporting code changes complete.
- Capture a benchmark snapshot after meaningful sessions if you are measuring orientation quality over time.

## Session Handoff Rule

Use \`memory_handoff\` for continuation state that the next agent session should see in \`wiki_context\` without scraping chat history.

Good handoff contents:

- the current implementation slice
- the next concrete step
- unresolved questions or risks
- the page or file the next agent should read first

Avoid using handoffs for long-term canonical facts. Promote those into wiki pages or normal project-local memories instead.

## Promotion Rule

If the answer required stitching together three or more facts, it probably deserves a page or a section in an existing page.
`;
}

function buildSeedArchitecture(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Architecture

This page explains the current system boundaries and the parts of the codebase that matter most. Replace the placeholders with the real repository map and the proof links that a new agent or reviewer should trust.

## System Map

| Surface | Purpose | Proof |
|---|---|---|
| _Replace with the main app or service_ | _What it does_ | _Link to file or page_ |
| _Replace with the next important module_ | _What it does_ | _Link to file or page_ |

**Example (typical small MCP + CLI tool):**

| Surface | Purpose | Proof |
|---|---|---|
| MCP stdio server (src/server.ts) | Agent-facing tools + universal ritual injection | file:src/server.ts, file:packages/memory/src/ritual-state.ts |
| CLI installer (src/cli.ts + src/install.ts) | dendrite-wiki init, doctor, benchmark, hooks | file:src/install.ts |
| Wiki store + search | Markdown pages + deterministic ranking + context | packages/wiki/src/store.ts, packages/wiki/src/search-index.ts |
| Memory brain | remember/recall/skills/trails/hygiene | packages/memory/src/memory-store.ts, packages/memory/src/skill-matching.ts |

## Runtime Boundaries

- Entry points: _Replace with the main runtime entry files or commands_
- Data boundaries: _Replace with storage, APIs, or shared state_
- Human-facing surfaces: _Replace with the browser, CLI, API, or admin views_

**Example:**

- Entry points: src/index.ts (MCP), src/cli.ts (commands), npm run docs:dev (VitePress)
- Data boundaries: docs/wiki/*.md (canonical), local-data/project-memories.json + SQLite FTS (derived), docs/public/*.json (generated artifacts)
- Human-facing surfaces: VitePress at http://127.0.0.1:5177, Maintenance Review board, Benchmark Report

## Important Decisions

- Record architectural constraints that agents should not violate.
- Link to files or commands that prove the current behavior.
- Update this page when the structure changes, not just when the implementation changes.

**Example:**

- Decision: Markdown under docs/wiki/ is the single source of truth. Generated artifacts are always rebuildable. No hidden database.
  Proof: file:packages/wiki/src/store.ts (writeWikiPage), scripts/refresh-wiki.ts, [Living Wiki Model](./wiki/living-wiki-model.md)

## First Edits

During the first real session, replace every italic placeholder above with actual project facts and link to the files that prove them.
`;
}

function buildSeedLivingWikiModel(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Living Wiki Model

This page defines how the project should use pages, sources, claims, and backlinks.

## Page Types

- Index pages route readers to the right canonical pages.
- Canonical pages hold durable project truth.
- Generated pages summarize lint, proposals, or other derived state.

## Source Types

Use sources that point back to reality. The current system supports normal wiki links and also typed references such as file paths, commands, and decisions.

## Claim Rules

- Prefer source-backed claims when a fact comes from code, commands, or user decisions.
- Link to canonical pages instead of repeating the same claim in many places.
- Update stale claims as soon as the implementation or decision changes.
- If a claim becomes uncertain, mark or rewrite it before the next session relies on it.

## Canonical Writing Rule

A page should answer one durable question well. If a fact starts spreading across multiple pages, pick the canonical page and route the others to it.
`;
}

function buildSeedOperatorWorkflow(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Operator Workflow

The operator is the human who keeps the wiki aligned with real project direction and decides which automated maintenance changes should be accepted.

## Daily Loop

1. Start from [docs/index.md](../index.md) and the current task.
2. Read [Maintenance Inbox](./maintenance-inbox.md) to see whether there are active lint findings or proposals.
3. Open [Maintenance Review](./maintenance-review.md) when the inbox is not empty.
4. Review the suggested changes, affected paths, and undo path before accepting anything.
5. Decide whether to accept, defer, or reject the maintenance work.
6. Confirm that important product or architecture changes were written back into the canonical wiki pages.
7. Append a short entry to [Project Log](./project-log.md) when a meaningful change was accepted.

## Session Start Questions

- What changed since the last meaningful session?
- Which page should be canonical for this decision or feature?
- Are there any open maintenance items that would make the next agent session less reliable if ignored?

## What The Operator Owns

- Product direction and project priorities.
- Deciding which wiki pages are canonical.
- Reviewing meaningful generated diffs before commit.
- Confirming that important claims still match the code and recent decisions.
- Asking the agent to fill documentation gaps when the wiki no longer reflects reality.

## What The Operator Does Not Need To Do

- Rewrite every page by hand.
- Re-run routine low-risk maintenance if the agent already proposed a safe apply path.
- Inspect every file on every session when the inbox is empty and recent work was small.

## Review Standard

Review maintenance work like code review: check whether the suggested change is true, scoped correctly, and easy to undo. If any of those fail, reject it or ask the agent for a narrower update.

## Before Commit

Before committing meaningful work, verify that the canonical pages still match the implemented behavior and that the project log captures the reason the change mattered.
`;
}

function buildSeedMaintenanceInbox(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: generated
---

# Maintenance Inbox

This page summarizes the current deterministic maintenance items for the project.

## Status

- Active proposals: none yet.
- Active lint findings: none yet.
- Refresh this page after meaningful work when you want a current maintenance snapshot.

## What Empty Looks Like

An empty inbox means there are no currently detected cleanup proposals or deterministic wiki lint findings. That is the steady state you want most of the time.

## What To Do Next

- Read [Operator Workflow](./operator-workflow.md) for the daily human review loop.
- Read [Proposal Workflow](./proposal-workflow.md) when the system suggests cleanup work.
- Keep the inbox small; if it grows, review and route items before they become stale.
`;
}

function buildSeedMaintenanceReview(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Maintenance Review

This page explains how a human operator reviews maintenance actions before accepting them.

## Review Flow

1. Start from [Maintenance Inbox](./maintenance-inbox.md).
2. Inspect the proposal or lint item that needs attention.
3. Read any generated review page or action summary.
4. Check the affected paths and the undo path.
5. Accept only the changes that are true, low-risk, and useful for keeping the wiki clean.

## Decision Options

- Accept: the change is correct, low-risk, and useful now.
- Defer: the change is probably right, but not worth applying yet.
- Reject: the change is stale, too broad, or no longer aligned with project direction.

## Daily Expectation

The operator is not expected to babysit the system constantly. The job is to review non-trivial maintenance items, confirm important documentation diffs, and keep the canonical pages aligned with real project decisions.
`;
}

function buildSeedProposalWorkflow(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Proposal Workflow

This page explains how maintenance proposals should move from suggestion to accepted cleanup.

## Basic Flow

1. List the current proposals.
2. Read the summary or generated review page.
3. Decide whether the cleanup is worth applying now.
4. Apply low-risk proposals when the before and after state is clear.
5. Re-check the wiki state and log any meaningful accepted maintenance.

## Common Tool Path

- Use \`wiki_proposals\` to inspect the current proposal queue.
- Use \`wiki_write_proposals\` when you want durable review pages.
- Use \`wiki_apply_proposal\` only for low-risk proposals that are well understood.

## Operator Responsibility

The operator approves or rejects proposal work. The agent can prepare the change, but the operator decides whether it matches current project intent.
`;
}

function buildSeedBenchmarking(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Benchmarking

This page explains how to measure whether the wiki is becoming easier for humans and agents to use over time.

## First Baseline

Run:

\`dendrite-wiki benchmark:snapshot --label baseline\`

Use that baseline to compare later sessions after real implementation work.

## Suggested Session Labels

- \`baseline\` for the first comparable snapshot.
- \`feature-start\` before a meaningful implementation push.
- \`feature-end\` after the work and docs updates are done.
- \`session-end\` for routine longitudinal tracking.

## What To Watch

- Page count and metadata coverage.
- Lint findings and proposal count.
- Context-page selection and omitted-page count.
- Whether agents need fewer prompts to orient on repeat work.

## Generated Outputs

- \`docs/public/dendrite-benchmark-latest.json\` for the latest snapshot.
- \`docs/public/dendrite-benchmark-history.json\` for the local trend view.
- \`docs/public/dendrite-telemetry-status.json\` for the current consent and sharing state.
- \`docs/wiki/benchmark-log.md\` for the append-only markdown log.

Read [Benchmark Report](./benchmark-report.md) for the local visual summary and [Telemetry Status](./telemetry-status.md) for the current local-only versus opt-in sharing state.

## Reading The Result

Benchmark snapshots are a health signal, not proof by themselves. Pair them with actual experience: did the next person or agent orient faster, ask fewer setup questions, and trust the wiki more?
`;
}

function buildSeedTelemetryStatus(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: generated
---

# Telemetry Status

This page shows the current local telemetry consent state for the project. It is safe to use even when sharing is off.

## Commands

- \`dendrite-wiki telemetry status\` refreshes the local status artifact.
- \`dendrite-wiki telemetry opt-in\` records explicit local consent for future sanitized uploads.
- \`dendrite-wiki telemetry opt-out\` disables sharing while keeping local benchmark artifacts available.

## Local-Only Contract

- Reads \`docs/public/dendrite-telemetry-status.json\`.
- Mirrors the local benchmark event summary when available.
- Does not require a network connection.
- Does not upload wiki content, prompts, or source code by default.

<TelemetryStatus />
`;
}

function buildSeedInstallationGuide(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# MCP Server Installation

This page explains how this project connects to Dendrite Wiki MCP.

## Recommended Setup

1. Install the package:
   \`npm install --save-dev dendrite-wiki-mcp\`
2. Initialize the workspace:
   \`npx dendrite-wiki init\`
3. Restart or refresh the IDE or agent so it reads the new MCP config.
4. Ask the agent to start from [docs/index.md](../index.md) and request a \`wiki_context\` briefing.

## Install Profiles

Use a profile when you only want the integration files for one client surface.

- \`all\`: write all workspace-local client configs and guidance files.
- \`claude\`: write the Claude Code project config shared by the CLI and VS Code extension, plus the Claude command, starter wiki seed, and benchmark log.
- \`copilot-vscode\`: write only the VS Code Copilot MCP config plus VS Code and GitHub guidance files.
- \`cursor\`: write only Cursor MCP config, Cursor rule, starter wiki seed, and benchmark log.
- \`codex\`: write only the Codex CLI and IDE project config, starter wiki seed, and benchmark log.
- \`continue\`: write only the Continue workspace MCP config, starter wiki seed, and benchmark log.
- \`windsurf\`: write only the Windsurf user MCP config at \`~/.codeium/windsurf/mcp_config.json\`.
- \`antigravity\`: write only the Antigravity user MCP config at \`~/.gemini/antigravity/mcp_config.json\`.

If you are using Claude Code inside VS Code, use \`npx dendrite-wiki init --profile claude\`. The editor does not require the Copilot-specific files. If you want Windsurf or Antigravity integration, use the explicit profile so \`init\` does not write user-home config files unless you asked for them.

## What Init Seeds

The initializer creates MCP config files, guidance files, a benchmark log, a benchmark report page, a telemetry status artifact, the starter wiki pages under \`docs/\`, and optional session hook manifests when they do not already exist. It does not overwrite existing project pages or run generated-doc refreshes.

## Session Hooks

The installer can also write optional hook manifests under \`.github/hooks/\` so agents that support lifecycle hooks can wire the read-only session loop without rewriting the prompt for every project:

- \`dendrite-wiki-session-start.json\` reminds the agent to call \`wiki_context\` and read any returned \`handoffs\` before acting.
- \`dendrite-wiki-session-handoff.json\` reminds the agent to call \`memory_handoff\` at session end when work is unfinished.
These manifests are inert by themselves. They become active when an agent harness is configured to read \`.github/hooks/*.json\` for session-start and session-end prompts. They remind agents to read context and hand off unfinished work; they do not run benchmark snapshots, wiki refreshes, or API generation.

## First Run Outcome

After a clean first run, a new project should have enough structure for a human or agent to start documenting real work immediately instead of inventing the wiki layout from scratch.
`;
}

function buildSeedProjectLog(): string {
  return `---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Project Log

This page records meaningful project changes in chronological order.

## Entry Standard

Log changes that alter project truth, project direction, or the documented maintenance state. Skip trivial noise.

## Entries

- Seeded the initial Dendrite Wiki MCP project pages.
`;
}

type InstallClient = 'vscode' | 'cursor' | 'claude' | 'codex' | 'continue' | 'windsurf' | 'antigravity';
type InstallAsset =
  | 'agents-file'
  | 'copilot-instructions'
  | 'vscode-instructions'
  | 'vscode-prompt'
  | 'cursor-rule'
  | 'claude-command'
  | 'claude-settings'
  | 'copilot-agent'
  | 'agent-skill'
  | 'session-hooks';

function buildInstallPlan(profile: DendriteInstallProfile): { clients: InstallClient[]; assets: InstallAsset[] } {
  if (profile === 'claude') {
    return {
      clients: ['claude'],
      assets: ['claude-command', 'claude-settings']
    };
  }

  if (profile === 'copilot-vscode') {
    return {
      clients: ['vscode'],
      assets: ['agents-file', 'copilot-instructions', 'vscode-instructions', 'vscode-prompt', 'copilot-agent', 'session-hooks']
    };
  }

  if (profile === 'cursor') {
    return {
      clients: ['cursor'],
      assets: ['cursor-rule']
    };
  }

  if (profile === 'codex') {
    return {
      clients: ['codex'],
      assets: []
    };
  }

  if (profile === 'continue') {
    return {
      clients: ['continue'],
      assets: []
    };
  }

  if (profile === 'windsurf') {
    return {
      clients: ['windsurf'],
      assets: []
    };
  }

  if (profile === 'antigravity') {
    return {
      clients: ['antigravity'],
      assets: []
    };
  }

  return {
    clients: ['vscode', 'cursor', 'claude', 'codex', 'continue'],
    assets: [
      'agents-file',
      'copilot-instructions',
      'vscode-instructions',
      'vscode-prompt',
      'cursor-rule',
      'claude-command',
      'claude-settings',
      'copilot-agent',
      'agent-skill',
      'session-hooks'
    ]
  };
}
