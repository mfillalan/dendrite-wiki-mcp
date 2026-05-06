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
  enforceRawObservationsRetention,
  isRawObservationsCaptureEnabled,
  readRawObservations,
  resolveRawObservationsPath
} from '../src/wiki/raw-observations.js';

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
