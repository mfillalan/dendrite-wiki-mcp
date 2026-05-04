import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTelemetrySharingMode, writeTelemetryStatusArtifact } from '../src/wiki/telemetry.js';

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
    };
    assert.equal(configAfterOptIn.sharingMode, 'opt-in');

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