import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');

test('dendrite doctor reports critical, warning, and info findings end-to-end', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-doctor-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  try {
    const cacheBuster = `?fixture=${Date.now()}-${Math.random()}`;
    const doctorModule = await import(`${pathToFileURL(path.join(repoRoot, 'packages', 'wiki', 'src', 'doctor.ts')).href}${cacheBuster}`) as typeof import('@rarusoft/dendrite-wiki');

    // Phase 1: bare fixture has no MCP client config and no benchmark history,
    // so doctor should flag at least one critical (no-mcp-client-config) and
    // a warning for the missing benchmark history.
    const initialReport = await doctorModule.runDoctor();
    assert.ok(initialReport.findings.length > 0, 'expected at least one finding on bare fixture');
    assert.equal(initialReport.status, 'critical', `expected critical status, got ${initialReport.status}`);
    assert.ok(initialReport.counts.critical >= 1, 'expected at least one critical finding');

    const ruleSet = new Set(initialReport.findings.map((f) => f.rule));
    assert.ok(ruleSet.has('no-mcp-client-config'), 'expected no-mcp-client-config finding');
    assert.ok(ruleSet.has('no-benchmark-history'), 'expected no-benchmark-history finding');

    // Every critical finding must include a fix command — that is the product promise.
    for (const finding of initialReport.findings) {
      if (finding.severity === 'critical') {
        assert.ok(finding.fix, `critical finding ${finding.rule} should have a fix command`);
      }
    }

    const formatted = doctorModule.formatDoctorReport(initialReport);
    assert.match(formatted, /Dendrite Doctor/);
    assert.match(formatted, /CRITICAL/);
    assert.match(formatted, /Fix:/);

    // Phase 2: drop a fake .mcp.json to satisfy the client-config check, re-run.
    await fs.writeFile(
      path.join(tempFixtureRoot, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'dendrite-wiki-mcp': { command: 'npx', args: ['-y', 'dendrite-wiki-mcp'] } } }, null, 2),
      'utf8'
    );

    const recoveredReport = await doctorModule.runDoctor();
    const recoveredRules = new Set(recoveredReport.findings.map((f) => f.rule));
    assert.ok(!recoveredRules.has('no-mcp-client-config'), 'no-mcp-client-config should clear after adding .mcp.json');
    assert.ok(recoveredRules.has('mcp-clients-configured'), 'should now report mcp-clients-configured info');

    // Phase 3: verify the report is JSON-serializable (CLI --json mode depends on this).
    const json = JSON.stringify(recoveredReport);
    const parsed = JSON.parse(json);
    assert.equal(parsed.status, recoveredReport.status);
    assert.equal(parsed.findings.length, recoveredReport.findings.length);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('dendrite doctor is read-only by default and recognizes Grok project config', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-doctor-grok-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });
  await fs.mkdir(path.join(tempFixtureRoot, '.grok'), { recursive: true });
  await fs.writeFile(
    path.join(tempFixtureRoot, '.grok', 'config.toml'),
    '[mcp_servers."dendrite-wiki-mcp"]\ncommand = "npx"\nargs = ["-y", "dendrite-wiki-mcp"]\n',
    'utf8'
  );

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  try {
    const cacheBuster = `?fixture=${Date.now()}-${Math.random()}`;
    const doctorModule = await import(`${pathToFileURL(path.join(repoRoot, 'packages', 'wiki', 'src', 'doctor.ts')).href}${cacheBuster}`) as typeof import('@rarusoft/dendrite-wiki');

    const statusArtifactPath = path.join(tempFixtureRoot, 'docs', 'public', 'dendrite-telemetry-status.json');
    await assert.rejects(fs.access(statusArtifactPath));

    const report = await doctorModule.runDoctor();
    const clientFinding = report.findings.find((finding) => finding.rule === 'mcp-clients-configured');
    assert.ok(clientFinding, 'expected mcp-clients-configured finding');
    assert.match(clientFinding.detail, /Grok Build CLI/);
    await assert.rejects(fs.access(statusArtifactPath), 'doctor should not write telemetry status artifact by default');

    await doctorModule.runDoctor({ writeTelemetryStatus: true });
    await fs.access(statusArtifactPath);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
