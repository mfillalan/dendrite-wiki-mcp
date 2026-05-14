# @rarusoft/dendrite-memory

> The AI memory brain core, extracted from [Dendrite Wiki MCP](https://github.com/mfillalan/dendrite-wiki-mcp) as a reusable library.

A standalone, wiki-agnostic project-local memory store for AI coding agents. Drop it into any TypeScript project that needs durable lessons, explainable recall, Hebbian memory trails, skills-as-memory, observation capture, ritual state, and recall benchmarking — without bringing the markdown-wiki UI along with you.

## Status

`0.1.0-alpha.0` — publish-prep alpha. The package is now public-publishable from the monorepo workflow; the first real registry publish should use the `alpha` dist-tag, then dogfood the package in a second active project before promoting it. See the [Library Extraction Roadmap](../../docs/wiki/library-extraction-roadmap.md) for the migration story and Phase 5 plan.

## What's inside

| Module                | Surface                                                                                                                                                                       |
|----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `memory-store`       | `rememberProjectMemory`, `recallProjectMemories`, `rememberProjectHandoff`, `pinProjectMemory`, `promoteMemoryToSkill`, `forgetProjectMemory`, `restoreProjectMemory`, `reviewProjectMemories`. The brain heart. |
| `memory-edges`       | Hebbian memory trails (lazy decay, bipartite projection shadow). `reinforceQueryEdges`, `loadMemoryTrailBonusLookup`.                                                         |
| `memory-storage`     | The filesystem boundary. `FilesystemMemoryStorage` is the default; implement `MemoryStorage` for SQLite, HTTP, in-memory, etc.                                                |
| `memory-promotion`   | Memory → CanonicalTarget promotion pipeline. `draftProjectMemoryPromotion`, `applyProjectMemoryPromotion`.                                                                    |
| `auto-promote`       | Trust-gated promotion sweep (operator opt-in via `DENDRITE_AUTO_PROMOTE=on`).                                                                                                  |
| `consolidate`        | Sleep-cycle consolidation pass.                                                                                                                                                |
| `memory-auto-archive`| Synaptic-pruning sweep (deterministic; no LLM).                                                                                                                                |
| `memory-auto-clean`  | LLM-assisted bulk archive with revertible runs.                                                                                                                                |
| `skill-matching`     | 5-dimensional scope ranking (file patterns, frameworks, languages, task keywords, match mode).                                                                                |
| `skill-portability`  | Export / import skills as portable markdown bundles.                                                                                                                           |
| `recall-benchmark`   | Probe runner with auto-derived self-recall fallback.                                                                                                                           |
| `raw-observations`   | JSONL sensory buffer + cluster detection (the agent's PostToolUse hook target).                                                                                                |
| `session-outcome`    | Synaptic tagging of observation clusters (`verified-success` / `likely-error` / `inconclusive`).                                                                              |
| `observation-compressor` | LLM-assisted observation-cluster compaction prompt.                                                                                                                       |
| `embedding-provider` | Optional cosine similarity (OpenAI-compatible). Disabled by default — pass an API key to turn on.                                                                              |
| `operator-phrasebook`| UserPromptSubmit-hook pattern matcher (recognizes "from now on", "wrapping up", etc.).                                                                                         |
| `ritual-state`       | Session bookkeeping + Stop/PreEdit gate logic.                                                                                                                                 |
| `page-drift-snoozes` | Operator dismiss state for drift findings.                                                                                                                                     |
| `tokenize`           | Brain-owned query tokenization.                                                                                                                                                |
| `canonical-target`   | `CanonicalTarget` interface + module-level default-target DI registry. Implement this on the wiki / Notion / Obsidian / etc. side.                                            |

## Quickstart

```ts
import {
  createFilesystemMemoryStorage,
  rememberProjectMemory,
  recallProjectMemories,
  setDefaultCanonicalTarget,
  type CanonicalTarget
} from '@rarusoft/dendrite-memory';

// 1. Wire up storage. The filesystem adapter writes under `local-data/` of the
//    process cwd; pass an explicit root to override, or implement MemoryStorage
//    for a different backend (SQLite, HTTP, in-memory).
//    Storage is auto-resolved from process.cwd() when not overridden.
const storage = createFilesystemMemoryStorage();

// 2. Optionally register a CanonicalTarget so memory promotion has somewhere
//    to land. Without one, memory_promote raises a clear "no canonical target
//    registered" error. The wiki adapter @rarusoft/dendrite-wiki ships a markdown
//    implementation; you can write your own for Notion / Obsidian / etc.
setDefaultCanonicalTarget(myCanonicalTarget satisfies CanonicalTarget);

// 3. Use the brain.
const memory = await rememberProjectMemory({
  text: 'Auth tokens must be hashed at rest because the legacy plaintext path leaked them in logs.',
  kind: 'lesson',
  tags: ['auth', 'security'],
  relatedFiles: ['src/auth/middleware.ts'],
  sources: [{ kind: 'file', slug: 'src/auth/middleware.ts' }]
});

const recall = await recallProjectMemories({
  query: 'how do we store auth tokens?',
  relatedFiles: ['src/auth/middleware.ts']
});

for (const result of recall) {
  console.log(`${result.text}\n  reasons: ${result.reasons.join('; ')}`);
}
```

## Design contracts

The brain has zero back-references into any wiki implementation. Two contract tests in the parent monorepo pin this at `npm test` time:

- `test/brain-no-direct-fs.test.ts` — five brain modules (`memory-store`, `memory-edges`, `raw-observations`, `ritual-state`, `page-drift-snoozes`) must reach persistent state ONLY through `MemoryStorage`. No direct `node:fs` imports.
- `test/brain-no-wiki-coupling.test.ts` — the three promotion-path modules (`memory-promotion`, `auto-promote`, `consolidate`) must reach the canonical destination ONLY through the `CanonicalTarget` interface. No imports from any wiki store.

`npm run build -w @rarusoft/dendrite-memory` succeeds standalone (proves the same at the type-resolution level).

## Why the brain is its own package

Memory and wiki have different lifecycles. Memory mutates on every recall, every observation, every session. The wiki mutates only on review-board action or operator edit. Separating them means:

1. **Drop the brain into projects that don't have a wiki.** A CLI tool, a CI bot, an existing Notion workspace — none need the markdown UI.
2. **Adapter freedom for the canonical destination.** Implement `CanonicalTarget` against whatever your project already trusts as durable knowledge.
3. **The wiki keeps its identity.** When the brain ships standalone, `@rarusoft/dendrite-wiki` stays focused on the markdown surface that makes it readable, diff-able, and survivable past uninstall.

## Related

- [`@rarusoft/dendrite-wiki`](../wiki/) — the markdown-wiki adapter that implements `CanonicalTarget` for VitePress-rendered docs.
- [Dendrite Wiki MCP](https://github.com/mfillalan/dendrite-wiki-mcp) — the umbrella product that bundles brain + wiki + MCP server.
- [Library Extraction Roadmap](../../docs/wiki/library-extraction-roadmap.md) — the full migration story.

## License

Apache-2.0.
