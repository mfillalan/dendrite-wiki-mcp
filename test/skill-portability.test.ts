import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  exportSkillById,
  importSkillFromFile,
  importSkillFromMarkdown,
  SkillPortabilityError,
  writeSkillExport
} from '../src/wiki/skill-portability.js';
import { listProjectMemories, rememberProjectMemory } from '../src/wiki/memory-store.js';

async function seedSkill(root: string, summaryText: string = 'Use Composition API in Vue components and skip Options API.'): Promise<string> {
  const record = await rememberProjectMemory(
    {
      text: summaryText,
      kind: 'skill',
      tags: ['vue', 'components'],
      relatedFiles: ['docs/components/Card.vue'],
      relatedPages: ['architecture'],
      sources: ['file:docs/components/Card.vue'],
      scope: {
        filePatterns: ['docs/**/*.vue'],
        frameworks: [],
        languages: ['vue'],
        taskKeywords: ['component'],
        matchMode: 'any'
      }
    },
    root
  );
  return record.id;
}

test('exportSkillById produces frontmatter + body + JSON metadata block', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-export-'));
  const id = await seedSkill(root);
  const bundle = await exportSkillById(id, { exportedAt: '2026-05-05T00:00:00Z' }, root);
  assert.match(bundle.filename, /\.skill\.md$/);
  assert.match(bundle.contents, /^---\nkind: skill\n/);
  assert.match(bundle.contents, /^summary:.*Composition API/m);
  assert.match(bundle.contents, /^# Use Composition API/m);
  assert.match(bundle.contents, /## Skill Metadata/);
  assert.match(bundle.contents, /```json[\s\S]+"filePatterns": \[\s*"docs\/\*\*\/\*\.vue"/);
});

test('exportSkillById refuses non-skill memories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-export-not-skill-'));
  const lesson = await rememberProjectMemory({ text: 'Just a regular lesson.', kind: 'lesson' }, root);
  await assert.rejects(() => exportSkillById(lesson.id, {}, root), (error: unknown) => {
    return error instanceof SkillPortabilityError && error.code === 'NOT_A_SKILL';
  });
});

test('exportSkillById errors when the id does not exist', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-export-missing-'));
  await assert.rejects(() => exportSkillById('mem_does-not-exist', {}, root), (error: unknown) => {
    return error instanceof SkillPortabilityError && error.code === 'SKILL_NOT_FOUND';
  });
});

test('writeSkillExport writes the bundle to disk under local-data/skill-exports', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-write-'));
  const id = await seedSkill(root);
  const result = await writeSkillExport(id, {}, root);
  const stat = await fs.stat(result.filename);
  assert.ok(stat.isFile());
  assert.match(result.filename, /skill-exports[\\/].+\.skill\.md$/);
});

test('round-trip: exportSkillById → importSkillFromMarkdown preserves scope and tags', async () => {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-rt-source-'));
  const targetRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-rt-target-'));
  const id = await seedSkill(sourceRoot, 'Vue Composition API guidance — never mix with Options API in the same file.');

  const bundle = await exportSkillById(id, { exportedAt: '2026-05-05T00:00:00Z' }, sourceRoot);
  const result = await importSkillFromMarkdown(bundle.contents, 'file:test://bundle.skill.md', targetRoot);

  assert.equal(result.record.kind, 'skill');
  assert.equal(result.record.scope?.filePatterns[0], 'docs/**/*.vue');
  assert.deepEqual(result.record.scope?.languages, ['vue']);
  assert.deepEqual(result.record.scope?.taskKeywords, ['component']);
  assert.deepEqual(result.record.tags, ['components', 'vue']);
  assert.deepEqual(result.record.relatedFiles, ['docs/components/Card.vue']);
  assert.deepEqual(result.record.relatedPages, ['architecture']);
  // Imported sources include the original plus the import provenance line.
  const sourceLabels = result.record.sources.map((source) => `${source.kind}:${source.slug}`);
  assert.ok(sourceLabels.includes('file:docs/components/Card.vue'));
  assert.ok(sourceLabels.some((label) => label.startsWith('file:test:')));

  // Skill text body should preserve the original (case-insensitive comparison
  // tolerates whitespace stripping during round-trip).
  assert.match(result.record.text, /Composition API/i);
  // Recall counts and lastRecalledAt reset on import.
  assert.equal(result.record.recallCount, 0);
  assert.equal(result.record.lastRecalledAt, '');

  // The new record landed in the target store.
  const stored = await listProjectMemories({ root: targetRoot });
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.id, result.record.id);
});

test('importSkillFromFile reads a bundle file and uses its path as provenance', async () => {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-impfile-source-'));
  const targetRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-impfile-target-'));
  const id = await seedSkill(sourceRoot);
  const bundle = await writeSkillExport(id, {}, sourceRoot);
  const result = await importSkillFromFile(bundle.filename, targetRoot);
  assert.equal(result.record.kind, 'skill');
  assert.match(result.importedFromUri, /^file:/);
});

test('importSkillFromMarkdown rejects bundles missing frontmatter', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-import-bad-fm-'));
  await assert.rejects(
    () => importSkillFromMarkdown('# Just markdown without frontmatter\n\nbody', 'file:bad.md', root),
    (error: unknown) => error instanceof SkillPortabilityError && error.code === 'BUNDLE_MISSING_FRONTMATTER'
  );
});

test('importSkillFromMarkdown rejects bundles with kind != skill', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-import-wrong-kind-'));
  const bundle = `---
kind: lesson
summary: Wrong kind
---

# Wrong kind

body

## Skill Metadata

\`\`\`json
{ "scope": { "languages": ["typescript"], "filePatterns": [], "frameworks": [], "taskKeywords": [], "matchMode": "any" } }
\`\`\`
`;
  await assert.rejects(
    () => importSkillFromMarkdown(bundle, 'file:lesson.md', root),
    (error: unknown) => error instanceof SkillPortabilityError && error.code === 'NOT_A_SKILL_BUNDLE'
  );
});

test('importSkillFromMarkdown rejects bundles with empty scope', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-import-empty-scope-'));
  const bundle = `---
kind: skill
summary: Empty scope
---

# Empty scope

body

## Skill Metadata

\`\`\`json
{ "scope": { "filePatterns": [], "frameworks": [], "languages": [], "taskKeywords": [], "matchMode": "any" } }
\`\`\`
`;
  await assert.rejects(
    () => importSkillFromMarkdown(bundle, 'file:empty.md', root),
    (error: unknown) =>
      error instanceof SkillPortabilityError &&
      (error.code === 'BUNDLE_SCOPE_EMPTY' || error.code === 'BUNDLE_MISSING_SCOPE')
  );
});

test('importSkillFromMarkdown rejects bundles with malformed JSON metadata block', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-skill-import-bad-json-'));
  const bundle = `---
kind: skill
summary: Bad JSON
---

# Bad JSON

body

## Skill Metadata

\`\`\`json
{ this is not json
\`\`\`
`;
  await assert.rejects(
    () => importSkillFromMarkdown(bundle, 'file:bad.md', root),
    (error: unknown) => error instanceof SkillPortabilityError && error.code === 'BUNDLE_INVALID_JSON'
  );
});
