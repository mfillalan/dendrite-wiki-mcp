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
- [`RitualReminder`](#ritualreminder) — interface
- [`readPersistedRitualState`](#readpersistedritualstate) — function
- [`computeRemindersForState`](#computeremindersforstate) — function
- [`getRitualState`](#getritualstate) — function
- [`resetRitualState`](#resetritualstate) — function
- [`recordToolCall`](#recordtoolcall) — function
- [`formatRemindersForToolResponse`](#formatremindersfortoolresponse) — function

---

### `RitualState`

**Kind:** interface · **Source:** [src/wiki/ritual-state.ts:21](../../../../src/wiki/ritual-state.ts#L21)

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
}
```

---

### `RitualReminder`

**Kind:** interface · **Source:** [src/wiki/ritual-state.ts:34](../../../../src/wiki/ritual-state.ts#L34)

```ts
interface RitualReminder {
    severity: 'info' | 'nudge' | 'urgent';
    rule: string;
    text: string;
}
```

---

### `readPersistedRitualState`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:68](../../../../src/wiki/ritual-state.ts#L68)

```ts
function readPersistedRitualState(root?: string): RitualState | null
```

Read the persisted ritual state for a project root. External hook scripts call
this (or its equivalent inline) to surface ritual reminders in client lifecycle
events like Claude Code UserPromptSubmit.

---

### `computeRemindersForState`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:97](../../../../src/wiki/ritual-state.ts#L97)

```ts
function computeRemindersForState(snapshot: RitualState): RitualReminder[]
```

Compute reminders against a given state snapshot — used by external hook
scripts that read the persisted state file rather than going through
recordToolCall(). Returns the same RitualReminder[] shape as recordToolCall().

---

### `getRitualState`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:145](../../../../src/wiki/ritual-state.ts#L145)

```ts
function getRitualState(): RitualState
```

---

### `resetRitualState`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:149](../../../../src/wiki/ritual-state.ts#L149)

```ts
function resetRitualState(): void
```

---

### `recordToolCall`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:163](../../../../src/wiki/ritual-state.ts#L163)

```ts
function recordToolCall(toolName: string): RitualReminder[]
```

Record a tool call against the ritual state and return any reminders the agent
should see. Called from server.ts wrapToolResponse() for every tool invocation.

---

### `formatRemindersForToolResponse`

**Kind:** function · **Source:** [src/wiki/ritual-state.ts:237](../../../../src/wiki/ritual-state.ts#L237)

```ts
function formatRemindersForToolResponse(reminders: RitualReminder[]): string
```
