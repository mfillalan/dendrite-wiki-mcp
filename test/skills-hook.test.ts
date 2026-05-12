import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rememberProjectMemory } from '@dendrite/memory';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runSkillsHook(cwd: string, payload: unknown): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', cliPath, 'skills:hook'], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
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

test('skills:hook returns matching skill summaries as hookSpecificOutput.additionalContext', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skills-hook-'));
  await rememberProjectMemory(
    {
      text: 'Use Composition API in Vue components and skip Options API.',
      kind: 'skill',
      scope: { filePatterns: ['docs/**/*.vue'], languages: ['vue'], taskKeywords: ['component'] },
      sources: ['file:docs/components/Card.vue']
    },
    root
  );

  const result = await runSkillsHook(root, {
    tool_name: 'Edit',
    tool_input: { file_path: 'docs/components/Card.vue', description: 'add a new component prop' }
  });
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.trim().length > 0, 'should emit JSON when a skill matches');
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.hookSpecificOutput?.additionalContext);
  assert.match(parsed.hookSpecificOutput.additionalContext, /\[DENDRITE SKILLS\]/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /Composition API/);
});

test('skills:hook exits silently with empty stdout when no skills match', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skills-hook-'));
  await rememberProjectMemory(
    {
      text: 'A python skill.',
      kind: 'skill',
      scope: { languages: ['python'] },
      sources: ['file:src/foo.py']
    },
    root
  );

  const result = await runSkillsHook(root, {
    tool_name: 'Edit',
    tool_input: { file_path: 'src/foo.ts' }
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), '', 'no skills match → no output');
});

test('skills:hook silently exits when tool_input lacks file_path', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skills-hook-'));
  await rememberProjectMemory(
    {
      text: 'A skill.',
      kind: 'skill',
      scope: { languages: ['typescript'] }
    },
    root
  );

  const result = await runSkillsHook(root, { tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), '');
});

test('skills:hook silently exits on malformed JSON input (never blocks Edit/Write)', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skills-hook-'));
  const result = await runSkillsHook(root, 'this is not json');
  assert.equal(result.exitCode, 0, 'must exit 0 even on error so Edit/Write proceeds');
  assert.equal(result.stdout.trim(), '');
});

test('skills:hook silently exits on empty stdin', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skills-hook-'));
  const result = await runSkillsHook(root, '');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), '');
});
