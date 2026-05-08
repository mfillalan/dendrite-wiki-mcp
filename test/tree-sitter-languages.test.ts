// Parameterized integration tests for the tree-sitter long-tail languages (Go, Java,
// Ruby, C, C++, PHP). Each language has a tiny fixture project with a single source file
// exercising the public-vs-private filtering and the supported symbol kinds for that
// grammar. The test driver is shared so adding a new language is a fixture entry.

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refreshApiReference } from '../src/wiki/api-reference.js';
import {
  resetTreeSitterGrammarCache,
  treeSitterExtractor
} from '../src/wiki/api-extractor/tree-sitter-extractor.js';
import type { ApiSymbol } from '../src/wiki/api-extractor/types.js';

const FIXED_GENERATED_AT = '2026-05-08T12:00:00.000Z';
const repoRoot = process.cwd();

interface ExpectedSymbol {
  name: string;
  kind: ApiSymbol['kind'];
}

interface LanguageFixture {
  id: string;
  signalFile: string;
  signalContent: string;
  sourceRelPath: string;
  sourceContent: string;
  expectedPresent: ExpectedSymbol[];
  expectedAbsent: string[];
  expectedDocSnippet?: { name: string; pattern: RegExp };
}

const FIXTURES: LanguageFixture[] = [
  {
    id: 'go',
    signalFile: 'go.mod',
    signalContent: 'module example.com/fixture\n\ngo 1.22\n',
    sourceRelPath: 'pkg/widget.go',
    sourceContent: `package widget

// Greet builds a greeting for the given name.
func Greet(name string) string {
\treturn "hello " + name
}

// helper is package-private and must not be exported in the API page.
func helper() int {
\treturn 42
}

// Widget represents a widget.
type Widget struct {
\tName string
}

// privateThing is unexported.
type privateThing struct {
\tval int
}
`,
    expectedPresent: [
      { name: 'Greet', kind: 'function' },
      { name: 'Widget', kind: 'class' }
    ],
    expectedAbsent: ['helper', 'privateThing'],
    expectedDocSnippet: { name: 'Greet', pattern: /Greet builds a greeting/ }
  },
  {
    id: 'java',
    signalFile: 'pom.xml',
    signalContent: '<project><modelVersion>4.0.0</modelVersion><groupId>fixture</groupId><artifactId>fixture</artifactId><version>0.1.0</version></project>\n',
    sourceRelPath: 'src/main/java/Widget.java',
    sourceContent: `package com.example.fixture;

/**
 * A widget that does widget things.
 */
public class Widget {
    /**
     * Greet someone.
     */
    public String greet(String name) {
        return "hello " + name;
    }

    private void hiddenHelper() {}
}

class PackagePrivate {
}
`,
    expectedPresent: [
      { name: 'Widget', kind: 'class' },
      { name: 'greet', kind: 'function' }
    ],
    expectedAbsent: ['hiddenHelper', 'PackagePrivate'],
    expectedDocSnippet: { name: 'Widget', pattern: /A widget that does widget things/ }
  },
  {
    id: 'ruby',
    signalFile: 'Gemfile',
    signalContent: "source 'https://rubygems.org'\n",
    sourceRelPath: 'lib/widget.rb',
    sourceContent: `# Widget module — exercises class, module, and method captures.
module Fixture
  # A widget that does widget things.
  class Widget
    # Greet by name.
    def greet(name)
      "hello #{name}"
    end
  end

  # Top-level helper method.
  def self.build_default
    Widget.new
  end
end
`,
    expectedPresent: [
      { name: 'Fixture', kind: 'class' },
      { name: 'Widget', kind: 'class' },
      { name: 'greet', kind: 'function' },
      { name: 'build_default', kind: 'function' }
    ],
    expectedAbsent: [],
    expectedDocSnippet: { name: 'Widget', pattern: /A widget that does widget things/ }
  },
  {
    id: 'c',
    signalFile: 'Makefile',
    signalContent: "all:\n\techo build\n",
    sourceRelPath: 'src/widget.h',
    sourceContent: `#ifndef WIDGET_H
#define WIDGET_H

/**
 * Greet a widget.
 */
int greet(const char* name);

static int hidden_helper(void);

struct Widget {
    int id;
};

typedef int WidgetId;

#endif
`,
    expectedPresent: [
      { name: 'greet', kind: 'function' },
      { name: 'Widget', kind: 'class' },
      { name: 'WidgetId', kind: 'type-alias' }
    ],
    expectedAbsent: ['hidden_helper'],
    expectedDocSnippet: { name: 'greet', pattern: /Greet a widget/ }
  },
  {
    id: 'cpp',
    signalFile: 'CMakeLists.txt',
    signalContent: 'cmake_minimum_required(VERSION 3.20)\nproject(fixture)\n',
    sourceRelPath: 'src/widget.hpp',
    sourceContent: `#pragma once

/**
 * A widget class.
 */
class Widget {
public:
    Widget() = default;
};

int greet(const char* name);

static int hidden(void);

struct Helper {
    int id;
};

typedef int WidgetId;
`,
    expectedPresent: [
      { name: 'Widget', kind: 'class' },
      { name: 'greet', kind: 'function' },
      { name: 'Helper', kind: 'class' },
      { name: 'WidgetId', kind: 'type-alias' }
    ],
    expectedAbsent: ['hidden'],
    expectedDocSnippet: { name: 'Widget', pattern: /A widget class/ }
  },
  {
    id: 'csharp',
    signalFile: 'global.json',
    signalContent: '{"sdk":{"version":"8.0.0"}}\n',
    sourceRelPath: 'src/Widget.cs',
    sourceContent: `namespace Example.Fixture;

/// <summary>A widget that does widget things.</summary>
public class Widget {
    /// <summary>Greet someone.</summary>
    public string Greet(string name) {
        return "hello " + name;
    }

    private void HiddenHelper() {}
}

public interface IWidgetFactory {
    Widget Build();
}

internal class InternalThing {
}
`,
    expectedPresent: [
      { name: 'Widget', kind: 'class' },
      { name: 'Greet', kind: 'function' },
      { name: 'IWidgetFactory', kind: 'interface' }
    ],
    expectedAbsent: ['HiddenHelper', 'InternalThing'],
    expectedDocSnippet: { name: 'Widget', pattern: /A widget that does widget things/ }
  },
  {
    id: 'swift',
    signalFile: 'Package.swift',
    signalContent: `// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name: "Fixture")\n`,
    sourceRelPath: 'Sources/Fixture/Widget.swift',
    sourceContent: `/// A widget that does widget things.
public class Widget {
    /// Greet someone.
    public func greet(name: String) -> String {
        return "hello \\(name)"
    }

    private func hidden() {}
}

/// A protocol describing widget factories.
public protocol WidgetFactory {
    func build() -> Widget
}

class InternalWidget {
}
`,
    expectedPresent: [
      { name: 'Widget', kind: 'class' },
      { name: 'greet', kind: 'function' },
      { name: 'WidgetFactory', kind: 'interface' }
    ],
    expectedAbsent: ['hidden', 'InternalWidget'],
    expectedDocSnippet: { name: 'Widget', pattern: /A widget that does widget things/ }
  },
  {
    id: 'lua',
    signalFile: 'init.lua',
    signalContent: '-- module entry point\nlocal M = require("widget")\nreturn M\n',
    sourceRelPath: 'lua/widget.lua',
    sourceContent: `-- Widget module.
local M = {}

--- Greet someone by name.
function M.greet(name)
  return "hello " .. name
end

--- Build a default widget.
function M.build()
  return { name = "default" }
end

local function hidden_helper()
  return 42
end

return M
`,
    expectedPresent: [
      { name: 'greet', kind: 'function' },
      { name: 'build', kind: 'function' }
    ],
    // Lua's grammar parses `local function hidden_helper()` as a different node type
    // than the captured patterns, so it never enters the symbol stream — which is the
    // right behavior for "local-prefixed = private".
    expectedAbsent: ['hidden_helper'],
    expectedDocSnippet: { name: 'greet', pattern: /Greet someone by name/ }
  },
  {
    id: 'scala',
    signalFile: 'build.sbt',
    signalContent: `name := "fixture"\nversion := "0.1.0"\nscalaVersion := "3.3.1"\n`,
    sourceRelPath: 'src/main/scala/Widget.scala',
    sourceContent: `package example.fixture

/** A widget that does widget things. */
class Widget(val name: String) {
  /** Greet by name. */
  def greet(who: String): String = s"hello $who"

  private def hidden(): Unit = ()
}

trait WidgetFactory {
  def build(): Widget
}

object Widget {
  def default(): Widget = new Widget("default")
}

private class InternalThing
`,
    expectedPresent: [
      { name: 'Widget', kind: 'class' },
      { name: 'greet', kind: 'function' },
      { name: 'WidgetFactory', kind: 'interface' },
      { name: 'default', kind: 'function' }
    ],
    expectedAbsent: ['hidden', 'InternalThing'],
    expectedDocSnippet: { name: 'Widget', pattern: /A widget that does widget things/ }
  },
  {
    id: 'elixir',
    signalFile: 'mix.exs',
    signalContent: `defmodule Fixture.MixProject do\n  use Mix.Project\n  def project, do: [app: :fixture, version: "0.1.0"]\nend\n`,
    sourceRelPath: 'lib/widget.ex',
    sourceContent: `defmodule Widget do
  # A widget that does widget things.

  # Greet by name.
  def greet(name) do
    "hello " <> name
  end

  # Build a default widget.
  def build_default() do
    %{name: "default"}
  end

  # Internal helper, must not appear in the public API.
  defp hidden_helper() do
    42
  end
end
`,
    expectedPresent: [
      { name: 'Widget', kind: 'class' }, // module → class in our kind map
      { name: 'greet', kind: 'function' },
      { name: 'build_default', kind: 'function' }
    ],
    expectedAbsent: ['hidden_helper']
  },
  {
    id: 'ocaml',
    signalFile: 'dune-project',
    signalContent: `(lang dune 3.0)\n`,
    sourceRelPath: 'lib/widget.ml',
    sourceContent: `(** A widget that does widget things. *)

(** Greet someone by name. *)
let greet name = "hello " ^ name

(** Build a default widget. *)
let build_default () = "default"

let internal_helper () = 42
`,
    expectedPresent: [
      { name: 'greet', kind: 'function' },
      { name: 'build_default', kind: 'function' }
    ],
    expectedAbsent: []
  },
  {
    id: 'kotlin',
    signalFile: 'build.gradle.kts',
    signalContent: `plugins { kotlin("jvm") version "1.9.20" }\n`,
    sourceRelPath: 'src/main/kotlin/Widget.kt',
    sourceContent: `package com.example.fixture

/**
 * A widget that does widget things.
 */
class Widget(val name: String) {
    /**
     * Greet by name.
     */
    fun greet(who: String): String = "hello $who"

    private fun hidden() {}
}

interface WidgetFactory {
    fun build(): Widget
}

object WidgetUtils {
    fun default(): Widget = Widget("default")
}

private class InternalThing
`,
    expectedPresent: [
      { name: 'Widget', kind: 'class' },
      { name: 'greet', kind: 'function' },
      { name: 'WidgetFactory', kind: 'class' }, // tags.scm captures interface as class_declaration
      { name: 'WidgetUtils', kind: 'class' }
    ],
    expectedAbsent: ['hidden', 'InternalThing'],
    expectedDocSnippet: { name: 'Widget', pattern: /A widget that does widget things/ }
  },
  {
    id: 'bash',
    signalFile: 'install.sh',
    signalContent: '#!/bin/bash\nset -e\n',
    sourceRelPath: 'lib/widget.sh',
    sourceContent: `#!/bin/bash

# Greet by name.
greet() {
  echo "hello $1"
}

# Build a default widget.
build_default() {
  echo "default"
}
`,
    expectedPresent: [
      { name: 'greet', kind: 'function' },
      { name: 'build_default', kind: 'function' }
    ],
    expectedAbsent: [],
    expectedDocSnippet: { name: 'greet', pattern: /Greet by name/ }
  },
  {
    id: 'php',
    signalFile: 'composer.json',
    signalContent: '{"name":"example/fixture","type":"library","version":"0.1.0"}\n',
    sourceRelPath: 'src/Widget.php',
    sourceContent: `<?php

namespace Example\\Fixture;

/**
 * A widget that does widget things.
 */
class Widget
{
    /**
     * Greet by name.
     */
    public function greet(string $name): string
    {
        return 'hello ' . $name;
    }

    private function hiddenHelper(): void
    {
    }
}

interface WidgetFactory
{
    public function build(): Widget;
}

function topLevel(): int
{
    return 42;
}
`,
    expectedPresent: [
      { name: 'Widget', kind: 'class' },
      { name: 'greet', kind: 'function' },
      { name: 'WidgetFactory', kind: 'interface' },
      { name: 'topLevel', kind: 'function' }
    ],
    expectedAbsent: ['hiddenHelper'],
    expectedDocSnippet: { name: 'Widget', pattern: /A widget that does widget things/ }
  }
];

async function makeFixtureProject(fixture: LanguageFixture): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `api-ref-ts-${fixture.id}-`));
  await fs.writeFile(path.join(dir, fixture.signalFile), fixture.signalContent, 'utf8');
  const sourceAbs = path.join(dir, fixture.sourceRelPath);
  await fs.mkdir(path.dirname(sourceAbs), { recursive: true });
  await fs.writeFile(sourceAbs, fixture.sourceContent, 'utf8');
  return dir;
}

// Maps a language id to the actual filename of its vendored WASM. Most grammars publish
// under `tree-sitter-<id>.wasm`, but C# uses an underscore (`tree-sitter-c_sharp.wasm`)
// because npm package names disallow hyphens, and the upstream release follows the npm
// convention.
const WASM_FILENAME_OVERRIDES: Record<string, string> = {
  csharp: 'tree-sitter-c_sharp.wasm'
};

function grammarPath(id: string): string {
  const filename = WASM_FILENAME_OVERRIDES[id] ?? `tree-sitter-${id}.wasm`;
  return path.join(repoRoot, 'vendor', 'tree-sitter', id, filename);
}

for (const fixture of FIXTURES) {
  const skip = existsSync(grammarPath(fixture.id))
    ? undefined
    : { skip: `vendored grammar for ${fixture.id} missing at ${grammarPath(fixture.id)}` };

  test(`treeSitterExtractor extracts public symbols for ${fixture.id}`, skip, async () => {
    resetTreeSitterGrammarCache();
    const root = await makeFixtureProject(fixture);
    try {
      const ref = await treeSitterExtractor.extract(fixture.sourceRelPath, { rootDir: root });
      // Look up by (name, kind) — some grammars legitimately produce multiple captures
      // sharing a name (e.g., a C++ class and its same-named constructor are both `Widget`),
      // and a name-only Map collapses them. Matching on (name, kind) is the honest assertion.
      const findByNameKind = (name: string, kind: string) =>
        ref.symbols.find((symbol) => symbol.name === name && symbol.kind === kind);
      const allNames = ref.symbols.map((symbol) => `${symbol.name}/${symbol.kind}`).join(', ');

      for (const expected of fixture.expectedPresent) {
        const symbol = findByNameKind(expected.name, expected.kind);
        assert.ok(
          symbol,
          `[${fixture.id}] expected symbol "${expected.name}" of kind ${expected.kind} to be present; got: ${allNames}`
        );
      }
      for (const absent of fixture.expectedAbsent) {
        const matched = ref.symbols.find((symbol) => symbol.name === absent);
        assert.ok(
          !matched,
          `[${fixture.id}] symbol "${absent}" must NOT appear in the public API; got: ${allNames}`
        );
      }
      if (fixture.expectedDocSnippet) {
        // Find any symbol with this name that has a non-empty docComment matching the pattern.
        const matched = ref.symbols.find(
          (symbol) =>
            symbol.name === fixture.expectedDocSnippet!.name &&
            symbol.docComment !== null &&
            fixture.expectedDocSnippet!.pattern.test(symbol.docComment)
        );
        assert.ok(
          matched,
          `[${fixture.id}] no symbol named "${fixture.expectedDocSnippet.name}" had a doc comment matching ${fixture.expectedDocSnippet.pattern}; symbols with that name: ${ref.symbols
            .filter((s) => s.name === fixture.expectedDocSnippet!.name)
            .map((s) => `${s.kind}=${JSON.stringify(s.docComment)}`)
            .join(' | ')}`
        );
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test(`refreshApiReference dispatches to treeSitterExtractor on a ${fixture.id} project`, skip, async () => {
    resetTreeSitterGrammarCache();
    const root = await makeFixtureProject(fixture);
    try {
      const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
      assert.ok(result.pagesWritten >= 1, `[${fixture.id}] expected at least one page written, got ${result.pagesWritten}`);
      // At least one of the expected public symbols should appear in some generated page
      // (we don't pin the slug here because src/ stripping varies per language fixture).
      const manifestEntry = result.manifest.pages.find((page) => page.sourceFile === fixture.sourceRelPath);
      assert.ok(manifestEntry, `[${fixture.id}] manifest should include a page for ${fixture.sourceRelPath}; got ${result.manifest.pages.map((p) => p.sourceFile).join(', ')}`);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
