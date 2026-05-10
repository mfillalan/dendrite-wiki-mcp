---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/memory-auto-clean.ts
---

# `src/wiki/memory-auto-clean.ts`

Memory auto-clean runner — applies a batch of LLM-produced verdicts against the
project-local memory store and records the run so it can be audited and reverted.

The MCP server itself stays LLM-free. A calling agent (the local Ollama bridge
behind the Review Board's "Auto-clean" button, or any other LLM caller) produces
the verdicts and posts them as a single batch. This module is the apply-and-audit
layer between that LLM output and the durable memory store.

Verb set, current scope:
  - `archive`         — flip memory.status active → archived (revertible).
  - `keep-and-watch`  — no-op verdict; recorded so the audit reflects what the
                        LLM saw and chose to leave alone.

Promote/merge/add-source/rephrase verbs are deliberately out of scope here —
each has its own validation path (memory_promote / memory_promote_skill /
memory_remember) and shouldn't be folded into a bulk-apply batch until we have
per-verb safety nets matching what those tools already enforce.

Run records live in `local-data/auto-clean-runs.json` as an append-only log
keyed by `runId`. `revertAutoCleanRun(runId)` walks the recorded decisions and
undoes them (currently: restore any archived memories via restoreProjectMemory).
Keep-and-watch verdicts don't need reverting.

## Exports

- [`AutoCleanVerb`](#autocleanverb) — type alias
- [`AutoCleanDecision`](#autocleandecision) — interface
- [`AutoCleanOutcome`](#autocleanoutcome) — type alias
- [`AutoCleanSkipReason`](#autocleanskipreason) — type alias
- [`AutoCleanDecisionResult`](#autocleandecisionresult) — interface
- [`AutoCleanRun`](#autocleanrun) — interface
- [`RevertAutoCleanRunResult`](#revertautocleanrunresult) — interface
- [`resolveAutoCleanRunStorePath`](#resolveautocleanrunstorepath) — function
- [`applyAutoCleanDecisions`](#applyautocleandecisions) — function
- [`revertAutoCleanRun`](#revertautocleanrun) — function
- [`listAutoCleanRuns`](#listautocleanruns) — function

---

### `AutoCleanVerb`

**Kind:** type alias · **Source:** [src/wiki/memory-auto-clean.ts:30](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L30)

```ts
type AutoCleanVerb = 'archive' | 'keep-and-watch'
```

---

### `AutoCleanDecision`

**Kind:** interface · **Source:** [src/wiki/memory-auto-clean.ts:32](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L32)

```ts
interface AutoCleanDecision {
    memoryId: string;
    verb: AutoCleanVerb;
    reason: string;
    confidence?: number;
}
```

---

### `AutoCleanOutcome`

**Kind:** type alias · **Source:** [src/wiki/memory-auto-clean.ts:39](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L39)

```ts
type AutoCleanOutcome = 'applied' | 'noop' | 'skipped'
```

---

### `AutoCleanSkipReason`

**Kind:** type alias · **Source:** [src/wiki/memory-auto-clean.ts:40](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L40)

```ts
type AutoCleanSkipReason = 'memory-not-found' | 'already-archived'
```

---

### `AutoCleanDecisionResult`

**Kind:** interface · **Source:** [src/wiki/memory-auto-clean.ts:42](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L42)

```ts
interface AutoCleanDecisionResult {
    memoryId: string;
    verb: AutoCleanVerb;
    reason: string;
    confidence?: number;
    outcome: AutoCleanOutcome;
    skipReason?: AutoCleanSkipReason;
}
```

---

### `AutoCleanRun`

**Kind:** interface · **Source:** [src/wiki/memory-auto-clean.ts:51](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L51)

```ts
interface AutoCleanRun {
    runId: string;
    createdAt: string;
    decisions: AutoCleanDecisionResult[];
    summary: {
        archived: number;
        kept: number;
        skipped: number;
    };
    reverted?: {
        revertedAt: string;
        restored: number;
        skipped: number;
    };
}
```

---

### `RevertAutoCleanRunResult`

**Kind:** interface · **Source:** [src/wiki/memory-auto-clean.ts:67](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L67)

```ts
interface RevertAutoCleanRunResult {
    runId: string;
    reverted: boolean;
    restoredMemoryIds: string[];
    skippedMemoryIds: string[];
    refusalReason?: 'run-not-found' | 'already-reverted';
}
```

---

### `resolveAutoCleanRunStorePath`

**Kind:** function · **Source:** [src/wiki/memory-auto-clean.ts:83](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L83)

```ts
function resolveAutoCleanRunStorePath(root: string): string
```

---

### `applyAutoCleanDecisions`

**Kind:** function · **Source:** [src/wiki/memory-auto-clean.ts:87](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L87)

```ts
function applyAutoCleanDecisions(decisions: AutoCleanDecision[], root: string): Promise<AutoCleanRun>
```

---

### `revertAutoCleanRun`

**Kind:** function · **Source:** [src/wiki/memory-auto-clean.ts:127](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L127)

```ts
function revertAutoCleanRun(runId: string, root: string): Promise<RevertAutoCleanRunResult>
```

---

### `listAutoCleanRuns`

**Kind:** function · **Source:** [src/wiki/memory-auto-clean.ts:166](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-auto-clean.ts#L166)

```ts
function listAutoCleanRuns(root: string): Promise<AutoCleanRun[]>
```
