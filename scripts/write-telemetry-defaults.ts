#!/usr/bin/env tsx
/**
 * Publish-time injection of baked-in Dendrite-hosted telemetry destination defaults.
 *
 * The source-tree `src/wiki/telemetry-defaults.ts` ships EMPTY by design — the production
 * Turso URL + write-scoped token must never enter git history. This script writes the
 * real values into that file from environment-only secrets just before `npm publish`
 * packs the tarball, and `postpublish` resets it back to empty.
 *
 * Wired via `prepublishOnly` and `postpublish` in package.json. Local `npm pack` does
 * NOT trigger the injection (prepack runs `npm run check`, which excludes this script).
 *
 * Brain-Faithfulness follow-up: see
 * [Benchmark Telemetry Database Roadmap](../docs/wiki/benchmark-telemetry-database-roadmap.md)
 * for the credential-strategy rationale (Option A, write-scoped token) and Slice T2/T4
 * for the wire-up plan this script implements.
 *
 * Usage:
 *
 *   write-telemetry-defaults.ts          # inject from env vars (default; for prepublishOnly)
 *   write-telemetry-defaults.ts --reset  # restore empty values (for postpublish)
 *   write-telemetry-defaults.ts --check  # print current file state, no writes
 *
 * Required env vars when injecting:
 *   DENDRITE_TELEMETRY_PUBLISH_URL    Turso base URL (e.g. https://my-db-org.turso.io)
 *   DENDRITE_TELEMETRY_PUBLISH_TOKEN  Write-scoped Turso auth token
 *
 * Optional env vars:
 *   DENDRITE_TELEMETRY_PUBLISH_TABLE  Override table name (defaults to 'benchmark_events')
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(repoRoot, 'src', 'wiki', 'telemetry-defaults.ts');

interface ParsedDefaults {
  url: string;
  token: string;
  table: string;
}

function buildDefaultsFile(values: ParsedDefaults): string {
  // Keep the file header identical to the empty source-tree version so the only diff
  // between source and packaged versions is the literal string values. A reviewer
  // diffing the tarball against the git source sees exactly three changed lines.
  const tokenHint = values.token ? `${values.token.slice(0, 6)}…${values.token.slice(-4)} (${values.token.length} chars)` : '(empty)';
  void tokenHint; // referenced in the printed status, not the file body itself
  return `/**
 * Baked-in fallback constants for the opt-in benchmark telemetry destination
 * (Brain-Faithfulness follow-up track — Benchmark Telemetry Database Roadmap T2).
 *
 * **This file ships EMPTY in source.** The published npm package contains the real
 * values, written at publish time by \`scripts/write-telemetry-defaults.ts\` from
 * environment-only secrets in the release pipeline. The git source tree must never
 * carry the production token — see [Benchmark Telemetry Database Roadmap](../../docs/wiki/benchmark-telemetry-database-roadmap.md)
 * Gap 1 for the credential-strategy rationale and Slice T2/T4 for the wire-up.
 *
 * Runtime resolution order (in \`resolveLibsqlUploadTarget\`):
 *
 *   1. \`DENDRITE_WIKI_TELEMETRY_TURSO_URL\` + \`_TOKEN\` env vars
 *      (BYO destination — wins over baked defaults)
 *   2. These constants (Dendrite-hosted destination, baked at publish time)
 *   3. Neither → upload returns \`skipped\` with a clear audit entry
 *
 * The constants are write-scoped on the Turso side: the token in a real published
 * package can only INSERT into the single \`benchmark_events\` table, cannot read
 * existing rows, and cannot touch other databases on the account. Worst-case abuse
 * is write-quota exhaustion, which is detectable via the row-count metric and
 * recoverable via a patch-release token rotation.
 *
 * Local development: keep these empty. Run with \`DENDRITE_WIKI_TELEMETRY_TURSO_URL\`
 * + \`_TOKEN\` set against your own scratch Turso database when you need to exercise
 * the upload path end-to-end.
 */

/** Turso libSQL database base URL (without the \`/v2/pipeline\` suffix). Empty in source. */
export const TELEMETRY_DEFAULT_URL = ${JSON.stringify(values.url)};

/** Write-scoped Turso auth token. Empty in source; written at publish time only. */
export const TELEMETRY_DEFAULT_TOKEN = ${JSON.stringify(values.token)};

/** Table name for the INSERT. Falls back to \`benchmark_events\` if empty. */
export const TELEMETRY_DEFAULT_TABLE = ${JSON.stringify(values.table)};
`;
}

function readEnvOrThrow(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Required env var ${name} is not set or is empty. Refusing to write telemetry defaults.`);
  }
  return value;
}

async function readCurrentDefaults(): Promise<ParsedDefaults> {
  const content = await fs.readFile(targetPath, 'utf8');
  const matchString = (varName: string) => {
    const pattern = new RegExp(`export const ${varName} = (['"])([\\s\\S]*?)\\1;`);
    const match = content.match(pattern);
    return match ? match[2] : '';
  };
  return {
    url: matchString('TELEMETRY_DEFAULT_URL'),
    token: matchString('TELEMETRY_DEFAULT_TOKEN'),
    table: matchString('TELEMETRY_DEFAULT_TABLE')
  };
}

function describeDefaults(values: ParsedDefaults): string {
  const tokenHint = values.token ? `${values.token.slice(0, 6)}…${values.token.slice(-4)} (${values.token.length} chars)` : '(empty)';
  return [
    `  URL:   ${values.url || '(empty)'}`,
    `  Token: ${tokenHint}`,
    `  Table: ${values.table || '(empty — defaults to benchmark_events at runtime)'}`
  ].join('\n');
}

async function runInject(): Promise<void> {
  const url = readEnvOrThrow('DENDRITE_TELEMETRY_PUBLISH_URL');
  if (!/^https:\/\/[a-z0-9-]+\.turso\.io$/i.test(url)) {
    throw new Error(
      `DENDRITE_TELEMETRY_PUBLISH_URL must look like https://<db>-<org>.turso.io. Got: ${url}`
    );
  }
  const token = readEnvOrThrow('DENDRITE_TELEMETRY_PUBLISH_TOKEN');
  const table = process.env.DENDRITE_TELEMETRY_PUBLISH_TABLE?.trim() || '';

  const existing = await readCurrentDefaults();
  if (existing.url || existing.token) {
    throw new Error(
      `telemetry-defaults.ts already contains non-empty values. Refusing to overwrite — run with --reset first if this is intentional.\nCurrent state:\n${describeDefaults(existing)}`
    );
  }

  const next: ParsedDefaults = { url, token, table };
  await fs.writeFile(targetPath, buildDefaultsFile(next), 'utf8');
  console.log('[telemetry-defaults] Injected publish-time defaults:');
  console.log(describeDefaults(next));
  console.log(`[telemetry-defaults] Wrote ${path.relative(repoRoot, targetPath)}`);
}

async function runReset(): Promise<void> {
  const empty: ParsedDefaults = { url: '', token: '', table: '' };
  await fs.writeFile(targetPath, buildDefaultsFile(empty), 'utf8');
  console.log('[telemetry-defaults] Reset to empty source-tree state.');
  console.log(describeDefaults(empty));
  console.log(`[telemetry-defaults] Wrote ${path.relative(repoRoot, targetPath)}`);
}

async function runCheck(): Promise<void> {
  const current = await readCurrentDefaults();
  console.log('[telemetry-defaults] Current file state:');
  console.log(describeDefaults(current));
  if (current.url || current.token) {
    console.log('[telemetry-defaults] File contains BAKED defaults — git tree is dirty and must not be committed.');
    process.exitCode = 1;
  } else {
    console.log('[telemetry-defaults] File is clean (source-tree empty state).');
  }
}

const mode = process.argv[2] ?? '';
const action = (() => {
  if (mode === '--reset') return runReset;
  if (mode === '--check') return runCheck;
  if (mode === '' || mode === '--inject') return runInject;
  return null;
})();

if (action === null) {
  console.error(`Unknown argument: ${mode}\nUsage: write-telemetry-defaults.ts [--inject|--reset|--check]`);
  process.exit(1);
}

action().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
