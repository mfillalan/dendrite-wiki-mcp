import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { refreshApiReference } from '../src/wiki/api-reference.js';
import { pythonExtractor, resetPythonInterpreterCache } from '../src/wiki/api-extractor/python-extractor.js';

const FIXED_GENERATED_AT = '2026-05-08T12:00:00.000Z';

function isPythonAvailable(): boolean {
  for (const candidate of ['python3', 'python']) {
    try {
      const result = spawnSync(candidate, ['--version']);
      if (result.status === 0) {
        const text = `${result.stdout?.toString() ?? ''}\n${result.stderr?.toString() ?? ''}`;
        const match = text.match(/Python (\d+)\.(\d+)/);
        if (match && (Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 9))) {
          return true;
        }
      }
    } catch {
      // try the next candidate
    }
  }
  return false;
}

const skipIfNoPython = isPythonAvailable() ? undefined : { skip: 'Python 3.9+ not available on PATH' };

async function makePythonFixtureProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-python-'));
  await fs.writeFile(
    path.join(dir, 'pyproject.toml'),
    `[project]
name = "fixture-pkg"
version = "0.1.0"
`,
    'utf8'
  );
  await fs.mkdir(path.join(dir, 'src', 'fixture_pkg'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'src', 'fixture_pkg', '__init__.py'),
    '',
    'utf8'
  );
  await fs.writeFile(
    path.join(dir, 'src', 'fixture_pkg', 'core.py'),
    `"""Fixture module exercising every supported Python symbol kind."""

from enum import Enum
from typing import TypeAlias


WidgetShape: TypeAlias = "square | circle | triangle"


DEFAULT_NAME = "widget"


def greet(name: str, times: int = 1) -> str:
    """Build a greeting.

    Args:
        name: the name to greet.
        times: how many times.

    Returns:
        the greeting string.
    """
    return ("hello " + name + " ") * times


async def fetch_data(url: str) -> dict:
    """Fetch data from a URL."""
    return {}


class Widget:
    """A widget that does widget things."""

    def __init__(self, name: str) -> None:
        self.name = name


class Severity(Enum):
    """Severity levels recognized by the system."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


def _internal_helper() -> None:
    """This must not appear in the output (leading underscore = private)."""
    pass
`,
    'utf8'
  );
  return dir;
}

test('pythonExtractor.detect returns true for a project with pyproject.toml when Python is available', skipIfNoPython, async () => {
  resetPythonInterpreterCache();
  const root = await makePythonFixtureProject();
  try {
    const detected = await pythonExtractor.detect(root);
    assert.equal(detected, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pythonExtractor.detect returns false for a project with no Python signals', skipIfNoPython, async () => {
  resetPythonInterpreterCache();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-no-python-'));
  try {
    const detected = await pythonExtractor.detect(root);
    assert.equal(detected, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pythonExtractor extracts every supported symbol kind from a Python source file', skipIfNoPython, async () => {
  resetPythonInterpreterCache();
  const root = await makePythonFixtureProject();
  try {
    const ref = await pythonExtractor.extract('src/fixture_pkg/core.py', { rootDir: root });
    const names = ref.symbols.map((symbol) => symbol.name);
    assert.deepEqual(names.sort(), ['DEFAULT_NAME', 'Severity', 'Widget', 'WidgetShape', 'fetch_data', 'greet'].sort());
    assert.ok(!names.includes('_internal_helper'), 'private (underscore-prefixed) names must be filtered');

    const greet = ref.symbols.find((s) => s.name === 'greet');
    assert.ok(greet, 'greet should be present');
    assert.equal(greet.kind, 'function');
    assert.match(greet.signature, /def greet\(name: str, times: int=1\) -> str/);
    assert.match(greet.docComment ?? '', /Build a greeting/);

    const fetchData = ref.symbols.find((s) => s.name === 'fetch_data');
    assert.ok(fetchData, 'fetch_data should be present');
    assert.match(fetchData.signature, /^async def fetch_data/);

    const widget = ref.symbols.find((s) => s.name === 'Widget');
    assert.ok(widget, 'Widget should be present');
    assert.equal(widget.kind, 'class');

    const severity = ref.symbols.find((s) => s.name === 'Severity');
    assert.ok(severity, 'Severity should be present');
    assert.equal(severity.kind, 'enum', 'Enum subclass should map to kind=enum');

    const widgetShape = ref.symbols.find((s) => s.name === 'WidgetShape');
    assert.ok(widgetShape, 'WidgetShape should be present');
    assert.equal(widgetShape.kind, 'type-alias', 'TypeAlias-annotated assign should map to kind=type-alias');

    const defaultName = ref.symbols.find((s) => s.name === 'DEFAULT_NAME');
    assert.ok(defaultName, 'DEFAULT_NAME should be present');
    assert.equal(defaultName.kind, 'variable', 'plain SCREAMING_CASE constant should map to kind=variable');

    assert.match(ref.fileDocComment ?? '', /Fixture module exercising every supported Python symbol kind/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference dispatches to pythonExtractor when a Python project is detected', skipIfNoPython, async () => {
  resetPythonInterpreterCache();
  const root = await makePythonFixtureProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    assert.equal(result.pagesWritten, 1, 'one Python source under fixture_pkg/core.py should produce one page');
    assert.deepEqual(result.pagesChanged, ['api/fixture_pkg/core']);

    const pagePath = path.join(root, 'docs', 'wiki', 'api', 'fixture_pkg', 'core.md');
    const page = await fs.readFile(pagePath, 'utf8');
    assert.match(page, /lifecycle: generated/);
    assert.match(page, /Fixture module exercising every supported Python symbol kind/);
    assert.match(page, /### `greet`/);
    assert.match(page, /### `Severity`/);
    assert.match(page, /\*\*Kind:\*\* enum/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pythonExtractor produces no symbols for a Python file with only private definitions', skipIfNoPython, async () => {
  resetPythonInterpreterCache();
  const root = await makePythonFixtureProject();
  try {
    await fs.writeFile(
      path.join(root, 'src', 'fixture_pkg', 'private_only.py'),
      `def _hidden():
    pass

class _AlsoHidden:
    pass
`,
      'utf8'
    );
    const ref = await pythonExtractor.extract('src/fixture_pkg/private_only.py', { rootDir: root });
    assert.deepEqual(ref.symbols, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
