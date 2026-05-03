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
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'benchmarking.md'), buildSeedBenchmarking(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'mcp-installation.md'), buildSeedInstallationGuide(), result);
  await writeIfMissing(path.join(root, 'docs', 'wiki', 'project-log.md'), buildSeedProjectLog(), result);
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

function buildSeedIndex(): string {
  return `# Project Wiki\n\nThis is the project index. Agents and humans should read this page first.\n\nDendrite Wiki MCP turns project memory into a maintained set of markdown pages. Start here, then move into the pages that explain the project plan, architecture, workflows, and current maintenance state.\n\n## Core Pages\n\n| Page | Purpose |\n|---|---|\n| [Project Plan](./project-plan.md) | Goals, milestones, and current work. |\n| [Architecture](./wiki/architecture.md) | System boundaries and important modules. |\n| [Living Wiki Model](./wiki/living-wiki-model.md) | How pages, sources, claims, and backlinks should work. |\n| [Agent Workflow](./wiki/agent-workflow.md) | What the coding agent should do before, during, and after work. |\n| [Operator Workflow](./wiki/operator-workflow.md) | What the human operator reviews and maintains each day. |\n| [Maintenance Inbox](./wiki/maintenance-inbox.md) | Current deterministic maintenance queue. |\n| [Maintenance Review](./wiki/maintenance-review.md) | How maintenance actions are reviewed and applied. |\n| [Proposal Workflow](./wiki/proposal-workflow.md) | How proposals move from suggestion to accepted cleanup. |\n| [Benchmarking](./wiki/benchmarking.md) | How to measure whether the wiki is becoming easier to use. |\n| [MCP Server Installation](./wiki/mcp-installation.md) | How this project connects agents to Dendrite Wiki MCP. |\n| [Project Log](./wiki/project-log.md) | Chronological log of meaningful changes. |\n\n## Working Thesis\n\nA coding agent should not rediscover project knowledge on every prompt. It should orient from a small index, read relevant canonical pages, update those pages when work changes the truth, and file valuable answers back into the wiki.\n\n## Generated Catalog\n\n<!-- WIKI_CATALOG_START -->\n\n| Page | Slug |\n|---|---|\n| [Agent Workflow](./wiki/agent-workflow.md) | \`agent-workflow\` |\n| [Architecture](./wiki/architecture.md) | \`architecture\` |\n| [Benchmark Log](./wiki/benchmark-log.md) | \`benchmark-log\` |\n| [Benchmarking](./wiki/benchmarking.md) | \`benchmarking\` |\n| [Living Wiki Model](./wiki/living-wiki-model.md) | \`living-wiki-model\` |\n| [Maintenance Inbox](./wiki/maintenance-inbox.md) | \`maintenance-inbox\` |\n| [Maintenance Review](./wiki/maintenance-review.md) | \`maintenance-review\` |\n| [MCP Server Installation](./wiki/mcp-installation.md) | \`mcp-installation\` |\n| [Operator Workflow](./wiki/operator-workflow.md) | \`operator-workflow\` |\n| [Project Log](./wiki/project-log.md) | \`project-log\` |\n| [Proposal Workflow](./wiki/proposal-workflow.md) | \`proposal-workflow\` |\n\n<!-- WIKI_CATALOG_END -->\n`;
}

function buildSeedProjectPlan(): string {
  return `# Project Plan\n\nThis page records the current project goals, delivery plan, and open questions.\n\n## Current Goal\n\nDescribe what the project is trying to deliver right now and how the wiki should help humans and agents stay aligned.\n\n## Milestones\n\n- [ ] Define the first product milestone.\n- [ ] Record the main architecture decisions.\n- [ ] Capture the first benchmark baseline.\n\n## Open Questions\n\n- Which workflows must stay under human review?\n- Which pages should become canonical sources for the team?\n- What does success look like for the next release?\n`;
}

function buildSeedAgentWorkflow(): string {
  return `# Agent Workflow\n\nAgents should treat the wiki as the first place to orient and the last place to file durable knowledge.\n\n## Before Work\n\n1. Read [docs/index.md](../index.md).\n2. Ask Dendrite Wiki MCP for a \`wiki_context\` briefing when the task needs project context.\n3. Read the pages most relevant to the task before making project decisions.\n\n## During Work\n\n- Keep code changes focused.\n- Update or create wiki pages when durable project knowledge changes.\n- Add sources to commands, files, or user decisions when practical.\n- Prefer linking to canonical pages instead of duplicating facts.\n\n## After Work\n\n- Update affected pages.\n- Append a short entry to [Project Log](./project-log.md).\n- Run the project validation command before reporting code changes complete.\n- Capture a benchmark snapshot after meaningful sessions if you are measuring orientation quality over time.\n`;
}

function buildSeedArchitecture(): string {
  return `# Architecture\n\nThis page explains the current system boundaries and the parts of the codebase that matter most.\n\n## System Map\n\nDescribe the main modules, services, and user-facing surfaces here. Include links to the code or docs pages that should stay canonical.\n\n## Important Decisions\n\n- Record architectural constraints that agents should not violate.\n- Link to files or commands that prove the current behavior.\n- Update this page when the structure changes, not just when the implementation changes.\n`;
}

function buildSeedLivingWikiModel(): string {
  return `# Living Wiki Model\n\nThis page defines how the project should use pages, sources, claims, and backlinks.\n\n## Page Types\n\n- Index pages route readers to the right canonical pages.\n- Canonical pages hold durable project truth.\n- Generated pages summarize lint, proposals, or other derived state.\n\n## Claim Rules\n\n- Prefer source-backed claims when a fact comes from code, commands, or user decisions.\n- Link to canonical pages instead of repeating the same claim in many places.\n- Update stale claims as soon as the implementation or decision changes.\n`;
}

function buildSeedOperatorWorkflow(): string {
  return `# Operator Workflow\n\nThe operator is the human who keeps the wiki aligned with real project direction and decides which automated maintenance changes should be accepted.\n\n## Daily Loop\n\n1. Start from [docs/index.md](../index.md) and the current task.\n2. Read [Maintenance Inbox](./maintenance-inbox.md) to see whether there are active lint findings or proposals.\n3. Open [Maintenance Review](./maintenance-review.md) when the inbox is not empty.\n4. Review the suggested changes, affected paths, and undo path before accepting anything.\n5. Decide whether to accept, defer, or reject the maintenance work.\n6. Confirm that important product or architecture changes were written back into the canonical wiki pages.\n7. Append a short entry to [Project Log](./project-log.md) when a meaningful change was accepted.\n\n## What The Operator Owns\n\n- Product direction and project priorities.\n- Deciding which wiki pages are canonical.\n- Reviewing meaningful generated diffs before commit.\n- Confirming that important claims still match the code and recent decisions.\n- Asking the agent to fill documentation gaps when the wiki no longer reflects reality.\n\n## What The Operator Does Not Need To Do\n\n- Rewrite every page by hand.\n- Re-run routine low-risk maintenance if the agent already proposed a safe apply path.\n- Inspect every file on every session when the inbox is empty and recent work was small.\n\n## Review Standard\n\nReview maintenance work like code review: check whether the suggested change is true, scoped correctly, and easy to undo. If any of those fail, reject it or ask the agent for a narrower update.\n`;
}

function buildSeedMaintenanceInbox(): string {
  return `# Maintenance Inbox\n\nThis page summarizes the current deterministic maintenance items for the project.\n\n## Status\n\n- Active proposals: none yet.\n- Active lint findings: none yet.\n- Refresh this page after meaningful work when you want a current maintenance snapshot.\n\n## What To Do Next\n\n- Read [Operator Workflow](./operator-workflow.md) for the daily human review loop.\n- Read [Proposal Workflow](./proposal-workflow.md) when the system suggests cleanup work.\n- Keep the inbox small; if it grows, review and route items before they become stale.\n`;
}

function buildSeedMaintenanceReview(): string {
  return `# Maintenance Review\n\nThis page explains how a human operator reviews maintenance actions before accepting them.\n\n## Review Flow\n\n1. Start from [Maintenance Inbox](./maintenance-inbox.md).\n2. Inspect the proposal or lint item that needs attention.\n3. Read any generated review page or action summary.\n4. Check the affected paths and the undo path.\n5. Accept only the changes that are true, low-risk, and useful for keeping the wiki clean.\n\n## Daily Expectation\n\nThe operator is not expected to babysit the system constantly. The job is to review non-trivial maintenance items, confirm important documentation diffs, and keep the canonical pages aligned with real project decisions.\n`;
}

function buildSeedProposalWorkflow(): string {
  return `# Proposal Workflow\n\nThis page explains how maintenance proposals should move from suggestion to accepted cleanup.\n\n## Basic Flow\n\n1. List the current proposals.\n2. Read the summary or generated review page.\n3. Decide whether the cleanup is worth applying now.\n4. Apply low-risk proposals when the before and after state is clear.\n5. Re-check the wiki state and log any meaningful accepted maintenance.\n\n## Operator Responsibility\n\nThe operator approves or rejects proposal work. The agent can prepare the change, but the operator decides whether it matches current project intent.\n`;
}

function buildSeedBenchmarking(): string {
  return `# Benchmarking\n\nThis page explains how to measure whether the wiki is becoming easier for humans and agents to use over time.\n\n## First Baseline\n\nRun:\n\n\`dendrite-wiki benchmark:snapshot --label baseline\`\n\nUse that baseline to compare later sessions after real implementation work.\n\n## What To Watch\n\n- Page count and metadata coverage.\n- Lint findings and proposal count.\n- Context-page selection and omitted-page count.\n- Whether agents need fewer prompts to orient on repeat work.\n`;
}

function buildSeedInstallationGuide(): string {
  return `# MCP Server Installation\n\nThis page explains how this project connects to Dendrite Wiki MCP.\n\n## Recommended Setup\n\n1. Install the package:\n   \`npm install --save-dev dendrite-wiki-mcp\`\n2. Initialize the workspace:\n   \`npx dendrite-wiki init\`\n3. Restart or refresh the IDE or agent so it reads the new MCP config.\n4. Ask the agent to start from [docs/index.md](../index.md) and request a \`wiki_context\` briefing.\n\n## What Init Seeds\n\nThe initializer creates MCP config files, guidance files, a benchmark log, and the starter wiki pages under \`docs/\` when they do not already exist. It does not overwrite existing project pages.\n`;
}

function buildSeedProjectLog(): string {
  return `# Project Log\n\nThis page records meaningful project changes in chronological order.\n\n## Entries\n\n- Seeded the initial Dendrite Wiki MCP project pages.\n`;
}