import { promises as fs } from 'node:fs';
import path from 'node:path';

export type DendriteInstallMode = 'package' | 'dev' | 'built';

export interface DendriteInstallOptions {
  root?: string;
  mode?: DendriteInstallMode;
  packageName?: string;
  serverName?: string;
}

export interface DendriteInstallResult {
  root: string;
  mode: DendriteInstallMode;
  written: string[];
  unchanged: string[];
}

const defaultServerName = 'dendrite-wiki-mcp';
const defaultPackageName = 'dendrite-wiki-mcp';

export async function installDendriteWorkspace(options: DendriteInstallOptions = {}): Promise<DendriteInstallResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const mode = options.mode ?? 'package';
  const packageName = options.packageName ?? defaultPackageName;
  const serverName = options.serverName ?? defaultServerName;
  const result: DendriteInstallResult = { root, mode, written: [], unchanged: [] };

  await writeMcpConfig({
    path: path.join(root, '.vscode', 'mcp.json'),
    containerKey: 'servers',
    serverName,
    serverConfig: buildVsCodeServerConfig(mode, packageName),
    result
  });
  await writeMcpConfig({
    path: path.join(root, '.cursor', 'mcp.json'),
    containerKey: 'mcpServers',
    serverName,
    serverConfig: buildProjectServerConfig(mode, packageName),
    result
  });
  await writeMcpConfig({
    path: path.join(root, '.mcp.json'),
    containerKey: 'mcpServers',
    serverName,
    serverConfig: buildProjectServerConfig(mode, packageName),
    result
  });

  await writeIfMissing(path.join(root, 'AGENTS.md'), buildAgentsFile(), result);
  await writeIfMissing(path.join(root, '.github', 'copilot-instructions.md'), buildCopilotInstructions(), result);
  await writeIfMissing(path.join(root, '.github', 'instructions', 'dendrite-wiki.instructions.md'), buildVsCodeInstructions(), result);
  await writeIfMissing(path.join(root, '.github', 'prompts', 'dendrite-wiki-session.prompt.md'), buildVsCodePrompt(), result);
  await writeIfMissing(path.join(root, '.cursor', 'rules', 'dendrite-wiki.mdc'), buildCursorRule(), result);
  await writeIfMissing(path.join(root, '.claude', 'commands', 'dendrite-wiki-session.md'), buildClaudeCommand(), result);
  await writeIfMissing(path.join(root, '.agents', 'skills', 'dendrite-wiki', 'SKILL.md'), buildAgentSkill(), result);
  await writeIfMissing(path.join(root, '.github', 'hooks', 'dendrite-wiki-benchmark.json'), buildHookManifest(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'benchmark-log.md'), buildBenchmarkLog(), result);

  return result;
}

function buildVsCodeServerConfig(mode: DendriteInstallMode, packageName: string): Record<string, unknown> {
  return { type: 'stdio', ...buildProjectServerConfig(mode, packageName), ...(mode === 'dev' ? { cwd: '${workspaceFolder}' } : {}) };
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

async function writeMcpConfig(input: {
  path: string;
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

  await writeIfChanged(input.path, `${JSON.stringify(next, null, 2)}\n`, input.result);
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

async function writeIfMissing(filePath: string, content: string, result: DendriteInstallResult): Promise<void> {
  const existing = await fs.readFile(filePath, 'utf8').catch(() => undefined);
  if (existing !== undefined) {
    result.unchanged.push(toPortablePath(path.relative(result.root, filePath)));
    return;
  }

  await writeIfChanged(filePath, content, result);
}

async function writeIfChanged(filePath: string, content: string, result: DendriteInstallResult): Promise<void> {
  const relativePath = toPortablePath(path.relative(result.root, filePath));
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
  return `# Agent Operating Notes\n\nThis project uses Dendrite Wiki MCP for local project memory and browser-viewable documentation.\n\n## Dendrite Workflow\n\n1. Read [docs/index.md](docs/index.md) before starting project work.\n2. Ask the MCP tool \`wiki_context\` for a task briefing when the task needs project context.\n3. Keep durable project facts in wiki pages instead of chat history.\n4. Append meaningful progress to [docs/wiki/project-log.md](docs/wiki/project-log.md).\n5. Run the project's validation command before reporting code changes complete.\n`; 
}

function buildCopilotInstructions(): string {
  return `# Dendrite Wiki MCP Instructions\n\nThis workspace uses Dendrite Wiki MCP as the project memory and documentation system.\n\n- Start by reading [docs/index.md](../docs/index.md) and asking for a \`wiki_context\` briefing when project context matters.\n- Update or create wiki pages when work changes durable project knowledge.\n- Add source links to files, commands, or user decisions when practical.\n- Append meaningful progress to [docs/wiki/project-log.md](../docs/wiki/project-log.md).\n- Keep documentation browser-friendly and concise.\n`;
}

function buildVsCodeInstructions(): string {
  return `---\ndescription: "Use when: working in a repository that has Dendrite Wiki MCP installed for project memory, documentation, or agent briefings."\n---\n\nUse Dendrite Wiki MCP as the shared project memory layer. Read [docs/index.md](../../docs/index.md), request a \`wiki_context\` briefing for non-trivial work, and file durable discoveries back into the wiki or project log.\n`;
}

function buildVsCodePrompt(): string {
  return `---\ndescription: "Start a Dendrite Wiki MCP session with project status, relevant pages, and documentation follow-up."\n---\n\nStart a project session using Dendrite Wiki MCP.\n\n1. Read [docs/index.md](../../docs/index.md).\n2. Call \`wiki_context\` for the user's current task.\n3. Summarize current project status, relevant pages, open questions, and likely documentation updates.\n4. Keep product direction under human control; recommend next work only when it follows the documented vision.\n`;
}

function buildCursorRule(): string {
  return `---\ndescription: Dendrite Wiki MCP project memory workflow\nalwaysApply: true\n---\n\nThis repository uses Dendrite Wiki MCP. Read docs/index.md before project decisions, use the MCP wiki tools for task context, update wiki pages when durable knowledge changes, and append meaningful progress to docs/wiki/project-log.md.\n`;
}

function buildClaudeCommand(): string {
  return `Start a Dendrite Wiki MCP project session.\n\nRead docs/index.md, use the dendrite-wiki-mcp MCP tools to request a wiki_context briefing for the current task, identify relevant pages and open questions, then proceed with project work while updating durable wiki knowledge and docs/wiki/project-log.md.\n`;
}

function buildAgentSkill(): string {
  return `---\nname: dendrite-wiki\ndescription: "Use when: starting or continuing work in a project that uses Dendrite Wiki MCP, especially when you need project status, persistent memory, documentation updates, or benchmark snapshots."\n---\n\n# Dendrite Wiki\n\nUse this workflow when a project has Dendrite Wiki MCP installed.\n\n1. Read docs/index.md.\n2. Ask the MCP server for a wiki_context briefing for the current task.\n3. Use wiki_search or wiki_read for relevant pages.\n4. Update wiki pages and docs/wiki/project-log.md when durable knowledge changes.\n5. Run dendrite-wiki benchmark:snapshot after meaningful sessions when measuring whether the wiki improves agent orientation over time.\n`;
}

function buildHookManifest(): string {
  return `${JSON.stringify(
    {
      name: 'dendrite-wiki-benchmark',
      description: 'Optional hook manifest for agents that support lifecycle hooks. Run this after meaningful sessions to capture Dendrite Wiki MCP benchmark metrics.',
      event: 'session-end',
      command: 'dendrite-wiki',
      args: ['benchmark:snapshot', '--label', 'session-end']
    },
    null,
    2
  )}\n`;
}

function buildBenchmarkLog(): string {
  return `# Benchmark Log\n\nThis page records Dendrite Wiki MCP benchmark snapshots for this project.\n\nRun \`dendrite-wiki benchmark:snapshot\` after meaningful work sessions to capture whether the wiki is becoming easier for agents and humans to use over time.\n\n## Snapshots\n\n| Timestamp | Label | Pages | Claims | Lint Findings | Proposals | Context Pages | Git Commit |\n|---|---|---:|---:|---:|---:|---:|---|\n`;
}