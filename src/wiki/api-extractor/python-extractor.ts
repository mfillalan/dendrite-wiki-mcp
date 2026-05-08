/**
 * Python `LanguageExtractor` — the second built-in, validating the A7 pluggability layer.
 *
 * Implements the same `LanguageExtractor` contract as `./typescript-extractor.ts`, but
 * for Python source trees. Detection looks for the conventional Python project signals
 * (`pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`); extraction shells out
 * to a local Python 3.9+ interpreter with a small embedded helper script that walks the
 * Python AST via the standard-library `ast` module and emits an `ApiFileReference` shape
 * directly. The Python interpreter is found via PATH (`python3` then `python`), and its
 * version is verified before the extractor claims a project — projects with Python
 * sources but no usable Python on the developer's machine cleanly fall through to the
 * "no extractor claims this project" path in the orchestrator.
 *
 * Mapping from Python kinds to the language-agnostic `ApiSymbolKind`: `def` and
 * `async def` → `function`; `class` → `class` (or `enum` when the class subclasses
 * `Enum`/`IntEnum`/`StrEnum`/`Flag`); module-level assignments → `variable` (or
 * `type-alias` when the target is PascalCase or annotated with `TypeAlias`). Names with
 * a leading underscore are dropped per Python's privacy convention. `@deprecated`
 * decorators flow through to the `isDeprecated` flag the renderer's callout uses.
 *
 * Docstrings come back as the `docComment` field verbatim — Python's docstring
 * conventions (Google, NumPy, Sphinx) vary, so first-cut rendering keeps the prose as-is
 * rather than guessing at a specific style. A future polish pass could parse Google-
 * style sections and convert them to the same `ApiDocTag` shape JSDoc uses.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ApiFileReference } from './types.js';
import type { LanguageExtractor } from './language-extractor.js';
import { walkProjectSources, type WalkOptions } from './walk.js';

// Embedded Python helper script. Sent to the interpreter via stdin so command-line length
// limits never become a concern (Windows cmd.exe caps total command line at ~8KB). The
// script reads one source path from argv and emits the ApiFileReference JSON to stdout.
const PYTHON_HELPER_SCRIPT = `import ast
import json
import sys


def is_public(name):
    return bool(name) and not name.startswith('_')


def get_decorator_names(node):
    names = []
    decorators = getattr(node, 'decorator_list', []) or []
    for dec in decorators:
        if isinstance(dec, ast.Name):
            names.append(dec.id)
        elif isinstance(dec, ast.Attribute):
            names.append(dec.attr)
        elif isinstance(dec, ast.Call):
            if isinstance(dec.func, ast.Name):
                names.append(dec.func.id)
            elif isinstance(dec.func, ast.Attribute):
                names.append(dec.func.attr)
    return names


def is_deprecated(decorator_names):
    return any(name.lower() == 'deprecated' for name in decorator_names)


def render_function_signature(node):
    is_async = isinstance(node, ast.AsyncFunctionDef)
    args = ast.unparse(node.args) if node.args else ''
    returns = ''
    if node.returns is not None:
        returns = ' -> ' + ast.unparse(node.returns)
    prefix = 'async def' if is_async else 'def'
    return prefix + ' ' + node.name + '(' + args + ')' + returns


def render_class_signature(node):
    parts = []
    for base in node.bases:
        parts.append(ast.unparse(base))
    for kw in node.keywords:
        if kw.arg:
            parts.append(kw.arg + '=' + ast.unparse(kw.value))
        else:
            parts.append('**' + ast.unparse(kw.value))
    head = 'class ' + node.name
    if parts:
        head = head + '(' + ', '.join(parts) + ')'
    return head


ENUM_BASE_NAMES = {'Enum', 'IntEnum', 'StrEnum', 'Flag', 'IntFlag'}


def is_enum_class(node):
    for base in node.bases:
        if isinstance(base, ast.Name) and base.id in ENUM_BASE_NAMES:
            return True
        if isinstance(base, ast.Attribute) and base.attr in ENUM_BASE_NAMES:
            return True
    return False


def render_assign_signature(node):
    try:
        return ast.unparse(node)
    except Exception:
        return None


def is_type_alias(node, target_name):
    # PEP 613 TypeAlias annotation
    if isinstance(node, ast.AnnAssign):
        ann = node.annotation
        if isinstance(ann, ast.Name) and ann.id == 'TypeAlias':
            return True
        if isinstance(ann, ast.Attribute) and ann.attr == 'TypeAlias':
            return True
    # PEP 695 type statement (Python 3.12+)
    if hasattr(ast, 'TypeAlias') and isinstance(node, getattr(ast, 'TypeAlias')):
        return True
    # Heuristic fallback: PascalCase target name on a value-only assignment. We require
    # at least one lowercase letter so SCREAMING_CASE constants (DEFAULT_NAME, MAX_RETRIES,
    # etc.) stay classified as variables instead of being treated as type aliases.
    if isinstance(node, ast.Assign) and target_name and target_name[0].isupper():
        has_lowercase = any(c.islower() for c in target_name)
        return has_lowercase
    return False


def collect_assign_target(node):
    if isinstance(node, ast.Assign):
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            return node.targets[0].id
        return None
    if isinstance(node, ast.AnnAssign):
        if isinstance(node.target, ast.Name):
            return node.target.id
        return None
    if hasattr(ast, 'TypeAlias') and isinstance(node, getattr(ast, 'TypeAlias')):
        return node.name.id
    return None


def parse_file(path):
    with open(path, 'r', encoding='utf-8') as handle:
        source = handle.read()
    tree = ast.parse(source, filename=path)
    file_doc = ast.get_docstring(tree)

    symbols = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if not is_public(node.name):
                continue
            decorator_names = get_decorator_names(node)
            symbols.append({
                'name': node.name,
                'kind': 'function',
                'signature': render_function_signature(node),
                'docComment': ast.get_docstring(node),
                'tags': [],
                'sourceLine': node.lineno,
                'isDeprecated': is_deprecated(decorator_names),
            })
        elif isinstance(node, ast.ClassDef):
            if not is_public(node.name):
                continue
            decorator_names = get_decorator_names(node)
            kind = 'enum' if is_enum_class(node) else 'class'
            symbols.append({
                'name': node.name,
                'kind': kind,
                'signature': render_class_signature(node),
                'docComment': ast.get_docstring(node),
                'tags': [],
                'sourceLine': node.lineno,
                'isDeprecated': is_deprecated(decorator_names),
            })
        elif isinstance(node, (ast.Assign, ast.AnnAssign)) or (
            hasattr(ast, 'TypeAlias') and isinstance(node, getattr(ast, 'TypeAlias'))
        ):
            target_name = collect_assign_target(node)
            if not target_name or not is_public(target_name):
                continue
            sig = render_assign_signature(node)
            if not sig:
                continue
            kind = 'type-alias' if is_type_alias(node, target_name) else 'variable'
            symbols.append({
                'name': target_name,
                'kind': kind,
                'signature': sig,
                'docComment': None,
                'tags': [],
                'sourceLine': node.lineno,
                'isDeprecated': False,
            })

    symbols.sort(key=lambda s: s['sourceLine'])

    return {
        'sourcePath': '',
        'moduleSlug': '',
        'symbols': symbols,
        'fileDocComment': file_doc,
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: helper.py <source-path>', file=sys.stderr)
        sys.exit(2)
    source_path = sys.argv[1]
    result = parse_file(source_path)
    json.dump(result, sys.stdout, ensure_ascii=False)
`;

const PYTHON_DEFAULT_INCLUDE = ['**/*.py'];
const PYTHON_DEFAULT_EXCLUDE = [
  '**/tests/**',
  '**/test_*.py',
  '**/*_test.py',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/env/**',
  '**/build/**',
  '**/dist/**',
  '**/site-packages/**',
  '**/node_modules/**'
];

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCommand(command: string, args: string[], stdin?: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }));
    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findPythonInterpreter(): Promise<string | null> {
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const candidate of candidates) {
    try {
      const result = await runCommand(candidate, ['--version']);
      if (result.exitCode !== 0) continue;
      // `python --version` writes to stdout on 3.4+, sometimes to stderr on older releases.
      const versionText = `${result.stdout}\n${result.stderr}`;
      const match = versionText.match(/Python (\d+)\.(\d+)/);
      if (!match) continue;
      const major = Number(match[1]);
      const minor = Number(match[2]);
      // ast.unparse requires Python 3.9+. Below that the helper script can't run.
      if (major > 3 || (major === 3 && minor >= 9)) {
        return candidate;
      }
    } catch {
      // Spawn failed (interpreter not found or not executable); try the next candidate.
    }
  }
  return null;
}

// Memoize the interpreter lookup so we don't pay --version overhead on every extract().
let cachedInterpreter: string | null | undefined;
async function getPython(): Promise<string | null> {
  if (cachedInterpreter !== undefined) {
    return cachedInterpreter;
  }
  cachedInterpreter = await findPythonInterpreter();
  return cachedInterpreter;
}

// Test-only escape hatch: clear the memoized interpreter so tests can simulate "Python
// disappears mid-run" or run multiple isolated detection scenarios.
export function resetPythonInterpreterCache(): void {
  cachedInterpreter = undefined;
}

export const pythonExtractor: LanguageExtractor = {
  id: 'python',

  async detect(rootDir: string): Promise<boolean> {
    // Only claim a project that BOTH (a) shows a Python project signal in its root and
    // (b) has a usable Python 3.9+ interpreter on PATH. If Python isn't installed, the
    // orchestrator falls through to the next extractor (e.g., the TS one) or returns an
    // empty result — we never throw at detect-time.
    const signals = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'];
    let hasSignal = false;
    for (const signal of signals) {
      if (await exists(path.join(rootDir, signal))) {
        hasSignal = true;
        break;
      }
    }
    if (!hasSignal) {
      return false;
    }
    return (await getPython()) !== null;
  },

  async walk(rootDir: string, options?: WalkOptions): Promise<string[]> {
    return walkProjectSources(rootDir, {
      include: options?.include ?? PYTHON_DEFAULT_INCLUDE,
      exclude: options?.exclude ?? PYTHON_DEFAULT_EXCLUDE,
      // The @internal-tag walker convention is JSDoc-specific; Python's privacy convention
      // is the leading-underscore name. The extract step honors that already.
      respectInternalConvention: false
    });
  },

  async extract(sourcePath: string, options?: { rootDir?: string }): Promise<ApiFileReference> {
    const python = await getPython();
    if (!python) {
      throw new Error(
        'pythonExtractor.extract: Python 3.9+ is required but no usable interpreter was found on PATH'
      );
    }
    const rootDir = options?.rootDir ?? process.cwd();
    const absolute = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(rootDir, sourcePath);
    const relative = path.relative(rootDir, absolute).replace(/\\/g, '/');

    const result = await runCommand(python, ['-', absolute], PYTHON_HELPER_SCRIPT);
    if (result.exitCode !== 0) {
      throw new Error(
        `pythonExtractor.extract: helper failed for ${relative} (exit ${result.exitCode}): ${result.stderr.trim()}`
      );
    }

    const parsed = JSON.parse(result.stdout) as ApiFileReference;
    parsed.sourcePath = relative;
    // Mirror typeScriptExtractor's slug shape: `api/<dir>/<basename>` with the language
    // extension stripped. Python files outside a top-level `src/` keep their full path.
    const stripped = relative.replace(/^src\//, '').replace(/\.py$/i, '');
    parsed.moduleSlug = `api/${stripped}`;
    return parsed;
  }
};
