import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTelemetrySharingMode, uploadTelemetry, writeTelemetryStatusArtifact } from '@dendrite/wiki';

test('telemetry status defaults to local-only off and mirrors local benchmark summary data', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-telemetry-'));

  try {
    const summaryPath = path.join(tempRoot, 'docs', 'public', 'dendrite-benchmark-events-summary.json');
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(
      summaryPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: '2026-05-03T12:00:00.000Z',
          eventCount: 3,
          logPath: 'local-data/benchmark-events.jsonl',
          byType: {
            session_started: 1,
            context_requested: 1,
            wiki_updated: 1,
            maintenance_state_changed: 0,
            session_snapshot: 0
          },
          usage: {
            sessionStartedCount: 1,
            contextRequestCount: 1,
            wikiUpdateCount: 1,
            maintenanceStateChangeCount: 0,
            sessionSnapshotCount: 0
          },
          orientation: {
            latestContextPageCount: 4,
            latestContextOmittedPageCount: 2,
            latestOpenQuestionCount: 1
          },
          maintenance: {
            acceptedProposalCount: 0,
            latestLintFindingCount: 0,
            latestProposalCount: 0
          },
          recentEvents: [
            { timestamp: '2026-05-03T12:00:00.000Z', event: 'session_started', trigger: 'server' },
            { timestamp: '2026-05-03T12:05:00.000Z', event: 'context_requested', trigger: 'wiki_context' },
            { timestamp: '2026-05-03T12:10:00.000Z', event: 'wiki_updated', trigger: 'wiki_write' }
          ]
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const status = await writeTelemetryStatusArtifact(tempRoot);
    assert.equal(status.sharingMode, 'off');
    assert.equal(status.sharingEnabled, false);
    assert.equal(status.consent.isExplicit, false);
    assert.equal(status.benchmarkEvents.eventCount, 3);
    assert.equal(status.benchmarkEvents.latestEventAt, '2026-05-03T12:10:00.000Z');
    assert.equal(status.paths.statusArtifactPath, 'docs/public/dendrite-telemetry-status.json');
    assert.equal(status.paths.uploadAuditPath, 'local-data/telemetry-upload-audit.json');

    const written = JSON.parse(
      await fs.readFile(path.join(tempRoot, 'docs', 'public', 'dendrite-telemetry-status.json'), 'utf8')
    ) as {
      benchmarkEvents: { eventCount: number };
    };
    assert.equal(written.benchmarkEvents.eventCount, 3);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('telemetry opt-in and opt-out persist explicit local consent', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-telemetry-consent-'));

  try {
    const optedIn = await setTelemetrySharingMode('opt-in', tempRoot);
    assert.equal(optedIn.sharingMode, 'opt-in');
    assert.equal(optedIn.sharingEnabled, true);
    assert.equal(optedIn.consent.isExplicit, true);

    const configPath = path.join(tempRoot, 'local-data', 'telemetry.json');
    const configAfterOptIn = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      sharingMode: string;
      installationId: string;
      projectId: string;
    };
    assert.equal(configAfterOptIn.sharingMode, 'opt-in');
    assert.ok(configAfterOptIn.installationId.length > 0);
    assert.ok(configAfterOptIn.projectId.length > 0);

    const optedOut = await setTelemetrySharingMode('off', tempRoot);
    assert.equal(optedOut.sharingMode, 'off');
    assert.equal(optedOut.sharingEnabled, false);
    assert.equal(optedOut.consent.isExplicit, true);

    const configAfterOptOut = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      sharingMode: string;
    };
    assert.equal(configAfterOptOut.sharingMode, 'off');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('telemetry upload writes an audit artifact and sends a sanitized Turso libSQL pipeline when opted in', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-telemetry-upload-'));
  const previousUrl = process.env.DENDRITE_WIKI_TELEMETRY_TURSO_URL;
  const previousKey = process.env.DENDRITE_WIKI_TELEMETRY_TURSO_TOKEN;
  const previousTable = process.env.DENDRITE_WIKI_TELEMETRY_TURSO_TABLE;
  const previousProfiles = process.env.DENDRITE_WIKI_TELEMETRY_CLIENT_PROFILES;

  try {
    const summaryPath = path.join(tempRoot, 'docs', 'public', 'dendrite-benchmark-events-summary.json');
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(
      summaryPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: '2026-05-03T12:00:00.000Z',
          eventCount: 4,
          logPath: 'local-data/benchmark-events.jsonl',
          byType: {
            session_started: 1,
            context_requested: 1,
            wiki_updated: 2,
            maintenance_state_changed: 0,
            session_snapshot: 0
          },
          usage: {
            sessionStartedCount: 1,
            contextRequestCount: 1,
            wikiUpdateCount: 2,
            maintenanceStateChangeCount: 0,
            sessionSnapshotCount: 0
          },
          orientation: {
            latestContextPageCount: 5,
            latestContextOmittedPageCount: 1,
            latestOpenQuestionCount: 0
          },
          maintenance: {
            acceptedProposalCount: 1,
            latestLintFindingCount: 0,
            latestProposalCount: 0
          },
          recentEvents: [
            { timestamp: '2026-05-03T12:00:00.000Z', event: 'session_started', trigger: 'server' },
            { timestamp: '2026-05-03T12:10:00.000Z', event: 'wiki_updated', trigger: 'wiki_write' }
          ]
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    await setTelemetrySharingMode('opt-in', tempRoot);
    process.env.DENDRITE_WIKI_TELEMETRY_TURSO_URL = 'https://example-db-org.turso.io';
    process.env.DENDRITE_WIKI_TELEMETRY_TURSO_TOKEN = 'test-token';
    process.env.DENDRITE_WIKI_TELEMETRY_TURSO_TABLE = 'benchmark_events';
    process.env.DENDRITE_WIKI_TELEMETRY_CLIENT_PROFILES = 'claude,codex';

    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const result = await uploadTelemetry({
      root: tempRoot,
      packageVersion: '0.1.0-test',
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        // libSQL responds 200 with a results array on success.
        return new Response(JSON.stringify({ results: [{ type: 'ok' }, { type: 'ok' }] }), { status: 200 });
      }
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://example-db-org.turso.io/v2/pipeline');
    assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, 'Bearer test-token');
    // libSQL HTTP doesn't use the Supabase-style apikey header; only Bearer.
    assert.equal((calls[0]?.init?.headers as Record<string, string>).apikey, undefined);

    const requestBody = JSON.parse(String(calls[0]?.init?.body)) as {
      requests: Array<{
        type: string;
        stmt?: { sql: string; named_args: Array<{ name: string; value: { type: string; value?: string } }> };
      }>;
    };
    assert.equal(requestBody.requests.length, 2);
    assert.equal(requestBody.requests[0].type, 'execute');
    assert.equal(requestBody.requests[1].type, 'close');
    const stmt = requestBody.requests[0].stmt;
    assert.ok(stmt);
    assert.match(stmt.sql, /INSERT INTO benchmark_events/);
    assert.match(stmt.sql, /:installation_id/);
    const argByName = (name: string) => stmt.named_args.find((arg) => arg.name === name);
    assert.equal(argByName('package_version')?.value.value, '0.1.0-test');
    assert.equal(argByName('event')?.value.value, 'telemetry_summary');
    assert.equal(argByName('sharing_mode')?.value.value, 'opt-in');
    // clientProfiles and metrics are JSON-serialized into TEXT columns
    assert.deepEqual(JSON.parse(argByName('client_profiles')?.value.value ?? ''), ['claude', 'codex']);
    const metrics = JSON.parse(argByName('metrics')?.value.value ?? '') as { eventCount: number; wikiUpdateCount: number; acceptedProposalCount: number };
    assert.equal(metrics.eventCount, 4);
    assert.equal(metrics.wikiUpdateCount, 2);
    assert.equal(metrics.acceptedProposalCount, 1);

    const audit = JSON.parse(await fs.readFile(path.join(tempRoot, 'local-data', 'telemetry-upload-audit.json'), 'utf8')) as {
      lastAttempt: { status: string; payload: { event: string } };
      lastSuccess: { status: string };
    };
    assert.equal(audit.lastAttempt.status, 'success');
    assert.equal(audit.lastAttempt.payload.event, 'telemetry_summary');
    assert.equal(audit.lastSuccess.status, 'success');

    const status = JSON.parse(
      await fs.readFile(path.join(tempRoot, 'docs', 'public', 'dendrite-telemetry-status.json'), 'utf8')
    ) as {
      remoteUpload: {
        configured: boolean;
        destination: string;
        lastAttemptStatus: string;
        lastPayloadPreview: { event: string };
      };
    };
    assert.equal(status.remoteUpload.configured, true);
    assert.equal(status.remoteUpload.destination, 'https://example-db-org.turso.io/v2/pipeline');
    assert.equal(status.remoteUpload.lastAttemptStatus, 'success');
    assert.equal(status.remoteUpload.lastPayloadPreview.event, 'telemetry_summary');
  } finally {
    if (previousUrl === undefined) {
      delete process.env.DENDRITE_WIKI_TELEMETRY_TURSO_URL;
    } else {
      process.env.DENDRITE_WIKI_TELEMETRY_TURSO_URL = previousUrl;
    }
    if (previousKey === undefined) {
      delete process.env.DENDRITE_WIKI_TELEMETRY_TURSO_TOKEN;
    } else {
      process.env.DENDRITE_WIKI_TELEMETRY_TURSO_TOKEN = previousKey;
    }
    if (previousTable === undefined) {
      delete process.env.DENDRITE_WIKI_TELEMETRY_TURSO_TABLE;
    } else {
      process.env.DENDRITE_WIKI_TELEMETRY_TURSO_TABLE = previousTable;
    }
    if (previousProfiles === undefined) {
      delete process.env.DENDRITE_WIKI_TELEMETRY_CLIENT_PROFILES;
    } else {
      process.env.DENDRITE_WIKI_TELEMETRY_CLIENT_PROFILES = previousProfiles;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});