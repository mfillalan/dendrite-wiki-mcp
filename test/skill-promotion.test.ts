import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ProjectMemorySkillScopeError,
  inferSkillScopeFromMemory,
  promoteMemoryToSkill,
  rememberProjectMemory,
  resolveProjectMemoryStorePath,
  reviewProjectMemories,
  type ProjectMemoryRecord
} from '../src/wiki/memory-store.js';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-skill-promote-'));
}

test('inferSkillScopeFromMemory infers filePatterns and languages from relatedFiles', () => {
  const record: ProjectMemoryRecord = {
    id: 'mem_x',
    kind: 'lesson',
    status: 'active',
    summary: 's',
    text: 't',
    tags: [],
    relatedFiles: ['src/wiki/foo.ts', 'src/wiki/bar.ts'],
    relatedPages: [],
    sources: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRecalledAt: '',
    recallCount: 0
  };
  const scope = inferSkillScopeFromMemory(record);
  assert.ok(scope);
  assert.deepEqual(scope?.filePatterns, ['src/wiki/**/*.ts']);
  assert.deepEqual(scope?.languages, ['typescript']);
  assert.deepEqual(scope?.frameworks, []);
  assert.equal(scope?.matchMode, 'any');
});

test('inferSkillScopeFromMemory pulls frameworks from tags', () => {
  const record: ProjectMemoryRecord = {
    id: 'mem_x',
    kind: 'lesson',
    status: 'active',
    summary: 's',
    text: 't',
    tags: ['vue', 'vitepress', 'review-bridge'],
    relatedFiles: ['docs/.vitepress/foo.ts'],
    relatedPages: [],
    sources: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRecalledAt: '',
    recallCount: 0
  };
  const scope = inferSkillScopeFromMemory(record);
  assert.ok(scope);
  assert.deepEqual(scope?.frameworks, ['vitepress', 'vue']);
  assert.deepEqual(scope?.languages, ['typescript', 'vue']);
  assert.ok(scope?.taskKeywords.includes('review-bridge'));
});

test('inferSkillScopeFromMemory returns undefined when no signal exists', () => {
  const record: ProjectMemoryRecord = {
    id: 'mem_x',
    kind: 'lesson',
    status: 'active',
    summary: 's',
    text: 't',
    tags: [],
    relatedFiles: [],
    relatedPages: ['architecture'],
    sources: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRecalledAt: '',
    recallCount: 0
  };
  assert.equal(inferSkillScopeFromMemory(record), undefined);
});

test('memory_review surfaces skill-promotion-ready findings with inferredScope', async () => {
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
            id: 'mem_skill_candidate',
            kind: 'lesson',
            status: 'active',
            summary: 'A skill-shaped lesson.',
            text: 'A skill-shaped lesson.',
            tags: ['vue', 'maintenance-review'],
            relatedFiles: ['docs/.vitepress/theme/components/Card.vue'],
            relatedPages: [],
            sources: [{ kind: 'file', slug: 'docs/.vitepress/theme/components/Card.vue' }],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastRecalledAt: '',
            recallCount: 4
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const review = await reviewProjectMemories({}, root);
  const skillFinding = review.findings.find((finding) => finding.kind === 'skill-promotion-ready');
  assert.ok(skillFinding, 'skill-promotion-ready finding should be surfaced');
  assert.deepEqual(skillFinding?.memoryIds, ['mem_skill_candidate']);
  assert.ok(skillFinding?.inferredScope, 'finding should carry inferredScope');
  assert.ok((skillFinding?.inferredScope?.languages ?? []).includes('vue'));
  assert.ok((skillFinding?.inferredScope?.frameworks ?? []).includes('vue'));
});

test('memory_review skill-promotion-ready respects minPromotionRecallCount', async () => {
  const root = await makeTempRoot();
  await rememberProjectMemory(
    {
      text: 'Low-recall lesson with file context.',
      kind: 'lesson',
      tags: ['vue'],
      relatedFiles: ['docs/components/A.vue'],
      sources: ['file:docs/components/A.vue']
    },
    root
  );

  const review = await reviewProjectMemories({ minPromotionRecallCount: 2 }, root);
  const skillFinding = review.findings.find((finding) => finding.kind === 'skill-promotion-ready');
  assert.equal(skillFinding, undefined, 'recall count of 0 must not surface as skill candidate');
});

test('promoteMemoryToSkill creates skill memory from inferred scope and supersedes source', async () => {
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
            id: 'mem_source',
            kind: 'lesson',
            status: 'active',
            summary: 'Source lesson body for promotion.',
            text: 'Use Composition API in Vue components and skip Options API.',
            tags: ['vue'],
            relatedFiles: ['docs/components/Card.vue'],
            relatedPages: ['architecture'],
            sources: [{ kind: 'file', slug: 'docs/components/Card.vue' }],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastRecalledAt: '',
            recallCount: 4
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const result = await promoteMemoryToSkill('mem_source', {}, root);
  assert.equal(result.skill.kind, 'skill');
  assert.equal(result.skill.text, 'Use Composition API in Vue components and skip Options API.');
  assert.ok(result.skill.scope);
  assert.equal(result.inferredScope, true);
  assert.equal(result.source.status, 'superseded', 'source memory should be marked superseded');

  const stored = JSON.parse(await fs.readFile(filePath, 'utf8')) as { memories: Array<{ id: string; status: string; kind: string }> };
  assert.equal(stored.memories.find((m) => m.id === 'mem_source')?.status, 'superseded');
  assert.equal(stored.memories.filter((m) => m.kind === 'skill').length, 1);
});

test('promoteMemoryToSkill accepts explicit operator-provided scope override', async () => {
  const root = await makeTempRoot();
  const created = await rememberProjectMemory(
    {
      text: 'A lesson the operator wants to scope precisely.',
      kind: 'lesson',
      tags: ['vue'],
      relatedFiles: ['docs/components/A.vue'],
      sources: ['file:docs/components/A.vue']
    },
    root
  );

  const result = await promoteMemoryToSkill(
    created.id,
    {
      scope: {
        filePatterns: ['src/very-specific/path/**/*.ts'],
        languages: ['typescript'],
        taskKeywords: ['precise'],
        matchMode: 'all'
      }
    },
    root
  );
  assert.equal(result.inferredScope, false);
  assert.deepEqual(result.skill.scope?.filePatterns, ['src/very-specific/path/**/*.ts']);
  assert.equal(result.skill.scope?.matchMode, 'all');
  assert.deepEqual(result.skill.scope?.taskKeywords, ['precise']);
});

test('promoteMemoryToSkill preserves source when preserveSourceMemory=true', async () => {
  const root = await makeTempRoot();
  const created = await rememberProjectMemory(
    {
      text: 'A lesson to keep alongside the new skill.',
      kind: 'lesson',
      tags: ['vue'],
      relatedFiles: ['docs/components/A.vue']
    },
    root
  );

  const result = await promoteMemoryToSkill(created.id, { preserveSourceMemory: true }, root);
  assert.equal(result.source.status, 'active', 'source memory should remain active when preserveSourceMemory=true');
  assert.equal(result.skill.kind, 'skill');
});

test('promoteMemoryToSkill rejects when no scope inferable and none provided', async () => {
  const root = await makeTempRoot();
  const created = await rememberProjectMemory(
    {
      text: 'A purely abstract lesson with no file or framework context.',
      kind: 'lesson',
      relatedPages: ['architecture'],
      sources: ['wiki:architecture']
    },
    root
  );

  await assert.rejects(
    () => promoteMemoryToSkill(created.id, {}, root),
    (error) => error instanceof ProjectMemorySkillScopeError
  );
});

test('promoteMemoryToSkill rejects already-skill memory and inactive memory', async () => {
  const root = await makeTempRoot();
  const skill = await rememberProjectMemory(
    {
      text: 'already a skill',
      kind: 'skill',
      scope: { taskKeywords: ['module'], languages: ['typescript'] }
    },
    root
  );

  await assert.rejects(
    () => promoteMemoryToSkill(skill.id, {}, root),
    /already a skill/
  );

  await assert.rejects(
    () => promoteMemoryToSkill('mem_does_not_exist', {}, root),
    /no such memory/
  );
});
