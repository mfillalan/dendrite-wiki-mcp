import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTelemetryReport,
  formatTelemetryReportAsText,
  type TelemetryReport
} from '@dendrite/wiki';

interface LibsqlRow {
  type: 'text' | 'integer' | 'null';
  value?: string;
}

function makeRow(values: Record<string, string>): Array<LibsqlRow> {
  const cols = ['installation_id', 'project_id', 'package_version', 'timestamp', 'received_at', 'client_profiles', 'metrics'];
  return cols.map((name) => ({ type: 'text' as const, value: values[name] ?? '' }));
}

function makeMockResponse(rows: Array<Record<string, string>>): Response {
  const body = {
    results: [
      {
        type: 'ok',
        response: {
          type: 'execute',
          result: {
            cols: [
              { name: 'installation_id' },
              { name: 'project_id' },
              { name: 'package_version' },
              { name: 'timestamp' },
              { name: 'received_at' },
              { name: 'client_profiles' },
              { name: 'metrics' }
            ],
            rows: rows.map(makeRow)
          }
        }
      },
      { type: 'ok', response: { type: 'close' } }
    ]
  };
  return new Response(JSON.stringify(body), { status: 200 });
}

test('T5: buildTelemetryReport rejects when url or token is missing', async () => {
  await assert.rejects(
    () => buildTelemetryReport({ url: '', token: 'x' }),
    /requires both url and token/
  );
  await assert.rejects(
    () => buildTelemetryReport({ url: 'https://x', token: '' }),
    /requires both url and token/
  );
});

test('T5: buildTelemetryReport sends SELECT to /v2/pipeline with Bearer auth and parameterized since', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  await buildTelemetryReport({
    url: 'https://example-db-org.turso.io',
    token: 'read-token',
    sinceDays: 7,
    now: new Date('2026-05-11T00:00:00.000Z'),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return makeMockResponse([]);
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://example-db-org.turso.io/v2/pipeline');
  const headers = (calls[0]?.init?.headers as Record<string, string>) ?? {};
  assert.equal(headers.authorization, 'Bearer read-token');
  const body = JSON.parse(String(calls[0]?.init?.body)) as { requests: Array<{ type: string; stmt?: { sql: string; named_args: Array<{ name: string; value: { value: string } }> } }> };
  assert.equal(body.requests.length, 2);
  assert.equal(body.requests[0].type, 'execute');
  assert.equal(body.requests[1].type, 'close');
  assert.match(body.requests[0].stmt?.sql ?? '', /SELECT.*FROM benchmark_events.*received_at >= :since/);
  // 7 days before 2026-05-11 = 2026-05-04
  const sinceArg = body.requests[0].stmt?.named_args.find((arg) => arg.name === 'since');
  assert.equal(sinceArg?.value.value, '2026-05-04T00:00:00.000Z');
});

test('T5: buildTelemetryReport aggregates uploads, distinct installations, totals, and weekly buckets', async () => {
  const report = await buildTelemetryReport({
    url: 'https://example-db-org.turso.io',
    token: 'read-token',
    sinceDays: 30,
    now: new Date('2026-05-11T00:00:00.000Z'),
    fetchImpl: async () =>
      makeMockResponse([
        {
          installation_id: 'inst_a',
          project_id: 'proj_a',
          package_version: '0.4.0-alpha.1',
          timestamp: '2026-05-01T12:00:00.000Z',
          received_at: '2026-05-01T12:00:00.000Z',
          client_profiles: JSON.stringify(['claude']),
          metrics: JSON.stringify({ eventCount: 10, wikiUpdateCount: 4, acceptedProposalCount: 1, latestContextPageCount: 5, latestContextOmittedPageCount: 2, latestOpenQuestionCount: 1 })
        },
        {
          installation_id: 'inst_a',
          project_id: 'proj_a',
          package_version: '0.4.0-alpha.1',
          timestamp: '2026-05-02T12:00:00.000Z',
          received_at: '2026-05-02T12:00:00.000Z',
          client_profiles: JSON.stringify(['claude', 'codex']),
          metrics: JSON.stringify({ eventCount: 15, wikiUpdateCount: 6, acceptedProposalCount: 2, latestContextPageCount: 6, latestContextOmittedPageCount: 1, latestOpenQuestionCount: 0 })
        },
        {
          installation_id: 'inst_b',
          project_id: 'proj_b',
          package_version: '0.4.0-alpha.2',
          timestamp: '2026-05-08T12:00:00.000Z',
          received_at: '2026-05-08T12:00:00.000Z',
          client_profiles: JSON.stringify(['cursor']),
          metrics: JSON.stringify({ eventCount: 5, wikiUpdateCount: 1, acceptedProposalCount: 0, latestContextPageCount: 3, latestContextOmittedPageCount: 0, latestOpenQuestionCount: 2 })
        }
      ])
  });
  assert.equal(report.uniqueInstallations, 2);
  assert.equal(report.uniqueProjects, 2);
  assert.equal(report.uploadCount, 3);
  assert.equal(report.totalEvents, 30);
  assert.equal(report.totalWikiUpdates, 11);
  assert.equal(report.totalAcceptedProposals, 3);

  // latest-per-installation averaging: inst_a's latest is row 2 (page=6), inst_b is row 3 (page=3) → avg 4.5
  assert.equal(report.latestContext.averagePageCount, 4.5);
  assert.equal(report.latestContext.averageOmittedPageCount, 0.5);
  assert.equal(report.latestContext.averageOpenQuestionCount, 1);

  // packageVersions sorted by upload count desc
  assert.deepEqual(report.packageVersions, [
    { version: '0.4.0-alpha.1', uploadCount: 2 },
    { version: '0.4.0-alpha.2', uploadCount: 1 }
  ]);

  // clientProfiles sorted by upload count desc — claude appears in 2 rows, codex in 1, cursor in 1
  assert.deepEqual(report.clientProfiles, [
    { profile: 'claude', uploadCount: 2 },
    { profile: 'codex', uploadCount: 1 },
    { profile: 'cursor', uploadCount: 1 }
  ]);

  // weeklyBuckets: rows fall in W18 (2026-05-01, 2026-05-02) and W19 (2026-05-08)
  assert.equal(report.weeklyBuckets.length, 2);
  assert.equal(report.weeklyBuckets[0].week, '2026-W18');
  assert.equal(report.weeklyBuckets[0].uploadCount, 2);
  assert.equal(report.weeklyBuckets[0].uniqueInstallations, 1);
  assert.equal(report.weeklyBuckets[0].totalEvents, 25);
  assert.equal(report.weeklyBuckets[1].week, '2026-W19');
});

test('T5: buildTelemetryReport handles empty result set cleanly', async () => {
  const report = await buildTelemetryReport({
    url: 'https://example-db-org.turso.io',
    token: 'read-token',
    sinceDays: 30,
    now: new Date('2026-05-11T00:00:00.000Z'),
    fetchImpl: async () => makeMockResponse([])
  });
  assert.equal(report.uniqueInstallations, 0);
  assert.equal(report.uploadCount, 0);
  assert.equal(report.latestContext.averagePageCount, null);
  assert.deepEqual(report.packageVersions, []);
  assert.deepEqual(report.weeklyBuckets, []);
});

test('T5: buildTelemetryReport surfaces HTTP errors with the status code', async () => {
  await assert.rejects(
    () =>
      buildTelemetryReport({
        url: 'https://example-db-org.turso.io',
        token: 'read-token',
        fetchImpl: async () => new Response('', { status: 401 })
      }),
    /HTTP 401/
  );
});

test('T5: formatTelemetryReportAsText produces a human-scannable summary', () => {
  const report: TelemetryReport = {
    schemaVersion: 1,
    generatedAt: '2026-05-11T00:00:00.000Z',
    window: { since: '2026-04-11T00:00:00.000Z', until: '2026-05-11T00:00:00.000Z', days: 30 },
    uniqueInstallations: 2,
    uniqueProjects: 2,
    uploadCount: 3,
    totalEvents: 30,
    totalWikiUpdates: 11,
    totalAcceptedProposals: 3,
    latestContext: { averagePageCount: 4.5, averageOmittedPageCount: 0.5, averageOpenQuestionCount: 1 },
    packageVersions: [{ version: '0.4.0-alpha.1', uploadCount: 2 }],
    clientProfiles: [{ profile: 'claude', uploadCount: 2 }],
    weeklyBuckets: [
      { week: '2026-W18', uploadCount: 2, uniqueInstallations: 1, totalEvents: 25, totalWikiUpdates: 10 },
      { week: '2026-W19', uploadCount: 1, uniqueInstallations: 1, totalEvents: 5, totalWikiUpdates: 1 }
    ]
  };
  const text = formatTelemetryReportAsText(report);
  assert.match(text, /Unique installations: 2/);
  assert.match(text, /Total uploads:\s+3/);
  assert.match(text, /Total events:\s+30/);
  assert.match(text, /avg pages:\s+4\.5/);
  assert.match(text, /0\.4\.0-alpha\.1/);
  assert.match(text, /2026-W18: 2 \/ 1 \/ 25/);
});

test('T5: empty-cohort text output names the no-data state explicitly', () => {
  const report: TelemetryReport = {
    schemaVersion: 1,
    generatedAt: '2026-05-11T00:00:00.000Z',
    window: { since: '2026-04-11T00:00:00.000Z', until: '2026-05-11T00:00:00.000Z', days: 30 },
    uniqueInstallations: 0,
    uniqueProjects: 0,
    uploadCount: 0,
    totalEvents: 0,
    totalWikiUpdates: 0,
    totalAcceptedProposals: 0,
    latestContext: { averagePageCount: null, averageOmittedPageCount: null, averageOpenQuestionCount: null },
    packageVersions: [],
    clientProfiles: [],
    weeklyBuckets: []
  };
  const text = formatTelemetryReportAsText(report);
  assert.match(text, /No uploads in the configured window/);
});
