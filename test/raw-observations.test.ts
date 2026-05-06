import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  captureRawObservation,
  classifyObservationKind,
  detectRawObservationClusters,
  enforceRawObservationsRetention,
  isRawObservationsCaptureEnabled,
  readRawObservations,
  resolveRawObservationsPath
} from '../src/wiki/raw-observations.js';
import { buildMaintenanceInboxPage, buildMaintenanceInboxSnapshot, findMaintenanceInboxAction } from '../src/wiki/maintenance-inbox.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runCapture(cwd: string, payload: unknown, env: NodeJS.ProcessEnv = {}): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', cliPath, 'observations:capture'], {
      cwd,
      env: { ...process.env, NO_COLOR: '1', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code }));
    child.stdin.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
}

test('captureRawObservation appends a JSONL record and readRawObservations parses it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-raw-obs-'));
  const observation = await captureRawObservation(
    {
      tool: 'Edit',
      target: 'src/foo.ts',
      summary: 'rename helper',
      outcome: 'ok',
      sessionId: 'sess-1'
    },
    root
  );
  assert.ok(observation, 'capture should return the observation');
  assert.equal(observation.kind, 'edit');
  assert.equal(observation.tool, 'Edit');
  assert.equal(observation.target, 'src/foo.ts');
  assert.equal(observation.outcome, 'ok');
  assert.equal(observation.sessionId, 'sess-1');

  const list = await readRawObservations({ root });
  assert.equal(list.length, 1);
  assert.equal(list[0]?.tool, 'Edit');
  assert.equal(list[0]?.kind, 'edit');
});

test('classifyObservationKind maps known tools to deterministic kinds', () => {
  assert.equal(classifyObservationKind('Edit'), 'edit');
  assert.equal(classifyObservationKind('Write'), 'edit');
  assert.equal(classifyObservationKind('MultiEdit'), 'edit');
  assert.equal(classifyObservationKind('Read'), 'read');
  assert.equal(classifyObservationKind('Bash'), 'command');
  assert.equal(classifyObservationKind('PowerShell'), 'command');
  assert.equal(classifyObservationKind('Grep'), 'search');
  assert.equal(classifyObservationKind('Glob'), 'search');
  assert.equal(classifyObservationKind('WebFetch'), 'web');
  assert.equal(classifyObservationKind('WebSearch'), 'web');
  assert.equal(classifyObservationKind('TodoWrite'), 'other');
});

test('isRawObservationsCaptureEnabled honors DENDRITE_RAW_OBSERVATIONS env values', () => {
  const original = process.env.DENDRITE_RAW_OBSERVATIONS;
  try {
    process.env.DENDRITE_RAW_OBSERVATIONS = 'off';
    assert.equal(isRawObservationsCaptureEnabled(), false);
    process.env.DENDRITE_RAW_OBSERVATIONS = 'false';
    assert.equal(isRawObservationsCaptureEnabled(), false);
    process.env.DENDRITE_RAW_OBSERVATIONS = '0';
    assert.equal(isRawObservationsCaptureEnabled(), false);
    process.env.DENDRITE_RAW_OBSERVATIONS = 'on';
    assert.equal(isRawObservationsCaptureEnabled(), true);
    delete process.env.DENDRITE_RAW_OBSERVATIONS;
    assert.equal(isRawObservationsCaptureEnabled(), true);
  } finally {
    if (original === undefined) {
      delete process.env.DENDRITE_RAW_OBSERVATIONS;
    } else {
      process.env.DENDRITE_RAW_OBSERVATIONS = original;
    }
  }
});

test('captureRawObservation returns undefined when DENDRITE_RAW_OBSERVATIONS=off', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-raw-obs-optout-'));
  const original = process.env.DENDRITE_RAW_OBSERVATIONS;
  try {
    process.env.DENDRITE_RAW_OBSERVATIONS = 'off';
    const observation = await captureRawObservation({ tool: 'Edit', target: 'x.ts' }, root);
    assert.equal(observation, undefined);
    const list = await readRawObservations({ root });
    assert.equal(list.length, 0);
  } finally {
    if (original === undefined) {
      delete process.env.DENDRITE_RAW_OBSERVATIONS;
    } else {
      process.env.DENDRITE_RAW_OBSERVATIONS = original;
    }
  }
});

test('enforceRawObservationsRetention trims to DENDRITE_RAW_OBSERVATIONS_MAX_LINES', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-raw-obs-retain-'));
  const original = process.env.DENDRITE_RAW_OBSERVATIONS_MAX_LINES;
  try {
    process.env.DENDRITE_RAW_OBSERVATIONS_MAX_LINES = '3';
    for (let i = 0; i < 10; i += 1) {
      await captureRawObservation({ tool: 'Edit', target: `file-${i}.ts` }, root);
    }
    const result = await enforceRawObservationsRetention(root);
    // Final state must be capped at 3 lines, regardless of how many trims happened.
    const list = await readRawObservations({ root });
    assert.equal(list.length, 3);
    assert.equal(list[0]?.target, 'file-7.ts');
    assert.equal(list[2]?.target, 'file-9.ts');
    assert.equal(result.keptLines, 3);
  } finally {
    if (original === undefined) {
      delete process.env.DENDRITE_RAW_OBSERVATIONS_MAX_LINES;
    } else {
      process.env.DENDRITE_RAW_OBSERVATIONS_MAX_LINES = original;
    }
  }
});

test('captureRawObservation rejects empty tool names', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-raw-obs-empty-'));
  const observation = await captureRawObservation({ tool: '   ' }, root);
  assert.equal(observation, undefined);
});

test('captureRawObservation clips long target/summary text', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-raw-obs-clip-'));
  const longText = 'x'.repeat(500);
  const observation = await captureRawObservation({ tool: 'Bash', target: longText, summary: longText }, root);
  assert.ok(observation);
  assert.ok(observation.target.length <= 200, 'target clipped to 200');
  assert.ok(observation.summary.length <= 200, 'summary clipped to 200');
});

test('readRawObservations returns [] when the file does not exist', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-raw-obs-empty-'));
  const list = await readRawObservations({ root });
  assert.deepEqual(list, []);
});

test('observations:capture appends from a Claude Code style stdin payload', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-obs-cli-'));
  const result = await runCapture(root, {
    session_id: 'sess-cli-1',
    tool_name: 'Edit',
    tool_input: { file_path: 'src/bar.ts', description: 'tweak signature' },
    tool_response: { content: 'ok' }
  });
  assert.equal(result.exitCode, 0);
  // Stdout is intentionally empty — observations:capture only writes to disk.
  assert.equal(result.stdout.trim(), '');

  const list = await readRawObservations({ root });
  assert.equal(list.length, 1);
  assert.equal(list[0]?.tool, 'Edit');
  assert.equal(list[0]?.kind, 'edit');
  assert.equal(list[0]?.target, 'src/bar.ts');
  assert.equal(list[0]?.sessionId, 'sess-cli-1');
  assert.equal(list[0]?.outcome, 'ok');
  assert.equal(list[0]?.summary, 'tweak signature');
});

test('observations:capture marks outcome=error when tool_response.is_error is true', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-obs-cli-err-'));
  const result = await runCapture(root, {
    tool_name: 'Bash',
    tool_input: { command: 'npm run nonexistent' },
    tool_response: { is_error: true }
  });
  assert.equal(result.exitCode, 0);
  const list = await readRawObservations({ root });
  assert.equal(list.length, 1);
  assert.equal(list[0]?.outcome, 'error');
  assert.equal(list[0]?.kind, 'command');
});

test('observations:capture exits silently and writes nothing when DENDRITE_RAW_OBSERVATIONS=off', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-obs-cli-off-'));
  const result = await runCapture(
    root,
    { tool_name: 'Edit', tool_input: { file_path: 'x.ts' } },
    { DENDRITE_RAW_OBSERVATIONS: 'off' }
  );
  assert.equal(result.exitCode, 0);
  // The store file should not even exist when disabled.
  await assert.rejects(() => fs.stat(resolveRawObservationsPath(root)));
});

test('observations:capture exits 0 on malformed stdin (never blocks the agent)', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-obs-cli-bad-'));
  const result = await runCapture(root, 'this is not json');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), '');
  await assert.rejects(() => fs.stat(resolveRawObservationsPath(root)));
});

test('observations:capture exits 0 with no tool_name in payload', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-obs-cli-empty-'));
  const result = await runCapture(root, { session_id: 'x', tool_input: {} });
  assert.equal(result.exitCode, 0);
  await assert.rejects(() => fs.stat(resolveRawObservationsPath(root)));
});

// ---- C1 slice 2: cluster detection + inbox surfacing ----

async function seedObservation(
  root: string,
  tool: string,
  target: string,
  sessionId: string
): Promise<void> {
  await captureRawObservation({ tool, target, sessionId, outcome: 'ok' }, root);
}

test('detectRawObservationClusters surfaces (kind, target) groups that meet thresholds', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-'));
  // 4 edits to foo.ts across 2 sessions → cluster.
  await seedObservation(root, 'Edit', 'src/foo.ts', 'sess-A');
  await seedObservation(root, 'Edit', 'src/foo.ts', 'sess-A');
  await seedObservation(root, 'Edit', 'src/foo.ts', 'sess-B');
  await seedObservation(root, 'Edit', 'src/foo.ts', 'sess-B');
  // 2 edits to bar.ts across 1 session → below threshold.
  await seedObservation(root, 'Edit', 'src/bar.ts', 'sess-C');
  await seedObservation(root, 'Edit', 'src/bar.ts', 'sess-C');

  const clusters = await detectRawObservationClusters({ root });
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.target, 'src/foo.ts');
  assert.equal(clusters[0]?.kind, 'edit');
  assert.equal(clusters[0]?.observationCount, 4);
  assert.equal(clusters[0]?.distinctSessionCount, 2);
  assert.equal(clusters[0]?.outcomeCounts.ok, 4);
});

test('detectRawObservationClusters normalizes target paths case-insensitively', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-norm-'));
  await seedObservation(root, 'Edit', 'src/Foo.ts', 'sess-A');
  await seedObservation(root, 'Edit', 'src\\foo.ts', 'sess-B');
  await seedObservation(root, 'Edit', 'src/foo.ts/', 'sess-C');

  const clusters = await detectRawObservationClusters({ root });
  assert.equal(clusters.length, 1, 'three normalized variants of the same path should collapse to one cluster');
  assert.equal(clusters[0]?.observationCount, 3);
  assert.equal(clusters[0]?.distinctSessionCount, 3);
});

test('detectRawObservationClusters honors minOccurrences and minDistinctSessions options', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-opts-'));
  for (let i = 0; i < 10; i += 1) {
    await seedObservation(root, 'Bash', 'npm test', 'sess-only-one');
  }
  const tightDefaults = await detectRawObservationClusters({ root });
  assert.equal(tightDefaults.length, 0, 'single-session activity should be filtered out by default');

  const relaxed = await detectRawObservationClusters({ root, minDistinctSessions: 1 });
  assert.equal(relaxed.length, 1);
  assert.equal(relaxed[0]?.kind, 'command');
  assert.equal(relaxed[0]?.observationCount, 10);
});

test('detectRawObservationClusters drops observations outside windowDays', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-window-'));
  await seedObservation(root, 'Edit', 'src/recent.ts', 'sess-A');
  await seedObservation(root, 'Edit', 'src/recent.ts', 'sess-B');
  await seedObservation(root, 'Edit', 'src/recent.ts', 'sess-C');

  // Backdate the file so all entries fall outside a 1-day window.
  const filePath = resolveRawObservationsPath(root);
  const old = await fs.readFile(filePath, 'utf8');
  const aged = old
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const record = JSON.parse(line);
      record.ts = new Date(Date.now() - 30 * 86_400_000).toISOString();
      return JSON.stringify(record);
    })
    .join('\n');
  await fs.writeFile(filePath, `${aged}\n`, 'utf8');

  const recent = await detectRawObservationClusters({ root, windowDays: 1 });
  assert.equal(recent.length, 0);
});

test('detectRawObservationClusters returns [] when the file is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-empty-'));
  const clusters = await detectRawObservationClusters({ root });
  assert.deepEqual(clusters, []);
});

test('detectRawObservationClusters tags clusters by session outcome and sorts verified-success above likely-error', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-synaptic-'));

  // verified-success cluster: 3 edits to verified.ts across 2 sessions, both sessions also
  // ran a passing `npm test` so they earn the verified-success tag.
  await captureRawObservation({ tool: 'Edit', target: 'src/verified.ts', sessionId: 's_pass1', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Edit', target: 'src/verified.ts', sessionId: 's_pass1', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Bash', target: 'npm test', sessionId: 's_pass1', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Edit', target: 'src/verified.ts', sessionId: 's_pass2', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Bash', target: 'npm test', sessionId: 's_pass2', outcome: 'ok' }, root);

  // likely-error cluster: 3 edits to broken.ts across 2 sessions, both sessions ended in
  // a failing `npm test` so they earn the likely-error tag.
  await captureRawObservation({ tool: 'Edit', target: 'src/broken.ts', sessionId: 's_fail1', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Edit', target: 'src/broken.ts', sessionId: 's_fail1', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Bash', target: 'npm test', sessionId: 's_fail1', outcome: 'error' }, root);
  await captureRawObservation({ tool: 'Edit', target: 'src/broken.ts', sessionId: 's_fail2', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Bash', target: 'npm test', sessionId: 's_fail2', outcome: 'error' }, root);

  const clusters = await detectRawObservationClusters({ root });
  // Both edit clusters should surface (3 obs, 2 sessions), plus npm test clusters from both
  // groups (each command target has 2+ observations across 2 sessions). We focus on the
  // edit clusters since they're the headline test.
  const verified = clusters.find((cluster) => cluster.target === 'src/verified.ts');
  const broken = clusters.find((cluster) => cluster.target === 'src/broken.ts');
  assert.ok(verified, 'verified.ts cluster should surface');
  assert.ok(broken, 'broken.ts cluster should surface');

  assert.equal(verified.synapticTag.synapticTag, 'verified-success');
  assert.equal(verified.synapticTag.successSessionCount, 2);
  assert.equal(broken.synapticTag.synapticTag, 'likely-error');
  assert.equal(broken.synapticTag.errorSessionCount, 2);

  const verifiedIndex = clusters.findIndex((cluster) => cluster.target === 'src/verified.ts');
  const brokenIndex = clusters.findIndex((cluster) => cluster.target === 'src/broken.ts');
  assert.ok(
    verifiedIndex < brokenIndex,
    `verified-success cluster should sort before likely-error cluster (got verified=${verifiedIndex}, broken=${brokenIndex})`
  );
});

test('maintenance inbox markdown renders the synaptic Tag column with verified-success / likely-error badges', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-inbox-synaptic-md-'));
  await captureRawObservation({ tool: 'Edit', target: 'src/verified.ts', sessionId: 's_pass1', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Edit', target: 'src/verified.ts', sessionId: 's_pass1', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Bash', target: 'npm test', sessionId: 's_pass1', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Edit', target: 'src/verified.ts', sessionId: 's_pass2', outcome: 'ok' }, root);
  await captureRawObservation({ tool: 'Bash', target: 'npm test', sessionId: 's_pass2', outcome: 'ok' }, root);

  const clusters = await detectRawObservationClusters({ root });
  const md = await buildMaintenanceInboxPage([], [], { observationClusters: clusters });
  assert.match(md, /verified-success/);
  assert.match(md, /\| Tag \|/);
});

test('maintenance inbox snapshot exposes observation clusters with suggested source link', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-inbox-cluster-'));
  await seedObservation(root, 'Edit', 'src/auth.ts', 'sess-A');
  await seedObservation(root, 'Edit', 'src/auth.ts', 'sess-A');
  await seedObservation(root, 'Edit', 'src/auth.ts', 'sess-B');

  const clusters = await detectRawObservationClusters({ root });
  const snapshot = await buildMaintenanceInboxSnapshot([], [], { observationClusters: clusters });
  assert.equal(snapshot.status.observationClusterCount, 1);
  assert.equal(snapshot.observationClusters.length, 1);
  assert.equal(snapshot.observationClusters[0]?.kind, 'edit');
  assert.equal(snapshot.observationClusters[0]?.target, 'src/auth.ts');
  assert.equal(snapshot.observationClusters[0]?.suggestedSourceLink, 'file:src/auth.ts');
  // The cluster surfaces a one-click action that calls memory_remember with a
  // template body the operator is expected to edit.
  assert.equal(snapshot.observationClusters[0]?.actions.length, 1);
  const action = snapshot.observationClusters[0]?.actions[0];
  assert.equal(action?.kind, 'create-memory-from-cluster');
  assert.equal(action?.tool, 'memory_remember');
  assert.equal(action?.available, true);
  assert.match(action?.id ?? '', /^cluster:edit:src\/auth\.ts:create-memory-from-cluster$/);
  assert.deepEqual(action?.arguments.tags, ['from-observation-cluster']);
  assert.deepEqual(action?.arguments.sources, ['file:src/auth.ts']);
  assert.deepEqual(action?.arguments.relatedFiles, ['src/auth.ts']);
  assert.match(String(action?.arguments.text), /Recurring activity detected: edit on src\/auth\.ts/);
  assert.match(String(action?.arguments.text), /EDIT THIS TEXT/);
});

test('maintenance inbox markdown renders an Active Observation Clusters section', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-inbox-cluster-md-'));
  await seedObservation(root, 'Bash', 'npm test', 'sess-1');
  await seedObservation(root, 'Bash', 'npm test', 'sess-2');
  await seedObservation(root, 'Bash', 'npm test', 'sess-3');

  const clusters = await detectRawObservationClusters({ root });
  const md = await buildMaintenanceInboxPage([], [], { observationClusters: clusters });
  assert.match(md, /## Active Observation Clusters/);
  assert.match(md, /npm test/);
  assert.match(md, /command:npm test/);
  assert.match(md, /Active observation clusters: 1/);
});

test('maintenance inbox markdown shows zero-state copy when no clusters cross the threshold', async () => {
  const md = await buildMaintenanceInboxPage([], [], { observationClusters: [] });
  assert.match(md, /## Active Observation Clusters/);
  assert.match(md, /No raw observation clusters have crossed the promotion threshold yet\./);
  assert.match(md, /Active observation clusters: 0/);
});

// ---- C4 slice 2: observation cluster compression prompts ----

test('compressObservationClusters returns a structured handoff prompt per qualifying cluster', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-compress-'));
  await seedObservation(root, 'Edit', 'src/auth.ts', 'sess-A');
  await seedObservation(root, 'Edit', 'src/auth.ts', 'sess-A');
  await seedObservation(root, 'Edit', 'src/auth.ts', 'sess-B');
  await seedObservation(root, 'Bash', 'npm test', 'sess-A');
  await seedObservation(root, 'Bash', 'npm test', 'sess-B');
  await seedObservation(root, 'Bash', 'npm test', 'sess-C');

  const { compressObservationClusters } = await import('../src/wiki/observation-compressor.js');
  const prompts = await compressObservationClusters({ root });

  assert.equal(prompts.length, 2, 'two clusters above the default threshold should yield two prompts');
  for (const prompt of prompts) {
    assert.match(prompt.prompt, /CANDIDATE MEMORY TEXT:/, 'prompt should ask for a candidate memory text');
    assert.match(prompt.prompt, /CONFIDENCE: high \| medium \| low/, 'prompt should ask for a confidence label');
    assert.match(prompt.prompt, /Cluster summary:/);
    assert.ok(prompt.prompt.includes(prompt.target), 'prompt must mention the cluster target');
    assert.ok(prompt.observationCount >= 3);
    assert.ok(prompt.distinctSessionCount >= 2);
  }
});

test('compressObservationClusters --target filter narrows the prompt set', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-compress-target-'));
  await seedObservation(root, 'Edit', 'src/auth.ts', 'sess-A');
  await seedObservation(root, 'Edit', 'src/auth.ts', 'sess-B');
  await seedObservation(root, 'Edit', 'src/auth.ts', 'sess-C');
  await seedObservation(root, 'Bash', 'npm test', 'sess-A');
  await seedObservation(root, 'Bash', 'npm test', 'sess-B');
  await seedObservation(root, 'Bash', 'npm test', 'sess-C');

  const { compressObservationClusters } = await import('../src/wiki/observation-compressor.js');
  const auth = await compressObservationClusters({ root, targetFilter: 'auth' });
  assert.equal(auth.length, 1);
  assert.equal(auth[0]?.target, 'src/auth.ts');

  const tests = await compressObservationClusters({ root, targetFilter: 'npm' });
  assert.equal(tests.length, 1);
  assert.equal(tests[0]?.target, 'npm test');
});

test('compressObservationClusters returns [] when no clusters meet thresholds', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-compress-empty-'));
  // Single-session activity, below default minDistinctSessions.
  for (let i = 0; i < 5; i += 1) {
    await seedObservation(root, 'Edit', 'src/lonely.ts', 'sess-only');
  }
  const { compressObservationClusters } = await import('../src/wiki/observation-compressor.js');
  const prompts = await compressObservationClusters({ root });
  assert.deepEqual(prompts, []);
});

test('compressObservationClusters maxClusters caps the result count', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-compress-max-'));
  // Seed 4 distinct clusters at threshold.
  for (const target of ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts']) {
    await seedObservation(root, 'Edit', target, 'sess-1');
    await seedObservation(root, 'Edit', target, 'sess-2');
    await seedObservation(root, 'Edit', target, 'sess-3');
  }
  const { compressObservationClusters } = await import('../src/wiki/observation-compressor.js');
  const limited = await compressObservationClusters({ root, maxClusters: 2 });
  assert.equal(limited.length, 2);
});

test('findMaintenanceInboxAction resolves a cluster create-memory action by stable id', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-cluster-resolve-'));
  await seedObservation(root, 'Bash', 'npm test', 'sess-1');
  await seedObservation(root, 'Bash', 'npm test', 'sess-2');
  await seedObservation(root, 'Bash', 'npm test', 'sess-3');

  const clusters = await detectRawObservationClusters({ root });
  assert.equal(clusters.length, 1);
  const snapshot = await buildMaintenanceInboxSnapshot([], [], { observationClusters: clusters });
  const actionId = snapshot.observationClusters[0]?.actions[0]?.id ?? '';
  assert.ok(actionId);

  const resolved = await findMaintenanceInboxAction(actionId, [], [], { observationClusters: clusters });
  assert.ok(resolved, 'cluster action id must resolve through findMaintenanceInboxAction');
  assert.equal(resolved.action.tool, 'memory_remember');
  assert.equal(resolved.source.type, 'observation-cluster');
  if (resolved.source.type === 'observation-cluster') {
    assert.equal(resolved.source.clusterKind, 'command');
    assert.equal(resolved.source.target, 'npm test');
  }
});
