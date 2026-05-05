import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rememberProjectMemory } from '../src/wiki/memory-store.js';
import { ProjectSkillNotFoundError, loadProjectSkill } from '../src/wiki/skill-matching.js';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-skill-load-'));
}

test('loadProjectSkill returns the full record and increments recall count', async () => {
  const root = await makeTempRoot();
  const created = await rememberProjectMemory(
    {
      text: 'Skill body content the agent will read.',
      kind: 'skill',
      scope: { taskKeywords: ['module'], languages: ['typescript'] },
      sources: ['file:src/foo.ts']
    },
    root
  );

  const first = await loadProjectSkill(created.id, {}, root);
  assert.equal(first.record.id, created.id);
  assert.equal(first.record.text, 'Skill body content the agent will read.');
  assert.equal(first.recallCount, 1);
  assert.ok(first.record.lastRecalledAt, 'lastRecalledAt should be set');

  const second = await loadProjectSkill(created.id, {}, root);
  assert.equal(second.recallCount, 2, 'recall count should accumulate across loads');
});

test('loadProjectSkill rejects unknown id with typed error', async () => {
  const root = await makeTempRoot();
  await assert.rejects(
    () => loadProjectSkill('mem_does_not_exist', {}, root),
    (error) => {
      assert.ok(error instanceof ProjectSkillNotFoundError);
      assert.equal((error as ProjectSkillNotFoundError).code, 'SKILL_NOT_FOUND');
      return true;
    }
  );
});

test('loadProjectSkill rejects non-skill memory with same typed error', async () => {
  const root = await makeTempRoot();
  const fact = await rememberProjectMemory(
    { text: 'just a fact', kind: 'fact' },
    root
  );

  await assert.rejects(
    () => loadProjectSkill(fact.id, {}, root),
    (error) => error instanceof ProjectSkillNotFoundError
  );
});

test('loadProjectSkill rejects archived skill', async () => {
  const root = await makeTempRoot();
  const filePath = path.join(root, 'local-data', 'project-memories.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        memories: [
          {
            id: 'mem_archived_skill',
            kind: 'skill',
            status: 'archived',
            summary: 'archived',
            text: 'archived',
            tags: [],
            relatedFiles: [],
            relatedPages: [],
            sources: [],
            scope: { filePatterns: [], frameworks: [], languages: ['typescript'], taskKeywords: ['module'], matchMode: 'any' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
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

  await assert.rejects(
    () => loadProjectSkill('mem_archived_skill', {}, root),
    (error) => error instanceof ProjectSkillNotFoundError
  );
});
