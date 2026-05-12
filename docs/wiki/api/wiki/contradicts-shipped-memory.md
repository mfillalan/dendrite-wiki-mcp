---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/contradicts-shipped-memory.ts
---

# `src/wiki/contradicts-shipped-memory.ts`

`contradicts-shipped-memory` lint rule — catches wiki prose that asserts a feature
doesn't exist while shipped memories or project-log entries say it does.

Motivation: the dendritemcp-lessons page sat for months claiming "No Shared Free-Form
Memory Store" and "No Subconscious Background Organizer" while M1/M8/B6 actually
shipped those features. No existing lint catches that — `stale-claim` only fires on
pages with explicit [stale] claim tags, and `page-drift` measures token overlap, not
direct contradiction. This rule is the systemic fix the operator asked for: the wiki
should call out its own rot when memories prove it's wrong.

Deliberately narrow. Matches a small allowlist of negation patterns ("does not have",
"is not yet built", "is missing", headings that start with "No"). For each match it
extracts the noun-phrase object and looks for active memories that mention enough of
those object tokens AND contain an affirmative shipping keyword (shipped / implemented
/ now supports / etc.). Required overlap is high enough to suppress generic-word noise.
Pages can opt out with `contradicts-shipped-memory: ignore` in frontmatter — the
dendritemcp-lessons rewrite intentionally keeps the rule on so this never regresses.

## Exports

- [`ContradictionSignal`](#contradictionsignal) — interface
- [`detectContradictsShippedMemory`](#detectcontradictsshippedmemory) — function
- [`buildContradictsShippedMemoryMessage`](#buildcontradictsshippedmemorymessage) — function

---

### `ContradictionSignal`

**Kind:** interface · **Source:** [src/wiki/contradicts-shipped-memory.ts:22](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/contradicts-shipped-memory.ts#L22)

```ts
interface ContradictionSignal {
    sectionHeading: string;
    matchedNegation: string;
    objectTokens: string[];
    contradictingMemoryIds: string[];
    affirmingSnippets: string[];
}
```

---

### `detectContradictsShippedMemory`

**Kind:** function · **Source:** [src/wiki/contradicts-shipped-memory.ts:112](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/contradicts-shipped-memory.ts#L112)

```ts
function detectContradictsShippedMemory(pageContent: string, memories: ProjectMemoryRecord[], projectLogContent): ContradictionSignal[]
```

Scan a wiki page for prose that contradicts shipped memories. Returns one signal per
affected section (the H2/H3 the negation lives under). Empty array means no contradiction
was found — that's the healthy state.

---

### `buildContradictsShippedMemoryMessage`

**Kind:** function · **Source:** [src/wiki/contradicts-shipped-memory.ts:197](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/contradicts-shipped-memory.ts#L197)

```ts
function buildContradictsShippedMemoryMessage(signal: ContradictionSignal): string
```
