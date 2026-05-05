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
- It does not persist across MCP server restarts unless we add disk persistence (now shipped — `local-data/ritual-state.json` is written sync after every tool call so external hook scripts can read it).

## Per-Client Hardening (Recommended Layered Defense)

Above the universal layer, each client gets the strongest enforcement we can offer with its native features. These hardenings are additive — they do not replace the universal MCP layer, they reinforce it where the client supports more.

### Claude Code (CLI + VS Code) — Done

`init` writes `.claude/settings.json` with three hooks:

1. **SessionStart** injects the cold-start ritual contract once at session begin.
2. **PostToolUse on `mcp__dendrite-wiki-mcp__wiki_context`** fires the per-pass capture nudge right after orientation loads.
3. **UserPromptSubmit** runs `npx -y dendrite-wiki ritual:hook` on every user message — reads the persisted ritual state and re-injects state-aware reminders when gaps exist. Plus an inline node-e fallback that fires on context compaction.

### Codex CLI / IDE — Done

`init` writes `.codex/hooks.json` mirroring Claude Code's structure (SessionStart, PostToolUse on `wiki_context`, UserPromptSubmit running `npx -y dendrite-wiki ritual:hook`). Codex's hook protocol matches Claude Code's, so the same script works. Also appends `[features] codex_hooks = true` to `.codex/config.toml` since the flag is required for hooks to fire. The append is idempotent (no blank-line padding before `[features]` so re-runs of `writeCodexConfig` do not break equality).

### Cursor — Done

`init` writes `.cursor/hooks.json` registering `beforeMCPExecution` to run `npx -y dendrite-wiki ritual:cursor-hook`. The Cursor subcommand emits a different output JSON shape (`{permission, agentMessage}`) than Claude Code/Codex (`{hookSpecificOutput.additionalContext}`). The hook always allows the call — it never blocks — and only injects an `agentMessage` with reminders when the persisted state shows ritual gaps. `beforeSubmitPrompt` is observe-only in Cursor, so `beforeMCPExecution` is the only enforcement point.

### GitHub Copilot in VS Code — Done (with manual setup caveat)

`init` writes `.github/agents/dendrite.agent.md`, a custom Copilot agent with `hooks:` frontmatter (preview feature behind `chat.useCustomAgentHooks`). The agent has `sessionStart`, `userPromptSubmitted` (calling `ritual:hook`), and `postToolUse on wiki_context` hooks.

**The user must complete three manual steps for the hooks to fire:**

1. Toggle on the `chat.useCustomAgentHooks` setting.
2. Restart VS Code.
3. Select the `dendrite` agent in the chat panel agent picker.

If the user stays in default Agent mode, agent-scoped hooks do not fire — the universal MCP-side ritual checkpoint footer is the fallback, and it works without any setup.

### Continue.dev / Windsurf / Antigravity / Zed

No hook support. Best we can do is maximize the always-on rule surface (Continue: `alwaysApply: true`; Windsurf: `trigger: always_on`; Antigravity: AGENTS.md; Zed: AGENTS.md as first-match in the rule priority chain) and rely on the universal MCP-side enforcement layer for actual mid-session correction.

### AGENTS.md As The Lingua Franca

Every supported client reads AGENTS.md (Antigravity even prefers it over GEMINI.md). A single canonical AGENTS.md at the repo root carries the workflow protocol. Per-client files (`.cursor/rules/`, `.continue/rules/`, `.windsurf/rules/`, `.github/copilot-instructions.md`) become thin pointers to the AGENTS.md plus client-specific quirks (like Continue's invokable prompt format).

## Implementation Status

| Layer | Status | Implementation |
|---|---|---|
| Universal MCP-side response injection | Done | [src/wiki/ritual-state.ts](../../src/wiki/ritual-state.ts), [src/server.ts](../../src/server.ts) |
| State persistence to `local-data/ritual-state.json` for external hook scripts | Done | [src/wiki/ritual-state.ts](../../src/wiki/ritual-state.ts) |
| `dendrite-wiki ritual:hook` CLI subcommand (Claude Code / Codex output shape) | Done | [src/cli.ts](../../src/cli.ts) |
| `dendrite-wiki ritual:cursor-hook` CLI subcommand (Cursor output shape) | Done | [src/cli.ts](../../src/cli.ts) |
| Ritual state tests + persistence tests | Done | [test/ritual-state.test.ts](../../test/ritual-state.test.ts) |
| Claude Code SessionStart + PostToolUse + UserPromptSubmit hooks | Done | `.claude/settings.json` (installer-seeded by `init`) |
| Codex `[features] codex_hooks = true` + `.codex/hooks.json` | Done | [src/install.ts](../../src/install.ts) |
| Cursor `.cursor/hooks.json` with `beforeMCPExecution` | Done | [src/install.ts](../../src/install.ts) |
| Custom Copilot agent file `.github/agents/dendrite.agent.md` | Done (preview, requires manual setup) | [src/install.ts](../../src/install.ts) |
| Cursor hooks schema verification against current Cursor docs | Open follow-up | — |
| Copilot agent hook output schema verification against real VS Code install | Open follow-up | — |
| Continue / Windsurf / Antigravity / Zed | No hook system; covered by universal layer + always-on rules | — |

## Why Universal Was Built First

Three reasons drove shipping the universal MCP-side layer before any per-client hooks:

1. **It works everywhere immediately.** A user on Continue or Zed gets the same enforcement as a user on Claude Code. No per-client gap.
2. **It cannot be disabled by hook misconfiguration.** Hook scripts can fail silently, get stale paths, or be skipped by editor restarts. The MCP server response path is exercised on every tool call, so it cannot fall off.
3. **It is the easiest piece to verify.** The ritual reminders appear in the actual tool response payloads, which means we can test them with a single test file and observe them in real session behavior.

Per-client hardening is genuine value-add but it is supplementary, not foundational.

## Claims

- [current] Dendrite Wiki MCP now ships a universal MCP-side ritual state layer that injects ritual checkpoint reminders into every tool response, working in every MCP client without depending on client-specific hooks. Implemented in src/wiki/ritual-state.ts and wired into all 22 MCP tools via wrapToolResponse() in src/server.ts. Sources: file:src/wiki/ritual-state.ts, file:src/server.ts, [Project Log](./project-log.md)
- [current] Cross-client research (2026-05-05) confirmed that hook-style enforcement is available only in Claude Code, Codex, Cursor (limited), and Copilot (custom agents only); Continue, Windsurf, Antigravity, and Zed have no comparable surface. AGENTS.md is the cross-tool standard recognized by all listed clients. Sources: file:src/wiki/ritual-state.ts, [Agent Workflow](./agent-workflow.md)
- [current] All four hook-capable clients (Claude Code, Codex, Cursor, Copilot) now have per-client hardening on top of the universal MCP-side ritual layer. The installer writes the strongest enforcement each client supports, and the `dendrite-wiki ritual:hook` and `ritual:cursor-hook` CLI subcommands provide the state-aware reminder logic that hook scripts invoke. Sources: file:src/install.ts, file:src/cli.ts, [Project Log](./project-log.md)

## Promoted Lessons

- Two confirmed observations of agent-discipline drift during long implementation sessions (warning memories `mem_7d531792` and `mem_5480f5cc`) drove the conclusion that passive instructions + SessionStart-only hooks are insufficient. The redesign moves enforcement to the MCP response layer because that channel is exercised on every tool call regardless of client and cannot be silently disabled.
