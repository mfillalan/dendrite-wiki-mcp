#!/usr/bin/env node
import { installDendriteWorkspace, type DendriteInstallMode, type DendriteInstallProfile } from './install.js';
import { writeBenchmarkSnapshot } from './wiki/benchmark.js';
import { setTelemetrySharingMode, uploadTelemetry, writeTelemetryStatusArtifact } from './wiki/telemetry.js';

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
  console.log(`Dendrite Wiki MCP\n\nCommands:\n  dendrite-wiki init [--mode package|dev|built] [--profile all|claude|copilot-vscode|cursor|codex|continue|windsurf|antigravity]\n  dendrite-wiki benchmark:snapshot [--label value] [--query value]\n  dendrite-wiki telemetry [status|opt-in|opt-out|upload]\n\nInstall modes:\n  package  Configure clients to run npx -y dendrite-wiki-mcp.\n  dev      Configure this workspace to run npm run dev.\n  built    Configure this workspace to run node dist/src/index.js.\n\nInstall profiles:\n  all             Write all workspace-local client configs and guidance files.\n  claude          Write the Claude Code project config shared by the CLI and VS Code extension, plus the Claude command, starter wiki seed, and benchmark log.\n  copilot-vscode  Write VS Code Copilot MCP config plus VS Code and GitHub guidance files.\n  cursor          Write only Cursor MCP config, Cursor rule, starter wiki seed, and benchmark log.\n  codex           Write only Codex CLI/IDE project config, starter wiki seed, and benchmark log.\n  continue        Write only Continue workspace MCP config, starter wiki seed, and benchmark log.\n  windsurf        Write only the Windsurf user MCP config in ~/.codeium/windsurf.\n  antigravity     Write only the Antigravity user MCP config in ~/.gemini/antigravity.\n`);
}