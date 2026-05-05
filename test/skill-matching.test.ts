import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rememberProjectMemory, resolveProjectMemoryStorePath } from '../src/wiki/memory-store.js';
import { globToRegex, inferLanguagesFromFiles, recallProjectSkills } from '../src/wiki/skill-matching.js';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-skill-match-'));
}

async function seedSkill(
  root: string,
  text: string,
  scope: Parameters<typeof rememberProjectMemory>[0]['scope'],
  extras: { tags?: string[]; sources?: string[]; relatedPages?: string[] } = {}
) {
  return rememberProjectMemory(
    {
      text,
      kind: 'skill',
      scope,
      tags: extras.tags,
      sources: extras.sources,
      relatedPages: extras.relatedPages
    },
    root
  );
}

test('globToRegex handles ** segments correctly', () => {
  const re1 = globToRegex('src/**/*.ts');
  assert.ok(re1.test('src/foo.ts'));
  assert.ok(re1.test('src/a/b/foo.ts'));
  assert.ok(!re1.test('lib/foo.ts'));
  assert.ok(!re1.test('src/foo.tsx'));

  const re2 = globToRegex('**/components/**');
  assert.ok(re2.test('src/components/Button.tsx'));
  assert.ok(re2.test('components/Button.tsx'));
  assert.ok(re2.test('docs/.vitepress/theme/components/sub/Card.vue'));
  assert.ok(!re2.test('src/utils/helpers.ts'));

  const re3 = globToRegex('docs/wiki/*.md');
  assert.ok(re3.test('docs/wiki/architecture.md'));
  assert.ok(!re3.test('docs/wiki/sub/page.md'));
});

test('globToRegex backslash paths normalized to forward slashes', () => {
  const re = globToRegex('src\\**\\*.ts');
  assert.ok(re.test('src/foo.ts'));
  assert.ok(re.test('src/a/b.ts'));
});

test('inferLanguagesFromFiles maps common extensions', () => {
  assert.deepEqual(inferLanguagesFromFiles(['src/foo.ts']), ['typescript']);
  assert.deepEqual(inferLanguagesFromFiles(['src/foo.tsx', 'src/bar.ts']).sort(), ['typescript']);
  assert.deepEqual(inferLanguagesFromFiles(['app.py', 'helper.rs']).sort(), ['python', 'rust']);
  assert.deepEqual(inferLanguagesFromFiles(['component.vue']), ['vue']);
  assert.deepEqual(inferLanguagesFromFiles(['unknown.xyz']), []);
});

test('recallProjectSkills hard-excludes when input language contradicts skill language', async () => {
  const root = await makeTempRoot();
  await seedSkill(root, 'A Rust-specific skill.', { languages: ['rust'], taskKeywords: ['memory'] });

  const result = await recallProjectSkills({ query: 'work on memory module', languages: ['typescript'] }, root);
  assert.equal(result.length, 0, 'rust skill must not surface for a typescript task');
});

test('recallProjectSkills surfaces skill when input language is missing (conservative keep)', async () => {
  const root = await makeTempRoot();
  await seedSkill(
    root,
    'A Rust-specific skill.',
    { languages: ['rust'], taskKeywords: ['memory'] },
    { sources: ['file:src/rust/foo.rs'] }
  );

  const result = await recallProjectSkills({ query: 'work on memory module' }, root);
  assert.equal(result.length, 1, 'skill should surface when agent provided no language context');
  assert.match(result[0].text, /rust-specific/i);
});

test('recallProjectSkills hard-excludes when input file contradicts file pattern', async () => {
  const root = await makeTempRoot();
  await seedSkill(
    root,
    'A Vue components skill.',
    { filePatterns: ['docs/**/*.vue', '**/components/**/*.vue'], taskKeywords: ['component'] },
    { sources: ['file:docs/components/A.vue'] }
  );

  const result = await recallProjectSkills(
    { query: 'fix component', relatedFiles: ['src/utils/helpers.ts'] },
    root
  );
  assert.equal(result.length, 0, 'vue file-pattern skill must not surface for a non-vue file task');
});

test('recallProjectSkills surfaces skill when file pattern matches', async () => {
  const root = await makeTempRoot();
  await seedSkill(
    root,
    'A Vue components skill.',
    { filePatterns: ['docs/**/*.vue'], taskKeywords: ['component'] },
    { sources: ['file:docs/components/A.vue'] }
  );

  const result = await recallProjectSkills(
    {
      query: 'add a new component',
      relatedFiles: ['docs/.vitepress/theme/components/Card.vue']
    },
    root
  );
  assert.equal(result.length, 1);
  assert.ok(
    result[0].reasons.some((reason) => reason.startsWith('file pattern match')),
    'reasons should explain the file-pattern match'
  );
});

test("recallProjectSkills matchMode='all' requires every declared dimension to have positive input", async () => {
  const root = await makeTempRoot();
  await seedSkill(
    root,
    "A strict Vue+TypeScript skill scoped to docs.",
    {
      filePatterns: ['docs/**/*.vue'],
      languages: ['vue'],
      taskKeywords: ['component'],
      matchMode: 'all'
    },
    { sources: ['file:docs/foo.vue'] }
  );

  const matches = await recallProjectSkills(
    {
      query: 'component refactor',
      relatedFiles: ['docs/components/A.vue']
    },
    root
  );
  assert.equal(matches.length, 1, 'matchMode=all should surface when all declared dims match');

  const partialMatches = await recallProjectSkills({ query: 'component refactor' }, root);
  assert.equal(partialMatches.length, 0, 'matchMode=all should not surface when no file context provided');
});

test('recallProjectSkills bigram task-keyword bonus outscores unigram match', async () => {
  const root = await makeTempRoot();
  await seedSkill(root, 'Skill using a phrase keyword.', { taskKeywords: ['stored procedures'] }, { sources: ['file:db/proc.sql'] });
  await seedSkill(root, 'Skill using a single keyword.', { taskKeywords: ['stored'] }, { sources: ['file:db/notes.md'] });

  const result = await recallProjectSkills(
    { query: 'audit our stored procedures for the quarterly review' },
    root
  );
  assert.equal(result.length, 2);
  assert.match(result[0].text, /phrase keyword/, 'bigram match should score higher than unigram');
});

test('recallProjectSkills auto-infers languages from related files when not provided', async () => {
  const root = await makeTempRoot();
  await seedSkill(
    root,
    'A TypeScript skill.',
    { languages: ['typescript'], taskKeywords: ['module'] },
    { sources: ['file:src/foo.ts'] }
  );

  const result = await recallProjectSkills(
    {
      query: 'refactor the module',
      relatedFiles: ['src/foo.ts']
    },
    root
  );
  assert.equal(result.length, 1, 'language should be inferred from .ts extension');
});

test('recallProjectSkills respects maxItems and defaults to 3', async () => {
  const root = await makeTempRoot();
  for (let i = 0; i < 6; i += 1) {
    await seedSkill(
      root,
      `Skill number ${i} about typescript modules.`,
      { languages: ['typescript'], taskKeywords: ['module'] },
      { sources: [`file:src/skill-${i}.ts`] }
    );
  }

  const defaultResult = await recallProjectSkills(
    { query: 'work on module', languages: ['typescript'] },
    root
  );
  assert.equal(defaultResult.length, 3, 'default maxItems is 3');

  const customResult = await recallProjectSkills(
    { query: 'work on module', languages: ['typescript'], maxItems: 5 },
    root
  );
  assert.equal(customResult.length, 5);
});

test('recallProjectSkills demotes skills not used in over 30 days', async () => {
  const root = await makeTempRoot();
  // Hand-seed two skills with controlled timestamps directly via store file
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const veryOld = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const recent = new Date(Date.now() - 1 * 86_400_000).toISOString();
  await fs.writeFile(
    filePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        memories: [
          {
            id: 'mem_old_skill',
            kind: 'skill',
            status: 'active',
            summary: 'Old skill that has not been used.',
            text: 'Old skill that has not been used.',
            tags: [],
            relatedFiles: [],
            relatedPages: [],
            sources: [{ kind: 'file', slug: 'src/foo.ts' }],
            scope: { filePatterns: [], frameworks: [], languages: ['typescript'], taskKeywords: ['module'], matchMode: 'any' },
            createdAt: veryOld,
            updatedAt: veryOld,
            lastRecalledAt: '',
            recallCount: 0
          },
          {
            id: 'mem_fresh_skill',
            kind: 'skill',
            status: 'active',
            summary: 'Fresh skill that was recently active.',
            text: 'Fresh skill that was recently active.',
            tags: [],
            relatedFiles: [],
            relatedPages: [],
            sources: [{ kind: 'file', slug: 'src/foo.ts' }],
            scope: { filePatterns: [], frameworks: [], languages: ['typescript'], taskKeywords: ['module'], matchMode: 'any' },
            createdAt: recent,
            updatedAt: recent,
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

  const result = await recallProjectSkills({ query: 'module work', languages: ['typescript'] }, root);
  assert.equal(result.length, 2);
  // Fresh skill must outrank old one because old one carries the recency demotion penalty
  assert.match(result[0].text, /fresh skill/i, 'fresh skill should outrank stale one');
  assert.ok(
    result[1].reasons.some((reason) => reason.startsWith('demoted: not used in')),
    'old skill should carry the recency-demotion reason'
  );
});

test('recallProjectSkills excludes archived and superseded skills', async () => {
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
            id: 'mem_archived',
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

  const result = await recallProjectSkills({ query: 'module', languages: ['typescript'] }, root);
  assert.equal(result.length, 0);
});

test('recallProjectSkills excludes non-skill memories even if they have scope', async () => {
  const root = await makeTempRoot();
  await rememberProjectMemory(
    {
      text: 'A fact that happens to have scope.',
      kind: 'fact',
      scope: { taskKeywords: ['module'], languages: ['typescript'] }
    },
    root
  );

  const result = await recallProjectSkills({ query: 'module', languages: ['typescript'] }, root);
  assert.equal(result.length, 0, 'only kind=skill should surface in skill recall');
});
