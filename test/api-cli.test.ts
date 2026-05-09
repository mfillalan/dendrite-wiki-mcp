import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const execFileAsync = promisify(execFile);

const repoRoot = process.cwd();
const cliEntryPoint = path.join(repoRoot, 'src', 'cli.ts');
const serverEntryPoint = path.join(repoRoot, 'src', 'index.ts');
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

async function makeFixtureProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'api-cli-test-'));
  await fs.mkdir(path.join(dir, 'src', 'util'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'src', 'foo.ts'),
    `/** Adds two numbers. */
export function add(a: number, b: number): number { return a + b; }
`,
    'utf8'
  );
  await fs.writeFile(
    path.join(dir, 'src', 'util', 'helper.ts'),
    `/** Uppercase a string. */
export function up(value: string): string { return value.toUpperCase(); }
`,
    'utf8'
  );
  return dir;
}

async function runCli(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(npxCommand, ['tsx', cliEntryPoint, ...args], {
      cwd,
      // shell: true is required on Windows for execFile to dispatch through .cmd shims (npx.cmd).
      // It is harmless on POSIX where npxCommand resolves to plain `npx`.
      shell: true,
      env: { ...process.env, DENDRITE_WIKI_DISABLE_BENCHMARK_EVENTS: '1' }
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 };
  }
}

function textContent(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === 'text')?.text ?? '';
}

test('docs:api CLI runs end-to-end on a fresh project, exits 0, and writes pages', async () => {
  const root = await makeFixtureProject();
  try {
    const { stdout, code } = await runCli(root, ['docs:api']);
    assert.equal(code, 0, 'CLI must exit 0 on a successful run');
    assert.match(stdout, /Sources scanned: 2/);
    assert.match(stdout, /Pages written: 2/);
    assert.ok(stdout.includes('api/foo'), 'human summary should list api/foo as a changed page');

    const fooPage = await fs.readFile(path.join(root, 'docs', 'wiki', 'api', 'foo.md'), 'utf8');
    assert.match(fooPage, /Adds two numbers\./);

    const manifest = JSON.parse(
      await fs.readFile(path.join(root, 'docs', 'public', 'api-reference-manifest.json'), 'utf8')
    ) as { pages: { slug: string }[] };
    assert.deepEqual(manifest.pages.map((page) => page.slug).sort(), ['api/foo', 'api/util/helper']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('docs:api --dry-run prints the summary but writes nothing', async () => {
  const root = await makeFixtureProject();
  try {
    const { stdout, code } = await runCli(root, ['docs:api', '--dry-run']);
    assert.equal(code, 0);
    assert.match(stdout, /\(dry run — nothing written\)/);

    const apiDirExists = await fs
      .access(path.join(root, 'docs', 'wiki', 'api'))
      .then(() => true)
      .catch(() => false);
    assert.ok(!apiDirExists, 'dry run must not create the api page directory');
    const manifestExists = await fs
      .access(path.join(root, 'docs', 'public', 'api-reference-manifest.json'))
      .then(() => true)
      .catch(() => false);
    assert.ok(!manifestExists, 'dry run must not write the manifest');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('docs:api --format json emits a parseable ApiReferenceResult', async () => {
  const root = await makeFixtureProject();
  try {
    const { stdout, code } = await runCli(root, ['docs:api', '--format', 'json', '--dry-run']);
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout) as {
      pagesWritten: number;
      pagesChanged: string[];
      manifest: { pages: { slug: string; contentHash: string }[] };
    };
    assert.equal(parsed.pagesWritten, 2);
    assert.deepEqual(parsed.pagesChanged.sort(), ['api/foo', 'api/util/helper']);
    assert.ok(parsed.manifest.pages.every((page) => /^[a-f0-9]{64}$/.test(page.contentHash)));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('wiki_generate_api_reference MCP tool returns a valid ApiReferenceResult and writes pages', async () => {
  const root = await makeFixtureProject();
  const client = new Client({ name: 'dendrite-wiki-mcp-api-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: npxCommand,
    args: ['tsx', serverEntryPoint],
    cwd: root,
    stderr: 'pipe',
    env: {
      ...process.env,
      DENDRITE_WIKI_DISABLE_BENCHMARK_EVENTS: '1',
      DENDRITE_DISABLE_RITUAL_GATE: '1'
    }
  });
  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: 'wiki_generate_api_reference',
      arguments: {}
    });
    assert.notEqual(result.isError, true);
    const payload = JSON.parse(textContent(result)) as {
      pagesWritten: number;
      pagesChanged: string[];
      manifest: { pages: { slug: string }[] };
    };
    assert.equal(payload.pagesWritten, 2);
    assert.deepEqual(payload.pagesChanged.sort(), ['api/foo', 'api/util/helper']);

    const fooPageExists = await fs
      .access(path.join(root, 'docs', 'wiki', 'api', 'foo.md'))
      .then(() => true)
      .catch(() => false);
    assert.ok(fooPageExists, 'MCP tool should have written the foo page');
  } finally {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('wiki_generate_api_reference MCP tool honors dryRun=true', async () => {
  const root = await makeFixtureProject();
  const client = new Client({ name: 'dendrite-wiki-mcp-api-test-dry', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: npxCommand,
    args: ['tsx', serverEntryPoint],
    cwd: root,
    stderr: 'pipe',
    env: {
      ...process.env,
      DENDRITE_WIKI_DISABLE_BENCHMARK_EVENTS: '1',
      DENDRITE_DISABLE_RITUAL_GATE: '1'
    }
  });
  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: 'wiki_generate_api_reference',
      arguments: { dryRun: true }
    });
    assert.notEqual(result.isError, true);
    const payload = JSON.parse(textContent(result)) as { pagesWritten: number };
    assert.equal(payload.pagesWritten, 2);

    const apiDirExists = await fs
      .access(path.join(root, 'docs', 'wiki', 'api'))
      .then(() => true)
      .catch(() => false);
    assert.ok(!apiDirExists, 'dryRun=true must not create page output');
  } finally {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
