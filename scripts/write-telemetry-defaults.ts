#!/usr/bin/env tsx
/**
 * Publish-time injection of baked-in Dendrite-hosted telemetry destination defaults.
 *
 * The source-tree `src/wiki/telemetry-defaults.ts` ships EMPTY by design — neither
 * the production write-scoped Turso token (used by every opt-in user's upload path)
 * nor the production read-scoped Turso token (used by the public cohort dashboard
 * at /wiki/aggregate-learnings) may enter git history. This script writes the real
 * values into that file from environment-only secrets just before `npm publish`
 * packs the tarball, and `postpublish` resets it back to empty.
 *
 * Wired via `prepublishOnly` and `postpublish` in package.json. Local `npm pack` does
 * NOT trigger the injection (prepack runs `npm run check`, which excludes this script).
 *
 * Brain-Faithfulness follow-up: see
 * [Benchmark Telemetry Database Roadmap](../docs/wiki/benchmark-telemetry-database-roadmap.md)
 * for the credential-strategy rationale (Option A — bake write-scoped token, with a
 * deliberate transparency call for the read token in T13).
 *
 * Usage:
 *
 *   write-telemetry-defaults.ts          # inject from env vars (default; for prepublishOnly)
 *   write-telemetry-defaults.ts --reset  # restore empty values (for postpublish)
 *   write-telemetry-defaults.ts --check  # print current file state, no writes
 *
 * Required env vars when injecting:
 *   DENDRITE_TELEMETRY_PUBLISH_URL          Turso base URL (e.g. https://my-db-org.turso.io)
 *   DENDRITE_TELEMETRY_PUBLISH_TOKEN        Write-scoped Turso auth token
 *
 * Optional env vars when injecting (T13 read-side):
 *   DENDRITE_TELEMETRY_PUBLISH_TABLE        Override default table name
 *   DENDRITE_TELEMETRY_PUBLISH_REPORT_URL   Same Turso DB URL (typically identical to URL above)
 *   DENDRITE_TELEMETRY_PUBLISH_REPORT_TOKEN Read-scoped Turso auth token for the public cohort dashboard
 *   DENDRITE_TELEMETRY_PUBLISH_REPORT_TABLE Override default report table name
 *
 * When the report pair is omitted, the published package ships with an unconfigured
 * read path — the dashboard falls back to the committed JSON snapshot, which is still
 * a valid public-credibility surface, just not live.
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
  reportUrl: string;
  reportToken: string;
  reportTable: string;
}

function buildDefaultsFile(values: ParsedDefaults): string {
  return `/**
 * Baked-in fallback constants for the opt-in benchmark telemetry destination
 * (Brain-Faithfulness follow-up track — Benchmark Telemetry Database Roadmap T2/T13).
 *
 * **This file ships EMPTY in source.** The published npm package contains the real
 * values, written at publish time by \`scripts/write-telemetry-defaults.ts\` from
 * environment-only secrets in the release pipeline. The git source tree must never
 * carry production tokens — see [Benchmark Telemetry Database Roadmap](../../docs/wiki/benchmark-telemetry-database-roadmap.md)
 * Gap 1 for the credential-strategy rationale.
 *
 * Two scoped pairs:
 *
 *   - **Write pair (T2)**: \`TELEMETRY_DEFAULT_URL\` + \`_TOKEN\` power the opt-in
 *     upload path. Write-scoped on Turso so the worst-case extraction is write-quota
 *     abuse, recoverable via patch-release token rotation.
 *   - **Read pair (T13)**: \`TELEMETRY_DEFAULT_REPORT_URL\` + \`_REPORT_TOKEN\` power
 *     the public cohort dashboard at /wiki/aggregate-learnings. Read-scoped — anyone
 *     who extracts it can query the cohort. That is the deliberate transparency
 *     call documented in the roadmap.
 *
 * Runtime resolution order (in \`resolveLibsqlUploadTarget\` and the bridge's
 * /telemetry/report endpoint):
 *
 *   1. Env vars (\`DENDRITE_WIKI_TELEMETRY_TURSO_URL\` + \`_TOKEN\` for upload;
 *      \`DENDRITE_WIKI_TELEMETRY_REPORT_URL\` + \`_TOKEN\` for the dashboard).
 *      BYO destination wins over baked defaults.
 *   2. These constants (Dendrite-hosted destination, baked at publish time).
 *   3. Neither → upload returns \`skipped\`; dashboard falls back to the committed JSON.
 *
 * Local development: keep all six empty. Run with the env-var pairs set against
 * your own scratch Turso database when you need to exercise either path end-to-end.
 */

/** Turso libSQL database base URL for OPT-IN uploads. Empty in source. */
export const TELEMETRY_DEFAULT_URL = ${JSON.stringify(values.url)};

/** Write-scoped Turso auth token. Empty in source; written at publish time only. */
export const TELEMETRY_DEFAULT_TOKEN = ${JSON.stringify(values.token)};

/** Table name for the INSERT. Falls back to \`benchmark_events\` if empty. */
export const TELEMETRY_DEFAULT_TABLE = ${JSON.stringify(values.table)};

/** Turso libSQL database base URL for the public cohort DASHBOARD. Empty in source. */
export const TELEMETRY_DEFAULT_REPORT_URL = ${JSON.stringify(values.reportUrl)};

/** Read-scoped Turso auth token. Empty in source; written at publish time only. */
export const TELEMETRY_DEFAULT_REPORT_TOKEN = ${JSON.stringify(values.reportToken)};

/** Table name for the SELECT. Falls back to \`benchmark_events\` if empty. */
export const TELEMETRY_DEFAULT_REPORT_TABLE = ${JSON.stringify(values.reportTable)};
`;
}

function readEnvOrThrow(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Required env var ${name} is not set or is empty. Refusing to write telemetry defaults.`);
  }
  return value;
}

function readEnvOptional(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function validateTursoHttpsUrl(envName: string, url: string): void {
  if (url.startsWith('libsql://')) {
    throw new Error(
      `${envName} must use the https:// scheme, not libsql://. Turso shows the native protocol URL by default; the HTTPS form has the same hostname. Got: ${url}`
    );
  }
  if (!/^https:\/\/[a-z0-9.-]+\.turso\.io$/i.test(url)) {
    throw new Error(
      `${envName} must be an HTTPS Turso URL (e.g. https://<db>-<org>.turso.io or https://<db>-<org>.aws-<region>.turso.io). Got: ${url}`
    );
  }
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
    table: matchString('TELEMETRY_DEFAULT_TABLE'),
    reportUrl: matchString('TELEMETRY_DEFAULT_REPORT_URL'),
    reportToken: matchString('TELEMETRY_DEFAULT_REPORT_TOKEN'),
    reportTable: matchString('TELEMETRY_DEFAULT_REPORT_TABLE')
  };
}

function describeToken(token: string): string {
  return token ? `${token.slice(0, 6)}…${token.slice(-4)} (${token.length} chars)` : '(empty)';
}

function describeDefaults(values: ParsedDefaults): string {
  return [
    `  Write URL:    ${values.url || '(empty)'}`,
    `  Write Token:  ${describeToken(values.token)}`,
    `  Write Table:  ${values.table || '(empty — defaults to benchmark_events at runtime)'}`,
    `  Report URL:   ${values.reportUrl || '(empty — public dashboard falls back to committed JSON)'}`,
    `  Report Token: ${describeToken(values.reportToken)}`,
    `  Report Table: ${values.reportTable || '(empty — defaults to benchmark_events at runtime)'}`
  ].join('\n');
}

async function runInject(): Promise<void> {
  // Write pair is required — the package must be able to accept opt-in uploads.
  const url = readEnvOrThrow('DENDRITE_TELEMETRY_PUBLISH_URL');
  validateTursoHttpsUrl('DENDRITE_TELEMETRY_PUBLISH_URL', url);
  const token = readEnvOrThrow('DENDRITE_TELEMETRY_PUBLISH_TOKEN');
  const table = readEnvOptional('DENDRITE_TELEMETRY_PUBLISH_TABLE');

  // Read pair is optional. When omitted, the published package's dashboard falls
  // back to the committed JSON snapshot. When present, both URL and TOKEN are required
  // together — half-configured won't work and is more confusing than no config.
  const reportUrl = readEnvOptional('DENDRITE_TELEMETRY_PUBLISH_REPORT_URL');
  const reportToken = readEnvOptional('DENDRITE_TELEMETRY_PUBLISH_REPORT_TOKEN');
  const reportTable = readEnvOptional('DENDRITE_TELEMETRY_PUBLISH_REPORT_TABLE');
  if ((reportUrl && !reportToken) || (!reportUrl && reportToken)) {
    throw new Error(
      'DENDRITE_TELEMETRY_PUBLISH_REPORT_URL and DENDRITE_TELEMETRY_PUBLISH_REPORT_TOKEN must be set together, or both omitted. Got url=' + (reportUrl ? 'set' : 'empty') + ', token=' + (reportToken ? 'set' : 'empty') + '.'
    );
  }
  if (reportUrl) {
    validateTursoHttpsUrl('DENDRITE_TELEMETRY_PUBLISH_REPORT_URL', reportUrl);
  }

  const existing = await readCurrentDefaults();
  if (existing.url || existing.token || existing.reportUrl || existing.reportToken) {
    throw new Error(
      `telemetry-defaults.ts already contains non-empty values. Refusing to overwrite — run with --reset first if this is intentional.\nCurrent state:\n${describeDefaults(existing)}`
    );
  }

  const next: ParsedDefaults = { url, token, table, reportUrl, reportToken, reportTable };
  await fs.writeFile(targetPath, buildDefaultsFile(next), 'utf8');
  console.log('[telemetry-defaults] Injected publish-time defaults:');
  console.log(describeDefaults(next));
  console.log(`[telemetry-defaults] Wrote ${path.relative(repoRoot, targetPath)}`);
}

async function runReset(): Promise<void> {
  const empty: ParsedDefaults = { url: '', token: '', table: '', reportUrl: '', reportToken: '', reportTable: '' };
  await fs.writeFile(targetPath, buildDefaultsFile(empty), 'utf8');
  console.log('[telemetry-defaults] Reset to empty source-tree state.');
  console.log(describeDefaults(empty));
  console.log(`[telemetry-defaults] Wrote ${path.relative(repoRoot, targetPath)}`);
}

async function runCheck(): Promise<void> {
  const current = await readCurrentDefaults();
  console.log('[telemetry-defaults] Current file state:');
  console.log(describeDefaults(current));
  if (current.url || current.token || current.reportUrl || current.reportToken) {
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
