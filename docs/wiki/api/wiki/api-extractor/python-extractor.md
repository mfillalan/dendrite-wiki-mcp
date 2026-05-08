---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/api-extractor/python-extractor.ts
---

# `src/wiki/api-extractor/python-extractor.ts`

Python `LanguageExtractor` — the second built-in, validating the A7 pluggability layer.

Implements the same `LanguageExtractor` contract as `./typescript-extractor.ts`, but
for Python source trees. Detection looks for the conventional Python project signals
(`pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`); extraction shells out
to a local Python 3.9+ interpreter with a small embedded helper script that walks the
Python AST via the standard-library `ast` module and emits an `ApiFileReference` shape
directly. The Python interpreter is found via PATH (`python3` then `python`), and its
version is verified before the extractor claims a project — projects with Python
sources but no usable Python on the developer's machine cleanly fall through to the
"no extractor claims this project" path in the orchestrator.

Mapping from Python kinds to the language-agnostic `ApiSymbolKind`: `def` and
`async def` → `function`; `class` → `class` (or `enum` when the class subclasses
`Enum`/`IntEnum`/`StrEnum`/`Flag`); module-level assignments → `variable` (or
`type-alias` when the target is PascalCase or annotated with `TypeAlias`). Names with
a leading underscore are dropped per Python's privacy convention. `@deprecated`
decorators flow through to the `isDeprecated` flag the renderer's callout uses.

Docstrings come back as the `docComment` field verbatim — Python's docstring
conventions (Google, NumPy, Sphinx) vary, so first-cut rendering keeps the prose as-is
rather than guessing at a specific style. A future polish pass could parse Google-
style sections and convert them to the same `ApiDocTag` shape JSDoc uses.

KNOWN LIMITATION (tracked in docs/wiki/api-reference-roadmap.md): only top-level
symbols are extracted. Class bodies are NOT recursed into, so methods, properties,
`@classmethod`s, and `@staticmethod`s of a documented class do not appear on the page.
The class itself surfaces with its docstring, but its members do not. This is
deliberately scoped out of the v0 extractor — proper handling needs design choices
around how to render `Class.method` (flat namespaced symbol vs. nested section), how
to surface decorator metadata, and whether `@property` getters should map to
`kind: 'variable'` or `kind: 'function'`. Until that design pass lands, Python class
pages are deliberately thinner than their TypeScript counterparts.

## Exports

- [`resetPythonInterpreterCache`](#resetpythoninterpretercache) — function
- [`pythonExtractor`](#pythonextractor) — variable

---

### `resetPythonInterpreterCache`

**Kind:** function · **Source:** [src/wiki/api-extractor/python-extractor.ts:318](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/api-extractor/python-extractor.ts#L318)

```ts
function resetPythonInterpreterCache(): void
```

---

### `pythonExtractor`

**Kind:** variable · **Source:** [src/wiki/api-extractor/python-extractor.ts:322](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/api-extractor/python-extractor.ts#L322)

```ts
const pythonExtractor: LanguageExtractor
```
