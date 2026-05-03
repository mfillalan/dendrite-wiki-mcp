#!/usr/bin/env node
import { installDendriteWorkspace, type DendriteInstallMode } from './install.js';
import { writeBenchmarkSnapshot } from './wiki/benchmark.js';

const [command, ...args] = process.argv.slice(2);

try {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
  } else if (command === 'init') {
    const mode = readMode(args);
    const result = await installDendriteWorkspace({ mode });
    console.log(`Dendrite Wiki MCP initialized in ${result.root}`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Written: ${result.written.length === 0 ? 'none' : result.written.join(', ')}`);
    console.log(`Unchanged: ${result.unchanged.length === 0 ? 'none' : result.unchanged.join(', ')}`);
  } else if (command === 'benchmark:snapshot') {
    const label = readValue(args, '--label') ?? 'manual';
    const query = readValue(args, '--query');
    const snapshot = await writeBenchmarkSnapshot({ label, query });
    console.log(`Wrote benchmark snapshot for ${snapshot.metrics.pageCount} pages.`);
    console.log(`Latest artifact: docs/public/dendrite-benchmark-latest.json`);
    console.log(`Benchmark log: docs/wiki/benchmark-log.md`);
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
  console.log(`Dendrite Wiki MCP\n\nCommands:\n  dendrite-wiki init [--mode package|dev|built]\n  dendrite-wiki benchmark:snapshot [--label value] [--query value]\n\nInstall modes:\n  package  Configure clients to run npx -y dendrite-wiki-mcp.\n  dev      Configure this workspace to run npm run dev.\n  built    Configure this workspace to run node dist/src/index.js.\n`);
}