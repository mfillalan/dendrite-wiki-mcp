---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-11
source-coverage: shipped
---

# Operator Phrasebook

This page documents the high-signal phrases the agent's UserPromptSubmit hook
(`dendrite-wiki ritual:hook`) recognizes in your prompts, and the MCP tool each
phrase points at. The goal is simple: **say the why out loud, and the system
captures it for you.**

The phrasebook is part of the [Brain-Faithfulness Roadmap](./brain-faithfulness-roadmap.md)
B3 slice. It's purely advisory — the hook never blocks a prompt. When you use one
of the phrases below in a Claude Code or Codex conversation, the next agent
response gets a one-line nudge suggesting the right MCP tool. You can ignore the
nudge; the only thing the system enforces is the Stop-time memory deposit gate
(B1).

The canonical pattern list lives in
[`src/wiki/operator-phrasebook.ts`](../../src/wiki/operator-phrasebook.ts).
Tests at [`test/operator-phrasebook.test.ts`](../../test/operator-phrasebook.test.ts)
exercise each category.

## Durable intent — captures the WHY behind a rule

When the system hears these phrases, it nudges the agent to call
`memory_remember` with a `kind: "lesson"` (or `"warning"`) and causal language
explaining why the rule matters. The B10 why-linter will then accept the lesson
because the body carries the WHY.

| Say this | Agent should | Why |
|---|---|---|
| **"from now on …"** | Call `memory_remember` (kind: `lesson`) | New durable rule; future sessions inherit it via recall ranking. |
| **"the reason we …"** | Call `memory_remember` (kind: `lesson`) | You're explaining motivation, not procedure — the high-leverage half of a lesson. |
| **"the reason this …"** | Call `memory_remember` (kind: `lesson`) | Same pattern; captures the rationale anchored to a specific thing. |
| **"the reason for …"** | Call `memory_remember` (kind: `lesson`) | Same pattern; captures the rationale anchored to a specific outcome. |
| **"we learned the hard way …"** | Call `memory_remember` (kind: `warning`) | Past-incident lesson — the warning kind tells future agents to actively avoid. |
| **"we learned that …"** | Call `memory_remember` (kind: `lesson` or `warning`) | Generic durable-lesson trigger; pick lesson for positive guidance, warning for avoid-this. |

## Scope-setting — captures a rule scoped to file/framework/task

When you tell the agent that a rule applies in a specific file pattern, language,
or framework, the nudge points it at `memory_remember` with `kind: "skill"` and
a scope object. Skill memories auto-surface in `wiki_context` for matching tasks
without requiring the agent to remember to recall them.

| Say this | Agent should | Why |
|---|---|---|
| **"whenever you're editing \<glob\> …"** | Call `memory_remember` (kind: `skill`) with `scope.filePatterns` | File-scoped procedural memory — auto-surfaces for matching edits. |
| **"whenever you edit …"** | Call `memory_remember` (kind: `skill`) with `scope.filePatterns` | Same pattern; slightly different phrasing. |
| **"when editing …"** | Call `memory_remember` (kind: `skill`) with `scope.filePatterns` | Catches the most common phrasing. |
| **"whenever working on \<topic\> …"** | Call `memory_remember` (kind: `skill`) with `scope.taskKeywords` | Task-keyword-scoped — auto-surfaces when the user mentions the topic. |

## Session boundary — captures benchmark + handoff signals

These phrases tell the agent the session is starting or ending, which is when
the benchmark snapshot, handoff, and `wiki_context` rituals have the most value.

| Say this | Agent should | Why |
|---|---|---|
| **"wrapping up"** | Call `memory_handoff` + `dendrite-wiki benchmark:snapshot --label session-end` | End-of-session signal — handoff preserves continuation state, snapshot anchors the recall trend. |
| **"ending the session"** | Same as above | Same signal. |
| **"starting fresh"** | Call `wiki_context` + `dendrite-wiki benchmark:snapshot --label session-start` | Start-of-session signal — `wiki_context` surfaces handoffs and the memory backlog. |
| **"pick up where (we left off)"** | Call `wiki_context` and read its `handoffs[]` first | Session-resume signal — handoffs are the structured continuation layer. |

## Reviewer-control verbs — direct chat commands

These let you operate the Review Board without leaving chat. Useful for the
"I just want to triage one thing without opening the browser" workflow.

| Say this | Agent should | Notes |
|---|---|---|
| **"pin that (one)"** | Call `memory_pin` with `salience: 2` or `salience: 3` | Salience: 2 = important, 3 = critical. Pinned memories outrank routine memories. See [Brain-Faithfulness Roadmap](./brain-faithfulness-roadmap.md) B2. |
| **"promote that (one)"** | Call `memory_promote` (or `memory_promote_skill`) | Turns the most-recently-recalled memory into a canonical wiki page (or scoped skill if it has file/framework context). |
| **"forget that (one)"** | Call `memory_forget` with the matched ID | Default mode is `archive` (reversible via `memory_restore`). Use `mode: "delete"` only if the memory is *wrong*, not just *outdated*. |
| **"clean the review (board)"** | Call `wiki_maintenance_inbox` + `memory_auto_clean_apply` | Surfaces the queue and optionally runs an LLM-assisted batch cleanup (operator-reviewable, fully revertible). |

## How the matcher works

The phrasebook lives in [`src/wiki/operator-phrasebook.ts`](../../src/wiki/operator-phrasebook.ts).
Each entry is a `{ category, pattern, nudge }` triple. The matcher:

1. Lowercases your prompt and scans for each pattern as a case-insensitive
   substring with a word-boundary check on the right edge (so "from now on" does
   not match "from now once").
2. Returns one match per rule that fires. Multiple categories can fire on a
   single prompt — each surfaces independently.
3. The hook script joins all matches into a single `additionalContext` block
   tagged `[DENDRITE OPERATOR PHRASEBOOK]`, appended after the regular ritual
   checkpoint reminders.

Because the patterns are deliberately multi-word and specific ("from now on" not
just "always"), the matcher rarely fires on routine prose — it's quiet by
default and only speaks when there's a real signal worth surfacing.

## Why this exists

The 2026-05-10 strategic analysis identified one of the largest leverage points
as **operator phrasing**: the agent's `memory_remember` quality is bounded by
how much causal language is in the prompt. Two phrasings that look identical
produce wildly different lessons:

- **Bad:** "Change `escapeMarkdownForVue` to also strip backticks."
- **Good:** "Change `escapeMarkdownForVue` to also strip backticks — VitePress
  was breaking on memory bodies that contained angle brackets inside backticks,
  and we already fixed this for the maintenance-inbox sink so the lesson should
  generalize across all emit paths."

The second one earns a durable lesson the first one doesn't. The phrasebook
nudges train the operator-agent interface so the right phrasing happens
naturally over time.

## Related Pages

- [Brain-Faithfulness Roadmap](./brain-faithfulness-roadmap.md) — the track this slice belongs to
- [Agent Workflow](./agent-workflow.md) — what the agent does once it's been nudged
- [Operator Workflow](./operator-workflow.md) — the broader daily loop
- [Agent Enforcement Architecture](./agent-enforcement-architecture.md) — how the hooks fit together

## Claims

- [current] `dendrite-wiki ritual:hook` (Claude Code / Codex UserPromptSubmit) scans the user prompt against the operator phrasebook and emits one nudge per matched rule in the same `additionalContext` block as the ritual checkpoint reminders. The Cursor variant (`ritual:cursor-hook`) does the same when Cursor's hook payload carries a prompt, and silently no-ops when it does not. Sources: file:src/cli.ts, file:src/wiki/operator-phrasebook.ts, [Brain-Faithfulness Roadmap](./brain-faithfulness-roadmap.md)
