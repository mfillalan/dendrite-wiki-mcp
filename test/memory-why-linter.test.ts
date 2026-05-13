import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  rememberProjectMemory,
  ProjectMemoryWhyLintError,
  MEMORY_CAUSAL_LANGUAGE_PATTERNS,
  lessonBodyContainsCausalLanguage
} from '@rarusoft/dendrite-memory';

async function withFreshMemoryDir<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-why-linter-'));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('B10: lesson body with causal "because" passes the why-linter', async () => {
  await withFreshMemoryDir(async (root) => {
    const record = await rememberProjectMemory(
      {
        text: 'Always quote file paths because Windows paths can contain spaces that break shell parsing.',
        kind: 'lesson'
      },
      root
    );
    assert.equal(record.kind, 'lesson');
    assert.match(record.text, /because/i);
  });
});

test('B10: lesson body with "the reason" / "due to" / "in order to" / "so that" also passes', async () => {
  const variants = [
    'Use the proposal queue. The reason we do this is that direct writes bypass review.',
    'Skip the cache for this path due to its known invalidation gaps.',
    'Run the linter in CI in order to catch regressions before they ship.',
    'Bundle the assets so that the docs site can render offline.'
  ];
  for (const text of variants) {
    await withFreshMemoryDir(async (root) => {
      const record = await rememberProjectMemory({ text, kind: 'lesson' }, root);
      assert.equal(record.kind, 'lesson');
    });
  }
});

test('B10: lesson body without causal language is rejected with ProjectMemoryWhyLintError', async () => {
  await withFreshMemoryDir(async (root) => {
    await assert.rejects(
      rememberProjectMemory(
        {
          text: 'The config file lives at .claude/settings.json with strict json-schema validation.',
          kind: 'lesson'
        },
        root
      ),
      (err: unknown) => {
        assert.ok(err instanceof ProjectMemoryWhyLintError, 'should throw ProjectMemoryWhyLintError');
        assert.equal((err as ProjectMemoryWhyLintError).code, 'LESSON_MISSING_WHY');
        assert.ok(
          (err as ProjectMemoryWhyLintError).suggestedPatterns.length > 0,
          'error should expose suggestedPatterns for the agent to inspect'
        );
        return true;
      }
    );
  });
});

test('B10: lesson body without causal language passes when force=true', async () => {
  await withFreshMemoryDir(async (root) => {
    const record = await rememberProjectMemory(
      {
        text: 'The config file lives at .claude/settings.json with strict json-schema validation.',
        kind: 'lesson',
        force: true
      },
      root
    );
    assert.equal(record.kind, 'lesson');
  });
});

test('B10: fact, warning, handoff, and skill kinds are exempt from the why-linter', async () => {
  const exemptKinds: Array<{ kind: 'fact' | 'warning' | 'handoff' | 'skill'; scope?: object }> = [
    { kind: 'fact' },
    { kind: 'warning' },
    { kind: 'handoff' },
    { kind: 'skill', scope: { filePatterns: ['src/**/*.ts'] } }
  ];

  for (const { kind, scope } of exemptKinds) {
    await withFreshMemoryDir(async (root) => {
      const record = await rememberProjectMemory(
        {
          text: 'Plain statement with no causal language at all.',
          kind,
          ...(scope ? { scope } : {})
        },
        root
      );
      assert.equal(record.kind, kind, `kind=${kind} should be accepted without causal language`);
    });
  }
});

test('B10: lessonBodyContainsCausalLanguage matches word-boundary, not substring', async () => {
  // "because" inside "becausexyz" should NOT match.
  assert.equal(lessonBodyContainsCausalLanguage('becausexyz is a string'), false);
  // "because" with adjacent punctuation/whitespace should match.
  assert.equal(lessonBodyContainsCausalLanguage('We do X because Y.'), true);
  assert.equal(lessonBodyContainsCausalLanguage('We do X, because Y.'), true);
  // "the reason" with extra whitespace should still match.
  assert.equal(lessonBodyContainsCausalLanguage('Here is the reason we ship: ...'), true);
  // Case insensitive.
  assert.equal(lessonBodyContainsCausalLanguage('We do X BECAUSE Y.'), true);
});

test('B10: vocabulary constant is non-empty and contains the canonical entries', async () => {
  assert.ok(MEMORY_CAUSAL_LANGUAGE_PATTERNS.length >= 10, 'vocabulary should have a reasonable spread of markers');
  // Spot-check that the canonical core entries are present.
  for (const required of ['because', 'since', 'due to', 'the reason', 'so that', 'in order to']) {
    assert.ok(
      MEMORY_CAUSAL_LANGUAGE_PATTERNS.includes(required),
      `vocabulary should include canonical entry "${required}"`
    );
  }
});
