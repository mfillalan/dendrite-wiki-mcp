---
name: dendrite-wiki
description: "Use when: starting or continuing work in a project that uses Dendrite Wiki MCP, especially when you need project status, persistent memory, documentation updates, or benchmark snapshots."
---

# Dendrite Wiki

Use this workflow when a project has Dendrite Wiki MCP installed.

1. Read docs/index.md.
2. Always call wiki_context for the current task before acting; treat returned handoffs as the current session-resumption layer and read them first. The briefing includes a `skills` array (top-3 by default); call `wiki_skill_load(id)` for each surfaced skill you want full content for.
3. Use wiki_search or wiki_read for relevant pages.
4. Update wiki pages via wiki_log and capture non-obvious lessons via memory_remember as they happen, not at the end. If the lesson is tied to a file pattern, language, or framework, mark it as a skill from the start: pass `kind: 'skill'` and a `scope` object with at least one of `filePatterns`, `frameworks`, `languages`, or `taskKeywords`. Otherwise capture as a regular memory; `memory_review` will surface skill-promotion-ready candidates with an inferred scope, and `memory_promote_skill` converts them to scope-bound skills.
5. The PreToolUse hook on Edit/Write/MultiEdit runs `dendrite-wiki skills:hook` automatically and injects matching skill summaries before each file edit. Read the system reminder and call `wiki_skill_load(id)` for any skill that looks load-worthy.
6. Do not run `wiki:refresh`, `docs:api`, or `benchmark:snapshot` as a session-start ritual. Those commands mutate generated artifacts and should run only when the operator asks for a benchmark, generated-doc refresh, release check, or publish-prep validation.
7. When the session ends with unfinished work, call memory_handoff with a short summary, next steps, and open questions so the next agent can resume cleanly.
