---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: planning
---

# Plugin Marketplace Listing (C3 slice 2)

This page captures the research-grounded plan for publishing Dendrite Wiki MCP as a Claude Code plugin via the official plugin marketplace system. It's intentionally a **plan, not yet a deployment** — the schemas below are derived directly from Anthropic's published docs, but no manifest has been live-tested against a real Claude Code instance from this repo yet. When that test happens, the draft files in this page promote to `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` at the repo root.

## Goal

Add an alternate install path:

```
/plugin marketplace add mfillalan/dendrite-wiki-mcp
/plugin install dendrite-wiki@dendrite
```

This complements the existing `npx dendrite-wiki init` flow without replacing it. Teams that prefer the plugin marketplace UX get a one-command install; teams that want full control over wiki seeds keep the CLI path.

## Files to add when this gets verified

### `.claude-plugin/plugin.json`

The plugin manifest. Lives at the repo root in a `.claude-plugin/` directory. Fields below are pulled from the official [Plugins reference](https://code.claude.com/docs/en/plugins-reference).

Draft content:

```json
{
  "name": "dendrite-wiki",
  "version": "0.1.0-alpha.1",
  "description": "Local-first MCP server that gives AI coding agents a living, browser-viewable project wiki and a project-local memory store.",
  "author": {
    "name": "Michael Fillalan",
    "url": "https://github.com/mfillalan/dendrite-wiki-mcp"
  },
  "homepage": "https://github.com/mfillalan/dendrite-wiki-mcp",
  "repository": "https://github.com/mfillalan/dendrite-wiki-mcp",
  "license": "Apache-2.0",
  "mcpServers": {
    "dendrite-wiki-mcp": {
      "command": "npx",
      "args": ["-y", "dendrite-wiki-mcp@alpha"]
    }
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:'You are working in a project that uses dendrite-wiki-mcp. Before any non-trivial task you MUST: (1) call the MCP tool mcp__dendrite-wiki-mcp__wiki_context with the user task, (2) if it returns handoffs, read those first as the current session-resumption layer, (3) read the top-ranked pages it surfaces, (4) call mcp__dendrite-wiki-mcp__wiki_skill_load(id) for each skill summary in the briefing you want full content for. During work, write durable lessons via mcp__dendrite-wiki-mcp__memory_remember (use kind=\\\\\"skill\\\\\" with a scope object when the lesson is tied to a file pattern, language, or framework) and append meaningful changes to the project log via mcp__dendrite-wiki-mcp__wiki_log. At session end with unfinished work, call mcp__dendrite-wiki-mcp__memory_handoff.'}}))\""
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx -y dendrite-wiki-mcp@alpha skills:hook"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "npx -y dendrite-wiki-mcp@alpha observations:capture"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y dendrite-wiki-mcp@alpha ritual:hook"
          }
        ]
      }
    ]
  }
}
```

Notes:

- The plugin only ships the MCP server + hook stack. It does NOT ship wiki seed files. After installing the plugin, the operator still runs `npx dendrite-wiki init` once to seed `docs/wiki/`. We could later wire a SessionStart hook that auto-seeds, but that crosses a line the project has been deliberate about (hidden writes that bypass git diffs).
- `version` here is the Dendrite product version, not the plugin schema version. Bump it whenever a new alpha tag ships.
- The `npx -y dendrite-wiki-mcp@alpha` invocations match what the existing installer writes — switch to `@latest` once the package leaves the alpha tag.

### `.claude-plugin/marketplace.json`

The marketplace manifest. Lives at the repo root in `.claude-plugin/`. Schema is from the [Plugin marketplaces guide](https://code.claude.com/docs/en/plugin-marketplaces).

Draft content:

```json
{
  "name": "dendrite",
  "owner": {
    "name": "Michael Fillalan",
    "url": "https://github.com/mfillalan"
  },
  "plugins": [
    {
      "name": "dendrite-wiki",
      "source": ".",
      "description": "Local-first MCP server that gives AI coding agents a living, browser-viewable project wiki and a project-local memory store. Markdown is canonical; recall is explainable; nothing is locked in.",
      "version": "0.1.0-alpha.1",
      "author": {
        "name": "Michael Fillalan",
        "url": "https://github.com/mfillalan"
      },
      "category": "memory",
      "tags": [
        "memory",
        "wiki",
        "agent-memory",
        "project-memory",
        "documentation",
        "mcp",
        "model-context-protocol",
        "local-first",
        "explainable-recall"
      ]
    }
  ]
}
```

Notes:

- `source: "."` points the plugin at the repo root — the marketplace and the plugin live in the same repo. Per the docs, this is supported via the local-path source form.
- `category: "memory"` is a free-text categorization; users browsing the marketplace see this as the bucket label.

## Why this is a draft, not a commit

Three checks need to land before promoting these JSON files to actual repo files:

1. **Schema validation against a live Claude Code instance.** Fields like `homepage`, `repository`, `license` are not explicitly listed in the docs as supported plugin manifest fields; they're best-guessed from idiomatic project metadata. A live test will catch any unrecognized fields the loader rejects.
2. **Hook command quoting.** The SessionStart hook command uses heavy backslash escaping for the embedded JSON-in-JSON-in-shell-string. The existing installer-written `.claude/settings.json` already passes this exact string in production, so the syntax is known to work for the inline form — but the plugin-manifest form may have different escape rules.
3. **`source: "."` semantics.** The docs show local-path sources as relative paths from the marketplace.json location. Whether `"."` or `"./"` or an explicit `pluginRoot` is required for a plugin colocated with its marketplace is worth verifying.

## Verification protocol when ready to ship

1. Create `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` at the repo root with the draft contents above.
2. From a fresh Claude Code instance: `/plugin marketplace add mfillalan/dendrite-wiki-mcp`. Watch the parser output for any complaints.
3. `/plugin marketplace list` should show `dendrite` as a registered marketplace.
4. `/plugin install dendrite-wiki@dendrite`. The plugin should activate, register the MCP server, and the SessionStart hook should fire on next session.
5. Sanity-check: call `mcp__dendrite-wiki-mcp__wiki_context` from the agent. If it routes correctly, the install path works.
6. Iterate any schema fixes back into this page, then commit the actual files.

## Once verified, marketing copy lands in

- README.md install section gains a third option block: "Install as a Claude Code plugin: `/plugin marketplace add mfillalan/dendrite-wiki-mcp`".
- [comparison-claude-mem.md](./comparison-claude-mem.md) row "Plugin marketplace" updates from "Planned (C3)" to "Available".
- [Competitive Feature Roadmap](./competitive-feature-roadmap.md) phase tracker marks C3 slice 2 as Done.

## Why the install matters strategically

Per the [comparison page](./comparison-claude-mem.md), one of claude-mem's real wins is plugin marketplace presence — it's a one-click install. Dendrite's `npx dendrite-wiki init` is close, but the marketplace listing closes that perceived friction gap. With the listing in place, the install delta vs. claude-mem narrows to zero, while every Dendrite moat (markdown-canonical, explainable, portable) stays unchanged.

## Related

- [Plugin Marketplaces (Claude Code docs)](https://code.claude.com/docs/en/plugin-marketplaces)
- [Plugins Reference (Claude Code docs)](https://code.claude.com/docs/en/plugins-reference)
- [Competitive Feature Roadmap](./competitive-feature-roadmap.md) phase C3
- [Comparison: Dendrite vs claude-mem](./comparison-claude-mem.md)

## Claims

- [planned] The plugin marketplace listing has been planned and the manifest schemas drafted from the official Claude Code documentation; promotion to live `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` files is gated on a live verification pass against a real Claude Code instance, after which the README install section and comparison-page row update to "available". Sources: [Comparison: Dendrite vs claude-mem](./comparison-claude-mem.md), [Competitive Feature Roadmap](./competitive-feature-roadmap.md)
