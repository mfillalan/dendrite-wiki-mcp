import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

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
  if (plan.assets.includes('claude-command')) {
    await writeIfMissing(path.join(root, '.claude', 'commands', 'dendrite-wiki-session.md'), buildClaudeCommand(), result);
  }
  if (plan.assets.includes('agent-skill')) {
    await writeIfMissing(path.join(root, '.agents', 'skills', 'dendrite-wiki', 'SKILL.md'), buildAgentSkill(), result);
  }
  if (plan.assets.includes('benchmark-hook')) {
    await writeIfMissing(path.join(root, '.github', 'hooks', 'dendrite-wiki-benchmark.json'), buildHookManifest(), result);
  }
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'benchmark-log.md'), buildBenchmarkLog(), result);
  await writeSeedWiki(root, result);

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
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'mcp-installation.md'), buildSeedInstallationGuide(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'project-log.md'), buildSeedProjectLog(), result);
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

function buildSeedBenchmarkReport(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: generated\n---\n\n# Benchmark Report\n\nThis page is the local visual benchmark view for the project. It reads the generated history artifact after you run \`dendrite-wiki benchmark:snapshot\`.\n\n## How To Use It\n\n1. Capture a baseline snapshot before a meaningful implementation session.\n2. Capture another snapshot after the work, wiki updates, and validation are done.\n3. Open this page to compare the trend and read the plain-language summary.\n\n## Local-Only Contract\n\n- Reads \`docs/public/dendrite-benchmark-history.json\`.\n- Compares the earliest snapshot to the latest snapshot.\n- Stays useful even if telemetry is never enabled.\n\n<BenchmarkReport />\n`;
}

 function buildSeedIndex(): string {
  return `# Project Wiki\n\nThis is the project index. Agents and humans should read this page first.\n\nDendrite Wiki MCP turns project memory into a maintained set of markdown pages. Start here, then move into the pages that explain the project plan, architecture, workflows, and current maintenance state.\n\n## First Session Checklist\n\n1. Replace the placeholder sections in [Project Plan](./project-plan.md) with the real goal, milestone, and open questions for this project.\n2. Fill in [Architecture](./wiki/architecture.md) with the important modules, boundaries, and code references.\n3. Confirm [Operator Workflow](./wiki/operator-workflow.md) matches how this team wants to review documentation and maintenance work.\n4. Ask the agent to request a \`wiki_context\` briefing before non-trivial work.\n5. Capture a baseline snapshot after the first meaningful session.\n\n## Core Pages\n\n| Page | Purpose |\n|---|---|\n| [Project Plan](./project-plan.md) | Goals, milestones, priorities, and current decisions. |\n| [Architecture](./wiki/architecture.md) | System boundaries, important modules, and proof links. |\n| [Living Wiki Model](./wiki/living-wiki-model.md) | How pages, sources, claims, and backlinks should work. |\n| [Agent Workflow](./wiki/agent-workflow.md) | What the coding agent should do before, during, and after work. |\n| [Operator Workflow](./wiki/operator-workflow.md) | What the human operator reviews and maintains each day. |\n| [Maintenance Inbox](./wiki/maintenance-inbox.md) | Current deterministic maintenance queue. |\n| [Maintenance Review](./wiki/maintenance-review.md) | How maintenance actions are reviewed and applied. |\n| [Proposal Workflow](./wiki/proposal-workflow.md) | How proposals move from suggestion to accepted cleanup. |\n| [Benchmark Report](./wiki/benchmark-report.md) | Local visual benchmark summary for baseline versus latest progress. |\n| [Benchmarking](./wiki/benchmarking.md) | How to measure whether the wiki is becoming easier to use. |\n| [MCP Server Installation](./wiki/mcp-installation.md) | How this project connects agents to Dendrite Wiki MCP. |\n| [Project Log](./wiki/project-log.md) | Chronological log of meaningful changes. |\n\n## Working Thesis\n\nA coding agent should not rediscover project knowledge on every prompt. It should orient from a small index, read relevant canonical pages, update those pages when work changes the truth, and file valuable answers back into the wiki.\n\n## How To Use This Seed\n\nTreat the seeded pages as starter contracts, not final truth. They are intentionally structured so the first real work session can replace placeholders with project-specific facts while keeping the same review and maintenance flow.\n\n## Generated Catalog\n\n<!-- WIKI_CATALOG_START -->\n\n| Page | Slug |\n|---|---|\n| [Agent Workflow](./wiki/agent-workflow.md) | \`agent-workflow\` |\n| [Architecture](./wiki/architecture.md) | \`architecture\` |\n| [Benchmark Log](./wiki/benchmark-log.md) | \`benchmark-log\` |\n| [Benchmark Report](./wiki/benchmark-report.md) | \`benchmark-report\` |\n| [Benchmarking](./wiki/benchmarking.md) | \`benchmarking\` |\n| [Living Wiki Model](./wiki/living-wiki-model.md) | \`living-wiki-model\` |\n| [Maintenance Inbox](./wiki/maintenance-inbox.md) | \`maintenance-inbox\` |\n| [Maintenance Review](./wiki/maintenance-review.md) | \`maintenance-review\` |\n| [MCP Server Installation](./wiki/mcp-installation.md) | \`mcp-installation\` |\n| [Operator Workflow](./wiki/operator-workflow.md) | \`operator-workflow\` |\n| [Project Log](./wiki/project-log.md) | \`project-log\` |\n| [Proposal Workflow](./wiki/proposal-workflow.md) | \`proposal-workflow\` |\n\n<!-- WIKI_CATALOG_END -->\n`;
 }

function buildSeedProjectPlan(): string {
  return `# Project Plan\n\nThis page records the current project goals, delivery plan, and open questions. Replace the placeholder text in the first session so this page becomes the canonical summary of what the project is trying to achieve.\n\n## Current Goal\n\nWrite one short paragraph that explains the user-facing outcome this project is trying to deliver and how success will be judged.\n\n## Current Milestone\n\n- Name: _Replace with the current milestone name_\n- Exit criteria: _Replace with the concrete bar for completion_\n- Target date: _Optional_\n- Owner: _Optional_\n\n## Active Workstreams\n\n- [ ] Workstream 1: _Replace with the most important active stream_\n- [ ] Workstream 2: _Replace with the second active stream_\n- [ ] Workstream 3: _Remove if not needed_\n\n## Recent Decisions\n\n- Decision: _Replace with the most recent important product or architecture decision_\n  Source: _Link to the relevant page, file, command, or decision note_\n\n## Open Questions\n\n- Which workflows must stay under human review?\n- Which pages should become canonical sources for the team?\n- What does success look like for the next release?\n\n## Update Rule\n\nUpdate this page whenever project direction, milestone scope, or the definition of done changes. It should stay short enough that a new agent or teammate can read it first and understand what matters right now.\n`;
}

function buildSeedAgentWorkflow(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: partial\n---\n\n# Agent Workflow\n\nAgents should treat the wiki as the first place to orient and the last place to file durable knowledge.\n\n## Before Work\n\n1. Read [docs/index.md](../index.md).\n2. Ask Dendrite Wiki MCP for a \`wiki_context\` briefing when the task needs project context.\n3. Read the pages most relevant to the task before making project decisions.\n4. If the task changes project direction, also read [Project Plan](../project-plan.md) and [Architecture](./architecture.md).\n\n## During Work\n\n- Keep code changes focused.\n- Update or create wiki pages when durable project knowledge changes.\n- Add sources to commands, files, or user decisions when practical.\n- Prefer linking to canonical pages instead of duplicating facts.\n- If maintenance findings appear, route through [Proposal Workflow](./proposal-workflow.md) instead of improvising a separate review process.\n\n## After Work\n\n- Update affected pages.\n- Append a short entry to [Project Log](./project-log.md).\n- Run the project validation command before reporting code changes complete.\n- Capture a benchmark snapshot after meaningful sessions if you are measuring orientation quality over time.\n\n## Promotion Rule\n\nIf the answer required stitching together three or more facts, it probably deserves a page or a section in an existing page.\n`;
}

function buildSeedArchitecture(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: partial\n---\n\n# Architecture\n\nThis page explains the current system boundaries and the parts of the codebase that matter most. Replace the placeholders with the real repository map and the proof links that a new agent or reviewer should trust.\n\n## System Map\n\n| Surface | Purpose | Proof |\n|---|---|---|\n| _Replace with the main app or service_ | _What it does_ | _Link to file or page_ |\n| _Replace with the next important module_ | _What it does_ | _Link to file or page_ |\n\n## Runtime Boundaries\n\n- Entry points: _Replace with the main runtime entry files or commands_\n- Data boundaries: _Replace with storage, APIs, or shared state_\n- Human-facing surfaces: _Replace with the browser, CLI, API, or admin views_\n\n## Important Decisions\n\n- Record architectural constraints that agents should not violate.\n- Link to files or commands that prove the current behavior.\n- Update this page when the structure changes, not just when the implementation changes.\n\n## First Edits\n\nDuring the first real session, replace every italic placeholder above with actual project facts and link to the files that prove them.\n`;
}

function buildSeedLivingWikiModel(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: partial\n---\n\n# Living Wiki Model\n\nThis page defines how the project should use pages, sources, claims, and backlinks.\n\n## Page Types\n\n- Index pages route readers to the right canonical pages.\n- Canonical pages hold durable project truth.\n- Generated pages summarize lint, proposals, or other derived state.\n\n## Source Types\n\nUse sources that point back to reality. The current system supports normal wiki links and also typed references such as file paths, commands, and decisions.\n\n## Claim Rules\n\n- Prefer source-backed claims when a fact comes from code, commands, or user decisions.\n- Link to canonical pages instead of repeating the same claim in many places.\n- Update stale claims as soon as the implementation or decision changes.\n- If a claim becomes uncertain, mark or rewrite it before the next session relies on it.\n\n## Canonical Writing Rule\n\nA page should answer one durable question well. If a fact starts spreading across multiple pages, pick the canonical page and route the others to it.\n`;
}

function buildSeedOperatorWorkflow(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: partial\n---\n\n# Operator Workflow\n\nThe operator is the human who keeps the wiki aligned with real project direction and decides which automated maintenance changes should be accepted.\n\n## Daily Loop\n\n1. Start from [docs/index.md](../index.md) and the current task.\n2. Read [Maintenance Inbox](./maintenance-inbox.md) to see whether there are active lint findings or proposals.\n3. Open [Maintenance Review](./maintenance-review.md) when the inbox is not empty.\n4. Review the suggested changes, affected paths, and undo path before accepting anything.\n5. Decide whether to accept, defer, or reject the maintenance work.\n6. Confirm that important product or architecture changes were written back into the canonical wiki pages.\n7. Append a short entry to [Project Log](./project-log.md) when a meaningful change was accepted.\n\n## Session Start Questions\n\n- What changed since the last meaningful session?\n- Which page should be canonical for this decision or feature?\n- Are there any open maintenance items that would make the next agent session less reliable if ignored?\n\n## What The Operator Owns\n\n- Product direction and project priorities.\n- Deciding which wiki pages are canonical.\n- Reviewing meaningful generated diffs before commit.\n- Confirming that important claims still match the code and recent decisions.\n- Asking the agent to fill documentation gaps when the wiki no longer reflects reality.\n\n## What The Operator Does Not Need To Do\n\n- Rewrite every page by hand.\n- Re-run routine low-risk maintenance if the agent already proposed a safe apply path.\n- Inspect every file on every session when the inbox is empty and recent work was small.\n\n## Review Standard\n\nReview maintenance work like code review: check whether the suggested change is true, scoped correctly, and easy to undo. If any of those fail, reject it or ask the agent for a narrower update.\n\n## Before Commit\n\nBefore committing meaningful work, verify that the canonical pages still match the implemented behavior and that the project log captures the reason the change mattered.\n`;
}

function buildSeedMaintenanceInbox(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: generated\n---\n\n# Maintenance Inbox\n\nThis page summarizes the current deterministic maintenance items for the project.\n\n## Status\n\n- Active proposals: none yet.\n- Active lint findings: none yet.\n- Refresh this page after meaningful work when you want a current maintenance snapshot.\n\n## What Empty Looks Like\n\nAn empty inbox means there are no currently detected cleanup proposals or deterministic wiki lint findings. That is the steady state you want most of the time.\n\n## What To Do Next\n\n- Read [Operator Workflow](./operator-workflow.md) for the daily human review loop.\n- Read [Proposal Workflow](./proposal-workflow.md) when the system suggests cleanup work.\n- Keep the inbox small; if it grows, review and route items before they become stale.\n`;
}

function buildSeedMaintenanceReview(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: partial\n---\n\n# Maintenance Review\n\nThis page explains how a human operator reviews maintenance actions before accepting them.\n\n## Review Flow\n\n1. Start from [Maintenance Inbox](./maintenance-inbox.md).\n2. Inspect the proposal or lint item that needs attention.\n3. Read any generated review page or action summary.\n4. Check the affected paths and the undo path.\n5. Accept only the changes that are true, low-risk, and useful for keeping the wiki clean.\n\n## Decision Options\n\n- Accept: the change is correct, low-risk, and useful now.\n- Defer: the change is probably right, but not worth applying yet.\n- Reject: the change is stale, too broad, or no longer aligned with project direction.\n\n## Daily Expectation\n\nThe operator is not expected to babysit the system constantly. The job is to review non-trivial maintenance items, confirm important documentation diffs, and keep the canonical pages aligned with real project decisions.\n`;
}

function buildSeedProposalWorkflow(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: partial\n---\n\n# Proposal Workflow\n\nThis page explains how maintenance proposals should move from suggestion to accepted cleanup.\n\n## Basic Flow\n\n1. List the current proposals.\n2. Read the summary or generated review page.\n3. Decide whether the cleanup is worth applying now.\n4. Apply low-risk proposals when the before and after state is clear.\n5. Re-check the wiki state and log any meaningful accepted maintenance.\n\n## Common Tool Path\n\n- Use \`wiki_proposals\` to inspect the current proposal queue.\n- Use \`wiki_write_proposals\` when you want durable review pages.\n- Use \`wiki_apply_proposal\` only for low-risk proposals that are well understood.\n\n## Operator Responsibility\n\nThe operator approves or rejects proposal work. The agent can prepare the change, but the operator decides whether it matches current project intent.\n`;
}

function buildSeedBenchmarking(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: partial\n---\n\n# Benchmarking\n\nThis page explains how to measure whether the wiki is becoming easier for humans and agents to use over time.\n\n## First Baseline\n\nRun:\n\n\`dendrite-wiki benchmark:snapshot --label baseline\`\n\nUse that baseline to compare later sessions after real implementation work.\n\n## Suggested Session Labels\n\n- \`baseline\` for the first comparable snapshot.\n- \`feature-start\` before a meaningful implementation push.\n- \`feature-end\` after the work and docs updates are done.\n- \`session-end\` for routine longitudinal tracking.\n\n## What To Watch\n\n- Page count and metadata coverage.\n- Lint findings and proposal count.\n- Context-page selection and omitted-page count.\n- Whether agents need fewer prompts to orient on repeat work.\n\n## Generated Outputs\n\n- \`docs/public/dendrite-benchmark-latest.json\` for the latest snapshot.\n- \`docs/public/dendrite-benchmark-history.json\` for the local trend view.\n- \`docs/wiki/benchmark-log.md\` for the append-only markdown log.\n\nRead [Benchmark Report](./benchmark-report.md) for the local visual summary.\n\n## Reading The Result\n\nBenchmark snapshots are a health signal, not proof by themselves. Pair them with actual experience: did the next person or agent orient faster, ask fewer setup questions, and trust the wiki more?\n`;
}

function buildSeedInstallationGuide(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: partial\n---\n\n# MCP Server Installation\n\nThis page explains how this project connects to Dendrite Wiki MCP.\n\n## Recommended Setup\n\n1. Install the package:\n   \`npm install --save-dev dendrite-wiki-mcp\`\n2. Initialize the workspace:\n   \`npx dendrite-wiki init\`\n3. Restart or refresh the IDE or agent so it reads the new MCP config.\n4. Ask the agent to start from [docs/index.md](../index.md) and request a \`wiki_context\` briefing.\n\n## Install Profiles\n\nUse a profile when you only want the integration files for one client surface.\n\n- \`all\`: write all workspace-local client configs and guidance files.\n- \`claude\`: write the Claude Code project config shared by the CLI and VS Code extension, plus the Claude command, starter wiki seed, and benchmark log.\n- \`copilot-vscode\`: write only the VS Code Copilot MCP config plus VS Code and GitHub guidance files.\n- \`cursor\`: write only Cursor MCP config, Cursor rule, starter wiki seed, and benchmark log.\n- \`codex\`: write only the Codex CLI and IDE project config, starter wiki seed, and benchmark log.\n- \`continue\`: write only the Continue workspace MCP config, starter wiki seed, and benchmark log.\n- \`windsurf\`: write only the Windsurf user MCP config at \`~/.codeium/windsurf/mcp_config.json\`.\n- \`antigravity\`: write only the Antigravity user MCP config at \`~/.gemini/antigravity/mcp_config.json\`.\n\nIf you are using Claude Code inside VS Code, use \`npx dendrite-wiki init --profile claude\`. The editor does not require the Copilot-specific files. If you want Windsurf or Antigravity integration, use the explicit profile so \`init\` does not write user-home config files unless you asked for them.\n\n## What Init Seeds\n\nThe initializer creates MCP config files, guidance files, a benchmark log, a benchmark report page, and the starter wiki pages under \`docs/\` when they do not already exist. It does not overwrite existing project pages.\n\n## First Run Outcome\n\nAfter a clean first run, a new project should have enough structure for a human or agent to start documenting real work immediately instead of inventing the wiki layout from scratch.\n`;
}

function buildSeedProjectLog(): string {
  return `---\nlifecycle: active\nowner: unassigned\nsourceCoverage: partial\n---\n\n# Project Log\n\nThis page records meaningful project changes in chronological order.\n\n## Entry Standard\n\nLog changes that alter project truth, project direction, or the documented maintenance state. Skip trivial noise.\n\n## Entries\n\n- Seeded the initial Dendrite Wiki MCP project pages.\n`;
}

type InstallClient = 'vscode' | 'cursor' | 'claude' | 'codex' | 'continue' | 'windsurf' | 'antigravity';
type InstallAsset =
  | 'agents-file'
  | 'copilot-instructions'
  | 'vscode-instructions'
  | 'vscode-prompt'
  | 'cursor-rule'
  | 'claude-command'
  | 'agent-skill'
  | 'benchmark-hook';

function buildInstallPlan(profile: DendriteInstallProfile): { clients: InstallClient[]; assets: InstallAsset[] } {
  if (profile === 'claude') {
    return {
      clients: ['claude'],
      assets: ['claude-command']
    };
  }

  if (profile === 'copilot-vscode') {
    return {
      clients: ['vscode'],
      assets: ['agents-file', 'copilot-instructions', 'vscode-instructions', 'vscode-prompt', 'benchmark-hook']
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
      'agent-skill',
      'benchmark-hook'
    ]
  };
}