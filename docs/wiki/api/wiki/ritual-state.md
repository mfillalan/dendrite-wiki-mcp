---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/ritual-state.ts
---

# `src/wiki/ritual-state.ts`

Universal MCP-side ritual state tracker.

Lives for the lifetime of one MCP server process (which equals one editor session).
Tracks whether the agent has performed key rituals (wiki_context briefing,
memory captures, handoff at session end) and surfaces gentle reminders in tool
responses so the agent literally cannot ignore them.

This is the universal enforcement layer that works in every MCP client because
every client surfaces tool response text to the agent's context window.

State is also persisted to local-data/ritual-state.json after every tool call so
external client hooks (Claude Code UserPromptSubmit, Codex hooks, etc.) can read
the current ritual posture and inject matching reminders into their own client's
lifecycle events.

## Exports

- [`RitualState`](#ritualstate) — interface
- [`RecordToolCallMetadata`](#recordtoolcallmetadata) — interface
- [`RitualReminder`](#ritualreminder) — interface
- [`readPersistedRitualState`](#readpersistedritualstate) — function
- [`tokenizeGoalQuery`](#tokenizegoalquery) — function
- [`jaccardOverlap`](#jaccardoverlap) — function
- [`formatRelativeAge`](#formatrelativeage) — function
- [`computeRemindersForState`](#computeremindersforstate) — function
- [`getRitualState`](#getritualstate) — function
- [`resetRitualState`](#resetritualstate) — function
- [`recordToolCall`](#recordtoolcall) — function
- [`getRitualGateRejection`](#getritualgaterejection) — function
- [`formatRemindersForToolResponse`](#formatremindersfortoolresponse) — function

---

### `RitualState`

**Kind:** interface · **Source:** [src/wiki/ritual-state.ts:21](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L21)

```ts
interface RitualState {
    sessionId: string;
    startedAt: string;
    wikiContextCalled: boolean;
    wikiContextCalledAt: string | null;
    lastMemoryRememberAt: string | null;
    lastWikiLogAt: string | null;
    handoffCalled: boolean;
    toolCallCount: number;
    toolCallsSinceLastMemoryRemember: number;
    recentTools: string[];
    currentGoal: {
        query: string;
        setAt: string;
    } | null;
}
```

---

### `RecordToolCallMetadata`

**Kind:** interface · **Source:** [src/wiki/ritual-state.ts:45](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L45)

```ts
interface RecordToolCallMetadata {
    query?: string;
}
```

Optional per-tool metadata passed to recordToolCall. Currently only used to thread
the wiki_context query through to the current-goal logic (B4).

---

### `RitualReminder`

**Kind:** interface · **Source:** [src/wiki/ritual-state.ts:49](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L49)

```ts
interface RitualReminder {
    severity: 'info' | 'nudge' | 'urgent';
    rule: string;
    text: string;
}
```

---

### `readPersistedRitualState`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:90](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L90)

```ts
function readPersistedRitualState(root?: string): RitualState | null
```

Read the persisted ritual state for a project root. External hook scripts call
this (or its equivalent inline) to surface ritual reminders in client lifecycle
events like Claude Code UserPromptSubmit.

---

### `tokenizeGoalQuery`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:125](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L125)

```ts
function tokenizeGoalQuery(query: string): string[]
```

Tokenize a query string for Jaccard token-overlap comparison (B4). Lowercase, split
on non-letter/digit boundaries, drop very short tokens to reduce stop-word noise.
Public for testing.

---

### `jaccardOverlap`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:141](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L141)

```ts
function jaccardOverlap(left: string, right: string): number
```

Compute Jaccard token-set overlap between two queries. Returns 0 when either side
tokenizes to the empty set. Used by the current-goal slot to decide whether a new
wiki_context query is distinct enough to replace the existing goal.

---

### `formatRelativeAge`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:157](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L157)

```ts
function formatRelativeAge(setAt: string, now: Date): string
```

Format a relative-time phrase like "3 minutes ago" / "just now" / "2 hours ago"
for the ritual footer current-goal line. Public for testing.

---

### `computeRemindersForState`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:177](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L177)

```ts
function computeRemindersForState(snapshot: RitualState): RitualReminder[]
```

Compute reminders against a given state snapshot — used by external hook
scripts that read the persisted state file rather than going through
recordToolCall(). Returns the same RitualReminder[] shape as recordToolCall().

---

### `getRitualState`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:226](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L226)

```ts
function getRitualState(): RitualState
```

---

### `resetRitualState`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:230](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L230)

```ts
function resetRitualState(): void
```

---

### `recordToolCall`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:246](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L246)

```ts
function recordToolCall(toolName: string, metadata: RecordToolCallMetadata): RitualReminder[]
```

Record a tool call against the ritual state and return any reminders the agent
should see. Called from server.ts wrapToolResponse() for every tool invocation.
Optional `metadata` lets specific tools thread additional context (B4 uses query).

---

### `getRitualGateRejection`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:380](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L380)

```ts
function getRitualGateRejection(toolName: string): {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError: true;
} | undefined
```

Returns a rejection content payload when `toolName` is gated and wiki_context
has not been called this session. Returns undefined when the call is allowed.

The rejection is shaped as a normal tool response with `isError: true` so MCP
clients render it the same way they render any other tool failure — the agent
sees an error message naming the exact tool to call to unblock itself.

Bypass: `DENDRITE_DISABLE_RITUAL_GATE=1` short-circuits to "allow" so existing
integration tests that drive the MCP tool surface directly can keep working
without prepending a wiki_context call to every scenario. The bypass is opt-in
— production agent sessions never set it.

---

### `formatRemindersForToolResponse`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:404](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/ritual-state.ts#L404)

```ts
function formatRemindersForToolResponse(reminders: RitualReminder[]): string
```
