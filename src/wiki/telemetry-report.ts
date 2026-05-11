/**
 * Operator-side analysis layer for the shared benchmark telemetry corpus
 * (Benchmark Telemetry Database Roadmap T5).
 *
 * Reads aggregate stats from the Turso libSQL `benchmark_events` table using a read-
 * scoped token the project owner creates separately (so the package's baked-in write-
 * scoped token can never be misused as a credential to query the cohort). This lives
 * in CLI land for the project owner; opt-in users do not read from the cohort.
 *
 * Output shape is JSON-safe so it can be:
 *   1. Piped to a human via `--format text` for quick console scanning.
 *   2. Pasted as the new contents of `docs/public/aggregate-learnings.json` (T6).
 *   3. Diffed week-over-week to see trend movement.
 *
 * The module is fully deterministic given a fetch implementation — tests inject a mock
 * fetch that returns canned libSQL pipeline responses, so no real Turso DB is required
 * to exercise the analysis paths.
 */

export interface TelemetryReportConfig {
  /** Turso base URL (`https://<db>-<org>.turso.io`). Endpoint becomes `<base>/v2/pipeline`. */
  url: string;
  /** Read-scoped Turso auth token. */
  token: string;
  /** Source table name. Defaults to `benchmark_events`. */
  table?: string;
  /** Lookback window in days (rows with `received_at` older than this are excluded). */
  sinceDays?: number;
  /** Override `fetch` for testability. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Override `now` for deterministic windowing in tests. */
  now?: Date;
}

export interface TelemetryReport {
  schemaVersion: 1;
  generatedAt: string;
  /** Wall-clock window the report covers (UTC, ISO 8601). */
  window: { since: string; until: string; days: number };
  /** Number of unique `installation_id` values that uploaded in the window. */
  uniqueInstallations: number;
  /** Number of unique `project_id` values that uploaded in the window. */
  uniqueProjects: number;
  /** Total telemetry_summary rows in the window. */
  uploadCount: number;
  /** Total `eventCount` across all rows in the window — proxies how much real work users did. */
  totalEvents: number;
  /** Total `wikiUpdateCount` across all rows — proxies how much agents wrote back. */
  totalWikiUpdates: number;
  /** Total `acceptedProposalCount` across all rows — proxies how much got promoted/cleaned. */
  totalAcceptedProposals: number;
  /** Latest context page / omitted-page numbers averaged across most-recent-per-installation. */
  latestContext: {
    averagePageCount: number | null;
    averageOmittedPageCount: number | null;
    averageOpenQuestionCount: number | null;
  };
  /** Distinct package versions seen in the window, sorted by upload count desc. */
  packageVersions: Array<{ version: string; uploadCount: number }>;
  /** Distinct client-profile labels seen in the window (claude/codex/cursor/etc.). */
  clientProfiles: Array<{ profile: string; uploadCount: number }>;
  /** Week buckets (`YYYY-Www`) within the window, oldest first. Empty when no rows. */
  weeklyBuckets: Array<{
    week: string;
    uploadCount: number;
    uniqueInstallations: number;
    totalEvents: number;
    totalWikiUpdates: number;
  }>;
}

interface LibsqlRow {
  type: 'text' | 'integer' | 'null' | 'real' | 'blob';
  value?: string;
}

interface LibsqlExecuteResponse {
  type: 'ok';
  response: {
    type: 'execute';
    result: {
      cols: Array<{ name: string }>;
      rows: Array<Array<LibsqlRow>>;
    };
  };
}

interface LibsqlPipelineResponse {
  results: Array<LibsqlExecuteResponse | { type: 'ok'; response: { type: 'close' } }>;
}

function buildSelectRequest(table: string, sinceIso: string): { requests: Array<unknown> } {
  // One row per upload — we'll aggregate in TypeScript rather than do server-side GROUP BY
  // because libSQL pipelines support multiple execute statements but tuning the SQL adds
  // complexity for very modest gains at the expected scale (low thousands of rows).
  const sql = `SELECT installation_id, project_id, package_version, timestamp, received_at, client_profiles, metrics FROM ${table} WHERE received_at >= :since ORDER BY received_at ASC`;
  return {
    requests: [
      {
        type: 'execute',
        stmt: {
          sql,
          named_args: [{ name: 'since', value: { type: 'text', value: sinceIso } }]
        }
      },
      { type: 'close' }
    ]
  };
}

function cellText(row: Array<LibsqlRow>, cols: Array<{ name: string }>, name: string): string {
  const index = cols.findIndex((col) => col.name === name);
  if (index < 0) return '';
  const cell = row[index];
  if (!cell || cell.type === 'null') return '';
  return cell.value ?? '';
}

function isoWeekKey(date: Date): string {
  // ISO 8601 week — Monday-based, week 1 contains the year's first Thursday. Standard for
  // weekly reporting; matches what the Recall Quality panel uses elsewhere.
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = tmp.getUTCDay() === 0 ? 7 : tmp.getUTCDay();
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

interface MetricsShape {
  eventCount?: number;
  wikiUpdateCount?: number;
  acceptedProposalCount?: number;
  latestContextPageCount?: number | null;
  latestContextOmittedPageCount?: number | null;
  latestOpenQuestionCount?: number | null;
}

function safeParseJson<T>(value: string): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export async function buildTelemetryReport(config: TelemetryReportConfig): Promise<TelemetryReport> {
  if (!config.url || !config.token) {
    throw new Error('telemetry-report requires both url and token. Pass DENDRITE_WIKI_TELEMETRY_REPORT_URL and DENDRITE_WIKI_TELEMETRY_REPORT_TOKEN.');
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? new Date();
  const days = Math.max(1, Math.min(config.sinceDays ?? 30, 365));
  const since = new Date(now.getTime() - days * 86_400_000);
  const sinceIso = since.toISOString();
  const table = config.table || 'benchmark_events';
  const endpoint = `${config.url.replace(/\/$/, '')}/v2/pipeline`;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.token}`
    },
    body: JSON.stringify(buildSelectRequest(table, sinceIso))
  });
  if (!response.ok) {
    throw new Error(`telemetry-report upstream returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as LibsqlPipelineResponse;
  const executeResult = body.results.find(
    (r): r is LibsqlExecuteResponse => 'response' in r && r.response.type === 'execute'
  );
  if (!executeResult) {
    throw new Error('telemetry-report upstream returned no execute result');
  }
  const { cols, rows } = executeResult.response.result;

  // Single-pass aggregation. The rows are received_at ASC so weekly buckets are append-only.
  const installationSet = new Set<string>();
  const projectSet = new Set<string>();
  let totalEvents = 0;
  let totalWikiUpdates = 0;
  let totalAcceptedProposals = 0;
  const versionCounts = new Map<string, number>();
  const profileCounts = new Map<string, number>();
  // Track most-recent row per installation so we can average the "latest" context metrics
  // across the cohort without one chatty installation dominating.
  const latestPerInstallation = new Map<string, MetricsShape>();
  const weekBuckets = new Map<string, { uploadCount: number; installations: Set<string>; totalEvents: number; totalWikiUpdates: number }>();

  for (const row of rows) {
    const installationId = cellText(row, cols, 'installation_id');
    if (!installationId) continue;
    installationSet.add(installationId);
    const projectId = cellText(row, cols, 'project_id');
    if (projectId) projectSet.add(projectId);
    const packageVersion = cellText(row, cols, 'package_version');
    if (packageVersion) versionCounts.set(packageVersion, (versionCounts.get(packageVersion) ?? 0) + 1);
    const profilesJson = cellText(row, cols, 'client_profiles');
    const profiles = safeParseJson<string[]>(profilesJson) ?? [];
    for (const profile of profiles) {
      profileCounts.set(profile, (profileCounts.get(profile) ?? 0) + 1);
    }
    const metricsJson = cellText(row, cols, 'metrics');
    const metrics = safeParseJson<MetricsShape>(metricsJson) ?? {};
    totalEvents += metrics.eventCount ?? 0;
    totalWikiUpdates += metrics.wikiUpdateCount ?? 0;
    totalAcceptedProposals += metrics.acceptedProposalCount ?? 0;
    latestPerInstallation.set(installationId, metrics);

    const receivedAt = cellText(row, cols, 'received_at') || cellText(row, cols, 'timestamp');
    if (receivedAt) {
      const date = new Date(receivedAt);
      if (!Number.isNaN(date.getTime())) {
        const week = isoWeekKey(date);
        const bucket = weekBuckets.get(week) ?? {
          uploadCount: 0,
          installations: new Set<string>(),
          totalEvents: 0,
          totalWikiUpdates: 0
        };
        bucket.uploadCount += 1;
        bucket.installations.add(installationId);
        bucket.totalEvents += metrics.eventCount ?? 0;
        bucket.totalWikiUpdates += metrics.wikiUpdateCount ?? 0;
        weekBuckets.set(week, bucket);
      }
    }
  }

  const pageValues: number[] = [];
  const omittedValues: number[] = [];
  const openQuestionValues: number[] = [];
  for (const metrics of latestPerInstallation.values()) {
    if (typeof metrics.latestContextPageCount === 'number') pageValues.push(metrics.latestContextPageCount);
    if (typeof metrics.latestContextOmittedPageCount === 'number') omittedValues.push(metrics.latestContextOmittedPageCount);
    if (typeof metrics.latestOpenQuestionCount === 'number') openQuestionValues.push(metrics.latestOpenQuestionCount);
  }

  const packageVersions = Array.from(versionCounts.entries())
    .map(([version, uploadCount]) => ({ version, uploadCount }))
    .sort((left, right) => right.uploadCount - left.uploadCount || left.version.localeCompare(right.version));
  const clientProfiles = Array.from(profileCounts.entries())
    .map(([profile, uploadCount]) => ({ profile, uploadCount }))
    .sort((left, right) => right.uploadCount - left.uploadCount || left.profile.localeCompare(right.profile));
  const weeklyBuckets = Array.from(weekBuckets.entries())
    .map(([week, bucket]) => ({
      week,
      uploadCount: bucket.uploadCount,
      uniqueInstallations: bucket.installations.size,
      totalEvents: bucket.totalEvents,
      totalWikiUpdates: bucket.totalWikiUpdates
    }))
    .sort((left, right) => left.week.localeCompare(right.week));

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    window: { since: sinceIso, until: now.toISOString(), days },
    uniqueInstallations: installationSet.size,
    uniqueProjects: projectSet.size,
    uploadCount: rows.length,
    totalEvents,
    totalWikiUpdates,
    totalAcceptedProposals,
    latestContext: {
      averagePageCount: averageOrNull(pageValues),
      averageOmittedPageCount: averageOrNull(omittedValues),
      averageOpenQuestionCount: averageOrNull(openQuestionValues)
    },
    packageVersions,
    clientProfiles,
    weeklyBuckets
  };
}

export function formatTelemetryReportAsText(report: TelemetryReport): string {
  const lines: string[] = [];
  lines.push('Dendrite Wiki MCP — telemetry cohort report');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Window: ${report.window.since} → ${report.window.until} (${report.window.days} days)`);
  lines.push('');
  lines.push(`Unique installations: ${report.uniqueInstallations}`);
  lines.push(`Unique projects:      ${report.uniqueProjects}`);
  lines.push(`Total uploads:        ${report.uploadCount}`);
  lines.push(`Total events:         ${report.totalEvents}`);
  lines.push(`Total wiki updates:   ${report.totalWikiUpdates}`);
  lines.push(`Accepted proposals:   ${report.totalAcceptedProposals}`);
  lines.push('');
  if (report.latestContext.averagePageCount !== null) {
    lines.push(`Latest context (averaged across most-recent-per-installation):`);
    lines.push(`  avg pages:           ${report.latestContext.averagePageCount}`);
    lines.push(`  avg omitted pages:   ${report.latestContext.averageOmittedPageCount ?? '—'}`);
    lines.push(`  avg open questions:  ${report.latestContext.averageOpenQuestionCount ?? '—'}`);
    lines.push('');
  }
  if (report.packageVersions.length > 0) {
    lines.push('Package versions:');
    for (const entry of report.packageVersions.slice(0, 5)) {
      lines.push(`  ${entry.version}  (${entry.uploadCount} upload${entry.uploadCount === 1 ? '' : 's'})`);
    }
    if (report.packageVersions.length > 5) {
      lines.push(`  … ${report.packageVersions.length - 5} more`);
    }
    lines.push('');
  }
  if (report.clientProfiles.length > 0) {
    lines.push('Client profiles:');
    for (const entry of report.clientProfiles) {
      lines.push(`  ${entry.profile}  (${entry.uploadCount} upload${entry.uploadCount === 1 ? '' : 's'})`);
    }
    lines.push('');
  }
  if (report.weeklyBuckets.length > 0) {
    lines.push('Weekly breakdown (uploads / unique installations / total events):');
    for (const entry of report.weeklyBuckets) {
      lines.push(`  ${entry.week}: ${entry.uploadCount} / ${entry.uniqueInstallations} / ${entry.totalEvents}`);
    }
  } else {
    lines.push('No uploads in the configured window.');
  }
  return lines.join('\n');
}
