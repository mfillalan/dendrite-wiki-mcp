import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki');

test('wiki:action returns a normalized proposals payload for a stable action id', async () => {
  const payload = await runMaintenanceAction('lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals');

  assert.equal(payload.actionId, 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals');
  assert.equal(payload.resultKind, 'proposal-list');
  assert.equal(payload.resultSummary, 'Found 3 active proposals.');
  assert.ok(
    (payload.result as { proposals: Array<{ reviewSlug: string }> }).proposals.some(
      (proposal) => proposal.reviewSlug === 'pending-review/merge-guidance-github-copilot-instructions-md'
    )
  );
});

test('wiki:action returns page text for read actions', async () => {
  const payload = await runMaintenanceAction('lint:stale-claim:docs/wiki/linked-page.md:read-wiki-page');

  assert.equal(payload.resultKind, 'wiki-page-text');
  assert.equal(payload.resultSummary, 'Read wiki page: linked-page.');
  assert.deepEqual(payload.result, {
    text: await fs.readFile(path.join(fixtureRoot, 'docs', 'wiki', 'linked-page.md'), 'utf8')
  });
});

async function runMaintenanceAction(actionId: string): Promise<{
  actionId: string;
  resultKind: string;
  resultSummary: string;
  result: unknown;
}> {
  const originalCwd = process.cwd();
  process.chdir(fixtureRoot);

  try {
    const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'maintenance-actions.ts')).href}?fixture=${Date.now()}-${Math.random()}`;
    const { executeMaintenanceAction } = await import(moduleUrl);
    return (await executeMaintenanceAction(actionId)) as {
      actionId: string;
      resultKind: string;
      resultSummary: string;
      result: unknown;
    };
  } finally {
    process.chdir(originalCwd);
  }
}