import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ProjectMemorySkillScopeError,
  listProjectMemories,
  rememberProjectMemory,
  resolveProjectMemoryStorePath
} from '../src/wiki/memory-store.js';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-memory-skill-'));
}

test("skill memory persists with normalized scope", async () => {
  const root = await makeTempRoot();
  const record = await rememberProjectMemory(
    {
      text: 'When editing Vue components in this project, prefer Composition API with <script setup> and avoid Options API.',
      kind: 'skill',
      scope: {
        filePatterns: ['docs/**/*.vue', 'docs/.vitepress/theme/**/*.vue'],
        frameworks: ['Vue', 'VitePress'],
        languages: ['TypeScript', 'Vue'],
        taskKeywords: ['component', 'composition api'],
        matchMode: 'any'
      }
    },
    root
  );

  assert.equal(record.kind, 'skill');
  assert.ok(record.scope, 'expected scope to be persisted on the record');
  assert.deepEqual(
    [...(record.scope?.filePatterns ?? [])].sort(),
    ['docs/**/*.vue', 'docs/.vitepress/theme/**/*.vue'].sort()
  );
  assert.deepEqual([...(record.scope?.frameworks ?? [])].sort(), ['vitepress', 'vue']);
  assert.deepEqual(record.scope?.languages, ['typescript', 'vue']);
  assert.deepEqual(record.scope?.taskKeywords, ['component', 'composition api']);
  assert.equal(record.scope?.matchMode, 'any');

  const stored = await listProjectMemories({ root });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].kind, 'skill');
  assert.deepEqual(stored[0].scope, record.scope);
});

test("memory_remember rejects skill kind without any scope dimension", async () => {
  const root = await makeTempRoot();
  await assert.rejects(
    () => rememberProjectMemory({ text: 'A skill body without scope.', kind: 'skill' }, root),
    (error) => {
      assert.ok(error instanceof ProjectMemorySkillScopeError);
      assert.equal((error as ProjectMemorySkillScopeError).code, 'SKILL_SCOPE_REQUIRED');
      assert.match((error as Error).message, /scope/i);
      return true;
    }
  );

  const filePath = resolveProjectMemoryStorePath(root);
  const exists = await fs.stat(filePath).catch(() => null);
  assert.equal(exists, null, 'no memory file should be written when validation fails');
});

test("memory_remember rejects skill kind with all empty scope arrays", async () => {
  const root = await makeTempRoot();
  await assert.rejects(
    () =>
      rememberProjectMemory(
        {
          text: 'A skill body.',
          kind: 'skill',
          scope: { filePatterns: [], frameworks: [], languages: [], taskKeywords: [] }
        },
        root
      ),
    (error) => error instanceof ProjectMemorySkillScopeError
  );
});

test("non-skill memory continues to ignore scope without error", async () => {
  const root = await makeTempRoot();
  const record = await rememberProjectMemory(
    {
      text: 'A regular lesson without scope.',
      kind: 'lesson',
      force: true // fixture: bare lesson body, why-linter bypass
    },
    root
  );
  assert.equal(record.kind, 'lesson');
  assert.equal(record.scope, undefined);
});

test("non-skill memory accepts scope but stores it for forward-compat", async () => {
  const root = await makeTempRoot();
  const record = await rememberProjectMemory(
    {
      text: 'A fact that happens to carry scope hints.',
      kind: 'fact',
      scope: { taskKeywords: ['orientation'] }
    },
    root
  );
  assert.equal(record.kind, 'fact');
  assert.deepEqual(record.scope?.taskKeywords, ['orientation']);
  assert.equal(record.scope?.matchMode, 'any');
});

test("scope matchMode defaults to 'any' when omitted and respects 'all'", async () => {
  const root = await makeTempRoot();
  const defaulted = await rememberProjectMemory(
    {
      text: 'Skill with default match mode.',
      kind: 'skill',
      scope: { filePatterns: ['src/**/*.ts'] }
    },
    root
  );
  assert.equal(defaulted.scope?.matchMode, 'any');

  const explicit = await rememberProjectMemory(
    {
      text: 'Skill that requires both file and language to match.',
      kind: 'skill',
      scope: { filePatterns: ['src/**/*.ts'], languages: ['typescript'], matchMode: 'all' }
    },
    root
  );
  assert.equal(explicit.scope?.matchMode, 'all');
});

test("stored skill records survive a round-trip through listProjectMemories", async () => {
  const root = await makeTempRoot();
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        memories: [
          {
            id: 'mem_existing_skill',
            kind: 'skill',
            status: 'active',
            summary: 'pre-existing skill record from disk',
            text: 'A skill loaded from a pre-existing store file.',
            tags: ['preexisting'],
            relatedFiles: [],
            relatedPages: [],
            sources: [],
            scope: {
              filePatterns: ['SRC/**/*.TS'],
              frameworks: ['Vue'],
              languages: [],
              taskKeywords: ['Refactor'],
              matchMode: 'all'
            },
            createdAt: '2026-05-05T12:00:00.000Z',
            updatedAt: '2026-05-05T12:00:00.000Z',
            lastRecalledAt: '',
            recallCount: 0
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const records = await listProjectMemories({ root });
  assert.equal(records.length, 1);
  const skill = records[0];
  assert.equal(skill.kind, 'skill');
  assert.deepEqual(skill.scope?.filePatterns, ['SRC/**/*.TS']);
  assert.deepEqual(skill.scope?.frameworks, ['vue']);
  assert.deepEqual(skill.scope?.languages, []);
  assert.deepEqual(skill.scope?.taskKeywords, ['refactor']);
  assert.equal(skill.scope?.matchMode, 'all');
});

test("unknown kind in stored data falls back to 'lesson' (no skill smuggling)", async () => {
  const root = await makeTempRoot();
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        memories: [
          {
            id: 'mem_unknown_kind',
            kind: 'mystery',
            status: 'active',
            summary: 'has unknown kind',
            text: 'has unknown kind',
            tags: [],
            relatedFiles: [],
            relatedPages: [],
            sources: [],
            createdAt: '2026-05-05T12:00:00.000Z',
            updatedAt: '2026-05-05T12:00:00.000Z',
            lastRecalledAt: '',
            recallCount: 0
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const records = await listProjectMemories({ root });
  assert.equal(records[0].kind, 'lesson');
});
