---
name: dendrite-wiki
description: "Use when: starting or continuing work in a project that uses Dendrite Wiki MCP (Grok Build CLI)."
---

# Dendrite Wiki (Grok Build CLI)

Use this when working inside a repository that has Dendrite Wiki MCP installed.

### Core Daily Ritual

1. Read `docs/index.md` at the start of any non-trivial session.
2. Call `wiki_context` for the current task early. Always read any returned `handoffs` first.
3. When the briefing surfaces skills, load the ones that look relevant with `wiki_skill_load(id)`.
4. Capture non-obvious lessons with `memory_remember` as you work (use `kind: "skill"` + a realistic `scope` when the lesson is tied to specific file patterns, languages, or frameworks).
5. If you leave work unfinished, call `memory_handoff` with a short summary, next steps, and open questions.

### Grok-Specific Notes

- Ritual reminders appear automatically in many tool responses thanks to the hooks installed by `init --ide grok`.
- Run `grok inspect` after any setup change — it will show you the loaded Dendrite skill and hooks.
- Project-local configuration under `.grok/` takes precedence over the global one in `~/.grok/`.
- The skill is designed to compose well with other skills you may have.

Keeping the wiki and memory layer healthy is the highest-leverage thing you can do to make future Grok sessions dramatically more effective.
