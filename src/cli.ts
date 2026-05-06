#!/usr/bin/env node
import { installDendriteWorkspace, type DendriteInstallMode, type DendriteInstallProfile } from './install.js';
import { writeBenchmarkSnapshot } from './wiki/benchmark.js';
import { bootstrapRecallProbeFile } from './wiki/recall-benchmark.js';
import { formatDoctorReport, runDoctor } from './wiki/doctor.js';
import {
  captureRawObservation,
  detectRawObservationClusters,
  isRawObservationsCaptureEnabled,
  readRawObservations
} from './wiki/raw-observations.js';
import { writeBenchmarkReportHtml } from './wiki/report-export.js';
import { computeRemindersForState, readPersistedRitualState } from './wiki/ritual-state.js';
import { recallProjectSkills } from './wiki/skill-matching.js';
import { setTelemetrySharingMode, uploadTelemetry, writeTelemetryStatusArtifact } from './wiki/telemetry.js';

// Map friendlier --ide names to existing install profiles. The --ide flag is the
// preferred surface (matches how other agent-memory tools market install paths);
// --profile remains supported as the underlying mechanism. New aliases here become
// visible in help text and README without changing the installer's profile model.
const ideAliasToProfile: Record<string, DendriteInstallProfile> = {
  'claude-code': 'claude',
  'claude': 'claude',
  'cursor': 'cursor',
  'codex': 'codex',
  'continue': 'continue',
  'windsurf': 'windsurf',
  'antigravity': 'antigravity',
  'gemini': 'antigravity',
  'gemini-cli': 'antigravity',
  'copilot-vscode': 'copilot-vscode',
  'copilot': 'copilot-vscode',
  'vscode': 'copilot-vscode'
};

const [command, ...args] = process.argv.slice(2);

try {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
  } else if (command === 'init') {
    const mode = readMode(args);
    const profile = readProfile(args);
    const result = await installDendriteWorkspace({ mode, profile });
    console.log(`Dendrite Wiki MCP initialized in ${result.root}`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Profile: ${result.profile}`);
    console.log(`Written: ${result.written.length === 0 ? 'none' : result.written.join(', ')}`);
    console.log(`Unchanged: ${result.unchanged.length === 0 ? 'none' : result.unchanged.join(', ')}`);
  } else if (command === 'benchmark:snapshot') {
    const label = readValue(args, '--label') ?? 'manual';
    const query = readValue(args, '--query');
    const snapshot = await writeBenchmarkSnapshot({ label, query });
    console.log(`Wrote benchmark snapshot for ${snapshot.metrics.pageCount} pages.`);
    console.log(`Latest artifact: docs/public/dendrite-benchmark-latest.json`);
    console.log(`History artifact: docs/public/dendrite-benchmark-history.json`);
    console.log(`Benchmark log: docs/wiki/benchmark-log.md`);
  } else if (command === 'ritual:cursor-hook') {
    // Cursor's beforeMCPExecution hook protocol differs from Claude Code's:
    // it expects { permission: 'allow'|'deny'|'ask', userMessage?, agentMessage? }
    // rather than { hookSpecificOutput: { additionalContext: ... } }.
    // We always allow (never block — heavy-handed for a documentation tool)
    // and surface ritual reminders via agentMessage when state shows gaps.
    const snapshot = readPersistedRitualState();
    if (!snapshot) {
      process.exit(0);
    }
    const reminders = computeRemindersForState(snapshot);
    if (reminders.length === 0) {
      process.exit(0);
    }
    const lines: string[] = ['[DENDRITE RITUAL CHECKPOINT]'];
    for (const r of reminders) {
      const tag = r.severity === 'urgent' ? 'URGENT' : r.severity === 'nudge' ? 'NUDGE' : 'INFO';
      lines.push(`${tag} (${r.rule}): ${r.text}`);
    }
    console.log(JSON.stringify({
      permission: 'allow',
      agentMessage: lines.join('\n')
    }));
  } else if (command === 'ritual:hook') {
    // Designed to be called from a Claude Code UserPromptSubmit / Codex hook.
    // Reads the persisted ritual state and emits Claude-Code/Codex-compatible
    // JSON with `additionalContext` when reminders are active. Empty stdout
    // when no reminders apply, so it stays quiet on healthy sessions.
    const snapshot = readPersistedRitualState();
    if (!snapshot) {
      // No state yet (fresh session before any tool call). Stay quiet.
      process.exit(0);
    }
    const reminders = computeRemindersForState(snapshot);
    if (reminders.length === 0) {
      process.exit(0);
    }
    const lines: string[] = ['[DENDRITE RITUAL CHECKPOINT]'];
    for (const r of reminders) {
      const tag = r.severity === 'urgent' ? 'URGENT' : r.severity === 'nudge' ? 'NUDGE' : 'INFO';
      lines.push(`${tag} (${r.rule}): ${r.text}`);
    }
    lines.push(`Session ${snapshot.sessionId} · ${snapshot.toolCallCount} tool calls so far · wiki_context: ${snapshot.wikiContextCalled ? 'called' : 'NOT YET'} · last memory_remember: ${snapshot.lastMemoryRememberAt ?? 'never this session'}.`);
    const additionalContext = lines.join('\n');
    console.log(JSON.stringify({ hookSpecificOutput: { additionalContext } }));
  } else if (command === 'skills:hook') {
    // PreToolUse hook on Edit/Write/MultiEdit. Reads JSON tool input from stdin
    // (Claude Code passes { tool_name, tool_input: { file_path, ... } }) and
    // returns hookSpecificOutput.additionalContext with matching skill summaries
    // so the agent sees relevant skills before editing.
    //
    // Per design: hook failures must never block the user's Edit/Write — exit 0
    // with empty stdout on any error so the file edit proceeds normally.
    try {
      const stdin = await readStdin();
      const payload = stdin.trim() ? JSON.parse(stdin) : {};
      const toolInput = (payload.tool_input ?? payload.input ?? {}) as { file_path?: string; query?: string; description?: string };
      const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
      if (!filePath) {
        process.exit(0);
      }
      const taskHint = typeof toolInput.description === 'string' && toolInput.description.trim()
        ? toolInput.description
        : `editing ${filePath}`;
      const skills = await recallProjectSkills({ query: taskHint, relatedFiles: [filePath], maxItems: 3 });
      if (skills.length === 0) {
        process.exit(0);
      }
      const lines: string[] = ['[DENDRITE SKILLS]'];
      lines.push(`The following project-local skills match ${filePath}. Call mcp__dendrite-wiki-mcp__wiki_skill_load(id) to read full content.`);
      for (const skill of skills) {
        lines.push('');
        lines.push(`- ${skill.id}: ${skill.summary}`);
        lines.push(`  reasons: ${skill.reasons.slice(0, 3).join('; ')}`);
      }
      console.log(JSON.stringify({ hookSpecificOutput: { additionalContext: lines.join('\n') } }));
    } catch {
      // Silent failure per design — never block Edit/Write on a discovery feature failure.
      process.exit(0);
    }
  } else if (command === 'observations:capture') {
    // PostToolUse hook. Reads JSON from stdin (Claude Code/Codex pass
    // { session_id, tool_name, tool_input, tool_response }) and appends one
    // raw observation. Silent on every error path so a hook failure never
    // breaks the agent's tool call.
    try {
      if (!isRawObservationsCaptureEnabled()) {
        process.exit(0);
      }
      const stdin = await readStdin();
      const payload = stdin.trim() ? JSON.parse(stdin) : {};
      const tool = typeof payload.tool_name === 'string' ? payload.tool_name : '';
      if (!tool) {
        process.exit(0);
      }
      const toolInput = (payload.tool_input ?? {}) as {
        file_path?: string;
        command?: string;
        url?: string;
        pattern?: string;
        query?: string;
        description?: string;
      };
      const target =
        toolInput.file_path ??
        toolInput.command ??
        toolInput.url ??
        toolInput.pattern ??
        toolInput.query ??
        '';
      const summary =
        typeof toolInput.description === 'string' && toolInput.description.trim()
          ? toolInput.description
          : typeof toolInput.command === 'string'
          ? toolInput.command
          : '';
      const sessionId =
        typeof payload.session_id === 'string' ? payload.session_id : undefined;
      const toolResponse = payload.tool_response;
      let outcome: 'ok' | 'error' | 'unknown' = 'unknown';
      if (toolResponse && typeof toolResponse === 'object') {
        const candidate = toolResponse as { is_error?: unknown; error?: unknown };
        outcome = candidate.is_error === true || candidate.error !== undefined ? 'error' : 'ok';
      }
      await captureRawObservation({
        tool,
        target: typeof target === 'string' ? target.split('\n')[0] : '',
        summary,
        outcome,
        sessionId
      });
    } catch {
      // Silent failure per design — never block the agent.
    }
    process.exit(0);
  } else if (command === 'observations:clusters') {
    const minOccArg = readValue(args, '--min');
    const minSessArg = readValue(args, '--sessions');
    const windowArg = readValue(args, '--window-days');
    const clusters = await detectRawObservationClusters({
      minOccurrences: minOccArg ? Math.max(2, Number.parseInt(minOccArg, 10) || 3) : undefined,
      minDistinctSessions: minSessArg ? Math.max(1, Number.parseInt(minSessArg, 10) || 2) : undefined,
      windowDays: windowArg ? Math.max(1, Number.parseInt(windowArg, 10) || 0) : undefined
    });
    if (clusters.length === 0) {
      console.log('No observation clusters meet the threshold.');
      console.log('Defaults: at least 3 occurrences across at least 2 distinct sessions on the same (kind, target).');
      console.log('Tune with --min N --sessions M --window-days D.');
    } else {
      for (const cluster of clusters) {
        const outcomes = `ok=${cluster.outcomeCounts.ok} err=${cluster.outcomeCounts.error} unk=${cluster.outcomeCounts.unknown}`;
        console.log(
          `${cluster.kind.padEnd(7)}  ${String(cluster.observationCount).padStart(3)}x  ${String(cluster.distinctSessionCount).padStart(2)} sess  ${outcomes.padEnd(28)}  ${cluster.target}`
        );
      }
      console.log(`\n(${clusters.length} cluster${clusters.length === 1 ? '' : 's'})`);
    }
  } else if (command === 'observations:list') {
    const limitArg = readValue(args, '--limit');
    const limit = limitArg ? Math.max(1, Number.parseInt(limitArg, 10) || 50) : 50;
    const observations = await readRawObservations({ limit });
    if (observations.length === 0) {
      console.log('No raw observations captured yet.');
      console.log('They are recorded automatically via the PostToolUse hook when the installer wires it.');
      console.log('Opt out with DENDRITE_RAW_OBSERVATIONS=off.');
    } else {
      for (const observation of observations) {
        console.log(
          `${observation.ts}  ${observation.kind.padEnd(7)}  ${observation.tool.padEnd(12)}  ${observation.outcome.padEnd(7)}  ${observation.target}`
        );
      }
      console.log(`\n(${observations.length} observation${observations.length === 1 ? '' : 's'})`);
    }
  } else if (command === 'doctor') {
    const asJson = args.includes('--json');
    const report = await runDoctor();
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatDoctorReport(report));
    }
    if (report.status === 'critical') {
      process.exitCode = 1;
    }
  } else if (command === 'report:export') {
    const outputPath = readValue(args, '--output');
    const reportTitle = readValue(args, '--title');
    const result = await writeBenchmarkReportHtml({ outputPath, reportTitle });

    if (!result.hasData) {
      console.log('No benchmark snapshots found yet. Wrote an empty-state report.');
      console.log('Run `npx dendrite-wiki benchmark:snapshot` to capture a snapshot, then re-export.');
    } else {
      console.log(`Wrote benchmark report (${result.snapshotCount} snapshots, ${formatBytes(result.bytesWritten)}).`);
    }
    console.log(`Report: ${result.outputPath}`);
  } else if (command === 'recall:bootstrap') {
    const force = args.includes('--force');
    const outputPath = readValue(args, '--output');
    const result = await bootstrapRecallProbeFile({ force, outputPath });

    if (result.written) {
      const verb = result.reason === 'overwritten' ? 'Overwrote' : 'Wrote';
      console.log(`${verb} ${result.outputPath}`);
      console.log(`Probes: ${result.probeCount} (source: ${result.source})`);
      if (result.source === 'template') {
        console.log('No active project-local memories were found, so the file ships placeholder probes you should edit before running the benchmark.');
      }
    } else {
      console.log(`Skipped: ${result.outputPath} already exists. Re-run with --force to overwrite.`);
      process.exitCode = 1;
    }
  } else if (command === 'telemetry') {
    const subcommand = args[0] ?? 'status';

    if (subcommand === 'status') {
      const status = await writeTelemetryStatusArtifact();
      console.log(`Telemetry sharing: ${status.sharingEnabled ? 'opt-in' : 'off'}`);
      console.log(`Explicit consent recorded: ${status.consent.isExplicit ? 'yes' : 'no'}`);
      console.log(`Captured local benchmark events: ${status.benchmarkEvents.eventCount}`);
      console.log(`Status artifact: ${status.paths.statusArtifactPath}`);
      console.log(`Config: ${status.paths.configPath}`);
      console.log(`Upload audit: ${status.paths.uploadAuditPath}`);
    } else if (subcommand === 'opt-in') {
      const status = await setTelemetrySharingMode('opt-in');
      console.log('Telemetry sharing consent recorded as opt-in.');
      console.log(`Status artifact: ${status.paths.statusArtifactPath}`);
      console.log(`Config: ${status.paths.configPath}`);
    } else if (subcommand === 'opt-out') {
      const status = await setTelemetrySharingMode('off');
      console.log('Telemetry sharing set to off. Local benchmark artifacts remain available.');
      console.log(`Status artifact: ${status.paths.statusArtifactPath}`);
      console.log(`Config: ${status.paths.configPath}`);
    } else if (subcommand === 'upload') {
      const result = await uploadTelemetry();
      console.log(result.message);
      console.log(`Destination: ${result.destination ?? 'not configured'}`);
      console.log(`Upload audit: ${result.auditPath}`);
      console.log(`Status artifact: ${result.status.paths.statusArtifactPath}`);
      if (!result.ok) {
        process.exitCode = 1;
      }
    } else {
      throw new Error(`Unknown telemetry command: ${subcommand}`);
    }
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function readMode(args: string[]): DendriteInstallMode {
  const explicitMode = readValue(args, '--mode') as DendriteInstallMode | undefined;
  if (explicitMode) {
    if (!['package', 'dev', 'built'].includes(explicitMode)) {
      throw new Error(`Unsupported init mode: ${explicitMode}`);
    }
    return explicitMode;
  }

  if (args.includes('--dev')) {
    return 'dev';
  }

  if (args.includes('--built')) {
    return 'built';
  }

  return 'package';
}

function readProfile(args: string[]): DendriteInstallProfile {
  const explicitIde = readValue(args, '--ide');
  if (explicitIde) {
    const normalized = explicitIde.trim().toLowerCase();
    const mapped = ideAliasToProfile[normalized];
    if (!mapped) {
      throw new Error(
        `Unsupported --ide value: ${explicitIde}. Known IDEs: ${Object.keys(ideAliasToProfile).sort().join(', ')}.`
      );
    }
    return mapped;
  }

  const explicitProfile = readValue(args, '--profile') as DendriteInstallProfile | undefined;
  if (!explicitProfile) {
    return 'all';
  }

  if (!['all', 'claude', 'copilot-vscode', 'cursor', 'codex', 'continue', 'windsurf', 'antigravity'].includes(explicitProfile)) {
    throw new Error(`Unsupported init profile: ${explicitProfile}`);
  }

  return explicitProfile;
}

function readValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function printHelp(): void {
  console.log(`Dendrite Wiki MCP\n\nCommands:\n  dendrite-wiki init [--mode package|dev|built] [--ide claude-code|cursor|codex|continue|windsurf|gemini-cli|copilot-vscode|...] [--profile all|claude|copilot-vscode|cursor|codex|continue|windsurf|antigravity]\n  dendrite-wiki benchmark:snapshot [--label value] [--query value]\n  dendrite-wiki doctor [--json]\n  dendrite-wiki report:export [--output path] [--title text]\n  dendrite-wiki ritual:hook  (designed for Claude Code / Codex UserPromptSubmit hooks; outputs JSON)\n  dendrite-wiki ritual:cursor-hook  (designed for Cursor beforeMCPExecution hook; outputs Cursor-shaped JSON)\n  dendrite-wiki skills:hook  (designed for Claude Code PreToolUse hooks on Edit/Write; reads JSON tool input from stdin and outputs matching skill summaries)\n  dendrite-wiki observations:capture  (designed for Claude Code/Codex PostToolUse hooks; reads JSON tool payload from stdin and appends one raw observation to local-data/raw-observations.jsonl)\n  dendrite-wiki observations:list [--limit N]\n  dendrite-wiki observations:clusters [--min N] [--sessions M] [--window-days D]\n  dendrite-wiki recall:bootstrap [--force] [--output path]\n  dendrite-wiki telemetry [status|opt-in|opt-out|upload]\n\nInstall modes:\n  package  Configure clients to run npx -y dendrite-wiki-mcp.\n  dev      Configure this workspace to run npm run dev.\n  built    Configure this workspace to run node dist/src/index.js.\n\nInstall profiles:\n  all             Write all workspace-local client configs and guidance files.\n  claude          Write the Claude Code project config shared by the CLI and VS Code extension, plus the Claude command, starter wiki seed, and benchmark log.\n  copilot-vscode  Write VS Code Copilot MCP config plus VS Code and GitHub guidance files.\n  cursor          Write only Cursor MCP config, Cursor rule, starter wiki seed, and benchmark log.\n  codex           Write only Codex CLI/IDE project config, starter wiki seed, and benchmark log.\n  continue        Write only Continue workspace MCP config, starter wiki seed, and benchmark log.\n  windsurf        Write only the Windsurf user MCP config in ~/.codeium/windsurf.\n  antigravity     Write only the Antigravity user MCP config in ~/.gemini/antigravity.\n\nIDE aliases (--ide):\n  claude-code, cursor, codex, continue, windsurf, gemini-cli, copilot-vscode, vscode\n  (--ide is a friendlier surface for the same profile mapping; either flag works.)\n\nReports and audits:\n  doctor          Audit project health (missing files, stale benchmarks, lint findings, etc.). Exits 1 on critical findings.\n  report:export   Generate a self-contained HTML report from local benchmark history. Default output: docs/public/benchmark-report.html.\n`);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }
  return new Promise((resolve, reject) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
    });
    process.stdin.on('end', () => resolve(buffer));
    process.stdin.on('error', (error) => reject(error));
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}