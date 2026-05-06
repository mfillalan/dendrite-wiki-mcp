import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

// The synthesis module reads files via `pagePathFromSlug` which is anchored at the
// process cwd at module-load time. Each test runs in a fresh subprocess with cwd set
// to a temp directory holding a constructed wiki, so module-level path resolution
// targets the temp dir.
async function runDriftSynthesis(
  cwd: string,
  slug: string,
  envOverrides: Record<string, string> = {}
): Promise<{ provider: { kind: string; status: string }; evidence: { currentIntent: string; recentActivityEntries: string[]; matchedDistinctDays: number }; suggestion: { outcome: string; status: string; text?: string; reasoning?: string; handoffPrompt?: string; failureReason?: string } }> {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'synthesis.ts')).href;
  const script = [
    'process.chdir(process.argv[1]);',
    'const slug = process.argv[2];',
    'const moduleUrl = process.argv[3];',
    'const m = await import(moduleUrl);',
    'const result = await m.synthesizeWikiDriftResolution(slug);',
    'process.stdout.write(JSON.stringify(result));'
  ].join(' ');
  const env = { ...process.env, NO_COLOR: '1', ...envOverrides };
  const { stdout } = await execFileAsync(process.execPath, [
    '--import', 'tsx', '--eval', script, cwd, slug, moduleUrl
  ], { cwd: repoRoot, env });
  return JSON.parse(stdout);
}

async function buildSampleWiki(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-drift-synth-'));
  const docsWiki = path.join(tempRoot, 'docs', 'wiki');
  await fs.mkdir(docsWiki, { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'docs', 'index.md'), '# Index\n\n[Architecture](./wiki/architecture.md)\n', 'utf8');
  await fs.writeFile(
    path.join(docsWiki, 'architecture.md'),
    '# Architecture\n\nThis page describes the canonical local-first MCP server design with stdio transport, markdown wiki, and deterministic ranking.\n',
    'utf8'
  );
  // Two date headings within the 7-day window so distinct-days >= 2 is met.
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await fs.writeFile(
    path.join(docsWiki, 'project-log.md'),
    `# Project Log\n\n## ${yesterday}\n\n- Reinforcement edges shipped for architecture pages with synaptic tagging cluster heuristics.\n\n## ${today}\n\n- Synaptic tagging classifier rolled out across architecture observation streams.\n- Architecture page now references bipartite projection in trail bonuses.\n`,
    'utf8'
  );
  return tempRoot;
}

test('synthesizeWikiDriftResolution with agent provider returns a bounded handoff prompt and full evidence', async () => {
  const tempRoot = await buildSampleWiki();
  try {
    const result = await runDriftSynthesis(tempRoot, 'architecture', {
      DENDRITE_WIKI_SYNTHESIS_PROVIDER: 'agent'
    });
    assert.equal(result.provider.kind, 'agent');
    assert.equal(result.provider.status, 'ready');
    assert.equal(result.suggestion.status, 'handoff');
    assert.equal(result.suggestion.outcome, 'replacement', 'agent provider always returns the prompt as a replacement-candidate handoff');
    assert.match(result.suggestion.handoffPrompt ?? '', /page drift/i);
    assert.match(result.suggestion.handoffPrompt ?? '', /CURRENT FIRST PARAGRAPH/);
    assert.match(result.suggestion.handoffPrompt ?? '', /architecture/);
    assert.equal(result.evidence.recentActivityEntries.length >= 1, true);
    assert.equal(result.evidence.matchedDistinctDays, 2);
    assert.match(result.evidence.currentIntent, /MCP server/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('synthesizeWikiDriftResolution recommends snooze when there is no recent activity', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-drift-empty-'));
  const docsWiki = path.join(tempRoot, 'docs', 'wiki');
  await fs.mkdir(docsWiki, { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'docs', 'index.md'), '# Index\n\n[Architecture](./wiki/architecture.md)\n', 'utf8');
  await fs.writeFile(
    path.join(docsWiki, 'architecture.md'),
    '# Architecture\n\nThis page describes the canonical local-first MCP server design.\n',
    'utf8'
  );
  await fs.writeFile(path.join(docsWiki, 'project-log.md'), '# Project Log\n\n## 2026-01-01\n\n- Far-past entry that mentions architecture but is outside the recency window.\n', 'utf8');

  try {
    const result = await runDriftSynthesis(tempRoot, 'architecture', {
      DENDRITE_WIKI_SYNTHESIS_PROVIDER: 'agent'
    });
    assert.equal(result.suggestion.outcome, 'snooze-recommended');
    assert.equal(result.suggestion.status, 'generated');
    assert.match(result.suggestion.reasoning ?? '', /No recent project-log activity/);
    assert.equal(result.evidence.recentActivityEntries.length, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('synthesizeWikiDriftResolution returns failed status when the page does not exist', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-drift-missing-'));
  await fs.mkdir(path.join(tempRoot, 'docs', 'wiki'), { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'docs', 'index.md'), '# Index\n', 'utf8');
  try {
    const result = await runDriftSynthesis(tempRoot, 'does-not-exist', {
      DENDRITE_WIKI_SYNTHESIS_PROVIDER: 'agent'
    });
    assert.equal(result.suggestion.outcome, 'unavailable');
    assert.equal(result.suggestion.status, 'failed');
    assert.match(result.suggestion.failureReason ?? '', /Could not read page intent/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('synthesizeWikiDriftResolution with no provider configured surfaces "disabled" status', async () => {
  const tempRoot = await buildSampleWiki();
  try {
    const result = await runDriftSynthesis(tempRoot, 'architecture', {
      DENDRITE_WIKI_SYNTHESIS_PROVIDER: 'none'
    });
    assert.equal(result.provider.kind, 'none');
    assert.equal(result.provider.status, 'disabled');
    assert.equal(result.suggestion.outcome, 'unavailable');
    assert.equal(result.suggestion.status, 'disabled');
    assert.match(result.suggestion.failureReason ?? '', /Optional synthesis is disabled/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('listOllamaModels parses Ollama /api/tags response and sorts results alphabetically', async () => {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'synthesis.ts')).href;
  const script = [
    'const m = await import(process.argv[1]);',
    'const fakeFetch = async () => ({',
    '  ok: true,',
    '  json: async () => ({',
    '    models: [',
    '      { name: "llama3.1:8b", size: 4500000000, modified_at: "2026-04-12T00:00:00Z", details: { family: "llama", parameter_size: "8B" } },',
    '      { name: "qwen2.5-coder:7b", size: 4200000000, modified_at: "2026-05-01T00:00:00Z", details: { family: "qwen", parameter_size: "7B" } },',
    '      { name: "phi3:mini", size: 2400000000, modified_at: "2026-03-30T00:00:00Z", details: { family: "phi", parameter_size: "3.8B" } }',
    '    ]',
    '  })',
    '});',
    'const result = await m.listOllamaModels({ fetcher: fakeFetch });',
    'process.stdout.write(JSON.stringify(result));'
  ].join(' ');
  const { stdout } = await execFileAsync(process.execPath, [
    '--import', 'tsx', '--eval', script, moduleUrl
  ], { cwd: repoRoot });

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'ok');
  assert.equal(result.models.length, 3);
  assert.deepEqual(result.models.map((m: { name: string }) => m.name), ['llama3.1:8b', 'phi3:mini', 'qwen2.5-coder:7b']);
  assert.equal(result.models[0].details.parameterSize, '8B', 'parameter_size from Ollama is normalized to details.parameterSize');
});

test('listOllamaModels reports unreachable when Ollama is not running', async () => {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'synthesis.ts')).href;
  const script = [
    'const m = await import(process.argv[1]);',
    'const fakeFetch = async () => { throw new Error("connect ECONNREFUSED"); };',
    'const result = await m.listOllamaModels({ fetcher: fakeFetch });',
    'process.stdout.write(JSON.stringify(result));'
  ].join(' ');
  const { stdout } = await execFileAsync(process.execPath, [
    '--import', 'tsx', '--eval', script, moduleUrl
  ], { cwd: repoRoot });

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'unreachable');
  assert.deepEqual(result.models, []);
  assert.match(result.failureReason, /ECONNREFUSED/);
});

test('synthesizeWikiDriftResolution accepts a per-call ollamaModel override that flows into provider info', async () => {
  const tempRoot = await buildSampleWiki();
  try {
    // We don't actually run a model; we just verify the override propagates by inspecting
    // the resolver. Force the kind to ollama via env, but pass a different model via the
    // ollamaModel option, and confirm the resolved provider reports the override.
    const moduleUrl = pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'synthesis.ts')).href;
    const script = [
      'process.chdir(process.argv[1]);',
      'const m = await import(process.argv[2]);',
      'const provider = m.resolveWikiSynthesisProvider({ requestedKind: "ollama", requestedOllamaModel: "qwen2.5-coder:7b", env: { OLLAMA_MODEL: "llama3.1:8b" } });',
      'process.stdout.write(JSON.stringify(provider));'
    ].join(' ');
    const { stdout } = await execFileAsync(process.execPath, [
      '--import', 'tsx', '--eval', script, tempRoot, moduleUrl
    ], { cwd: repoRoot });
    const provider = JSON.parse(stdout);
    assert.equal(provider.kind, 'ollama');
    assert.equal(provider.status, 'ready');
    assert.equal(provider.model, 'qwen2.5-coder:7b', 'requestedOllamaModel must override env OLLAMA_MODEL');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
