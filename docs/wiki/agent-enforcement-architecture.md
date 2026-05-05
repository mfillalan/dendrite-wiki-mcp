---
lifecycle: active
owner: Michael Fillalan
sourceCoverage: partial
---

# Agent Enforcement Architecture

This page is the canonical design document for how Dendrite Wiki MCP enforces agent discipline across the major MCP clients. It exists because agents drift even when given clear instructions, and the previous architecture (passive instructions + a single SessionStart hook) was insufficient to prevent that drift in real long sessions.

## The Problem

The Dendrite product depends on agents following a small set of rituals consistently:

1. Call `wiki_context` at session start to load the briefing.
2. Capture non-obvious lessons via `memory_remember` during work, not just at the end.
3. Call `memory_handoff` at session end when work remains unfinished.
4. Append meaningful changes to the project log via `wiki_log`.

Across at least two confirmed dogfood sessions (see warning memories `mem_7d531792` and `mem_5480f5cc`), the agent reliably did the start-of-session ritual, then drifted mid-session and stopped capturing memories. The drift happened *even when the agent had explicit visibility into prior warning memories about the same drift*. This proves passive recall is not enough — the discipline has to be enforced in places the agent literally cannot ignore.

## Cross-Client Capability Matrix

Research conducted 2026-05-05 across the major MCP clients. The strength of the available enforcement vector varies dramatically by client.

| Client | Hook system | Mid-session re-injection | Tool-call blocking | AGENTS.md | Best enforcement vector |
|---|---|---|---|---|---|
| Claude Code (CLI + VS Code) | Strong (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, PreCompact, PermissionRequest) | Yes (UserPromptSubmit returns `additionalContext`) | Yes (PreToolUse can block) | Yes | Layered hooks |
| OpenAI Codex (CLI + IDE) | Strong (SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, Stop) | Yes | Yes | Yes (override layer) | Layered hooks (mirrors Claude Code) |
| Cursor | Limited (6 events; only `beforeMCPExecution` and `beforeShellExecution` can block) | No (`beforeSubmitPrompt` is observe-only) | Partial (MCP gating) | Yes | `beforeMCPExecution` hook + `alwaysApply: true` rules |
| GitHub Copilot in VS Code | Agent-scoped only (`.agent.md` frontmatter `hooks` — preview, behind `chat.useCustomAgentHooks`) | Yes (when using a custom agent) | Yes (preToolUse in custom agents) | Yes | Custom agent file with hooks |
| Continue.dev | None | No | No | Yes | `alwaysApply: true` rules + invokable prompts |
| Windsurf | None | No | No | Yes | `always_on` workspace rules |
| Antigravity | None documented | No | MCP allow/denylist only | Yes (preferred over GEMINI.md) | AGENTS.md + workflows |
| Zed | None | No | Strong (settings.json `agent.tool_permissions` per-tool gating) | Yes (first-match wins) | settings.json patterns |

The asymmetry is the central design constraint: only Claude Code and Codex can mid-session block a non-compliant agent. Every other client requires us to use whatever enforcement surface is available, and to rely on a universal layer that works regardless of client.

## The Universal Layer: MCP-Side Response Injection

The one mechanism that works in every MCP client is the tool response itself. Every client surfaces tool response text to the agent's context window. So the MCP server can inject ritual reminders into every tool response, and the agent literally cannot ignore them without seeing them.

This is implemented in [src/wiki/ritual-state.ts](../../src/wiki/ritual-state.ts) and wired into every tool callback in [src/server.ts](../../src/server.ts) via a `wrapToolResponse(toolName, baseText)` helper.

### How It Works

The MCP server process maintains in-memory ritual state for the lifetime of the session (one MCP server process equals one editor session):

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

Every tool call invokes `recordToolCall(toolName)` which updates state and computes any active reminders. Reminders are appended as a second text content block in the tool response, after the actual payload:

```
{
  "content": [
    { "type": "text", "text": "{ ...actual JSON payload... }" },
    { "type": "text", "text": "\n---\n## RITUAL CHECKPOINT\n\n!! URGENT (no-wiki-context): ..." }
  ]
}
```

### Reminder Rules

Three deterministic rules drive the reminders today:

| Rule | Severity | Trigger | What it tells the agent |
|---|---|---|---|
| `no-wiki-context` | URGENT | wiki_context not yet called this session AND the agent is doing other work (toolCallCount > 1) | "Call wiki_context now to load the briefing before further substantial work." |
| `no-recent-memory-remember` | NUDGE | 8+ tool calls since the last memory_remember AND meaningful work happened in recent activity (writes, logs, applies) | "Capture lessons learned via memory_remember now — facts, warnings, or workflow gotchas the next session should inherit." |
| `long-session-no-handoff` | INFO | 15+ tool calls in the session AND no memory_handoff yet | "If work remains unfinished at session end, call memory_handoff with summary, next steps, and open questions." |

The thresholds are tuned to be insistent without being noisy. The first rule fires immediately; the others wait until the agent has plausibly had reason to act.

### Why This Works In Every Client

- The MCP protocol spec defines tool responses as having `content: ContentBlock[]`. Every spec-compliant client surfaces this content to the agent.
- We do not depend on hooks, statuslines, custom agent files, or any client-specific feature.
- The agent sees the reminder *in the same response payload it just requested*, so the reminder enters context the same way the data does — there is no separate channel for the agent to ignore.
- If the agent is using *any* MCP client to talk to Dendrite, the ritual reminders fire.

### What This Does Not Solve

- It cannot *force* the agent to call `wiki_context` — it can only make the omission impossible to miss.
- It does not work on the very first tool call of a fresh session (because it needs at least one tool call to record state).
- It does not persist across MCP server restarts unless we add disk persistence (deferred to a later pass when external hook scripts need to read state).

## Per-Client Hardening (Recommended Layered Defense)

Above the universal layer, each client gets the strongest enforcement we can offer with its native features. These hardenings are additive — they do not replace the universal MCP layer, they reinforce it where the client supports more.

### Claude Code (CLI + VS Code)

**Today:** SessionStart hook (`mem_5480f5cc` documents how this drifts mid-session).

**Recommended additions:**
1. **UserPromptSubmit hook** — re-inject ritual status on every user message. Reads ritual state file written by the MCP server, returns `additionalContext` with the current ritual checkpoint.
2. **PreToolUse hook with matcher `mcp__dendrite-wiki-mcp__(?!wiki_context)`** — warn (not block, to avoid breaking real work) when other dendrite tools are called before wiki_context.
3. **PostToolUse hook on `mcp__dendrite-wiki-mcp__wiki_context`** — confirms briefing loaded, writes a session-state marker so the UserPromptSubmit hook knows the briefing has happened.

### Codex CLI / IDE

Codex's hook system mirrors Claude Code's almost exactly. The same hook scripts can be used by writing them to `.codex/hooks.json` instead of `.claude/settings.json`. Requires `[features] codex_hooks = true` in `config.toml`.

### Cursor

`beforeMCPExecution` is the only enforceable surface. Use it to log non-wiki-context MCP calls and surface a warning when wiki_context has not been called this session. `beforeSubmitPrompt` cannot inject prompts — it can only observe.

### GitHub Copilot in VS Code

Ship a custom agent at `.github/agents/dendrite.agent.md` with `hooks:` frontmatter (preview feature behind `chat.useCustomAgentHooks`). The custom agent's `preToolUse` hook can enforce ritual ordering. The user must select the Dendrite agent for hooks to fire — fall back to instruction files if they use the default Agent mode.

### Continue.dev / Windsurf / Antigravity / Zed

No hook support. Best we can do is maximize the always-on rule surface (Continue: `alwaysApply: true`; Windsurf: `trigger: always_on`; Antigravity: AGENTS.md; Zed: AGENTS.md as first-match in the rule priority chain) and rely on the universal MCP-side enforcement layer for actual mid-session correction.

### AGENTS.md As The Lingua Franca

Every supported client reads AGENTS.md (Antigravity even prefers it over GEMINI.md). A single canonical AGENTS.md at the repo root carries the workflow protocol. Per-client files (`.cursor/rules/`, `.continue/rules/`, `.windsurf/rules/`, `.github/copilot-instructions.md`) become thin pointers to the AGENTS.md plus client-specific quirks (like Continue's invokable prompt format).

## Implementation Status

| Layer | Status | Implementation |
|---|---|---|
| Universal MCP-side response injection | Done | [src/wiki/ritual-state.ts](../../src/wiki/ritual-state.ts), [src/server.ts](../../src/server.ts) |
| Ritual state tests | Done | [test/ritual-state.test.ts](../../test/ritual-state.test.ts) |
| Claude Code SessionStart hook | Existing (drifts) | `.claude/settings.json` |
| Claude Code UserPromptSubmit hook | Planned | Next pass |
| Claude Code PreToolUse warning hook | Planned | Next pass |
| Codex hooks.json | Planned | Next pass |
| Cursor hooks.json | Planned | Next pass |
| Custom Copilot agent file | Planned | Next pass |
| Per-client guidance file updates referencing the new ritual layer | Planned | Next pass |
| State persistence to disk for hook scripts to read | Planned | Required by hook scripts |

## Why Universal Was Built First

Three reasons drove shipping the universal MCP-side layer before any per-client hooks:

1. **It works everywhere immediately.** A user on Continue or Zed gets the same enforcement as a user on Claude Code. No per-client gap.
2. **It cannot be disabled by hook misconfiguration.** Hook scripts can fail silently, get stale paths, or be skipped by editor restarts. The MCP server response path is exercised on every tool call, so it cannot fall off.
3. **It is the easiest piece to verify.** The ritual reminders appear in the actual tool response payloads, which means we can test them with a single test file and observe them in real session behavior.

Per-client hardening is genuine value-add but it is supplementary, not foundational.

## Claims

- [current] Dendrite Wiki MCP now ships a universal MCP-side ritual state layer that injects ritual checkpoint reminders into every tool response, working in every MCP client without depending on client-specific hooks. Implemented in src/wiki/ritual-state.ts and wired into all 22 MCP tools via wrapToolResponse() in src/server.ts. Sources: file:src/wiki/ritual-state.ts, file:src/server.ts, [Project Log](./project-log.md)
- [current] Cross-client research (2026-05-05) confirmed that hook-style enforcement is available only in Claude Code, Codex, Cursor (limited), and Copilot (custom agents only); Continue, Windsurf, Antigravity, and Zed have no comparable surface. AGENTS.md is the cross-tool standard recognized by all listed clients. Sources: file:src/wiki/ritual-state.ts, [Agent Workflow](./agent-workflow.md)

## Promoted Lessons

- Two confirmed observations of agent-discipline drift during long implementation sessions (warning memories `mem_7d531792` and `mem_5480f5cc`) drove the conclusion that passive instructions + SessionStart-only hooks are insufficient. The redesign moves enforcement to the MCP response layer because that channel is exercised on every tool call regardless of client and cannot be silently disabled.
