# Product Vision

Dendrite Wiki MCP helps a solo developer using any AI coding agent keep project memory organized, current, and useful without manually tending a growing pile of stale notes.

## Problem

AI coding agents need project context to do accurate work. Today that context usually ends up scattered across chat history, instruction files, memories, skill folders, and ad hoc notes. Over time, old facts remain in place, duplicated guidance conflicts, and the agent spends more tokens reading noise than acting on the truth of the project.

The operator should not have to become a librarian for the agent. If memory maintenance requires regular human cleanup, the system has failed its main job.

## Intended User

The first user is a solo developer working in a single project with tools such as Claude Code, Codex, Cursor, VS Code GitHub Copilot, or another MCP-compatible coding environment.

Each project gets its own local wiki stored inside that project's folder. Running the MCP server in a different project creates or uses a separate project-local wiki. Cross-project or global memory can come later, but the first product must keep project context scoped and understandable.

## Product Promise

Dendrite Wiki MCP gives the agent a clean project briefing layer that improves over time:

- Project facts live in canonical markdown pages, not scattered chat fragments.
- Memories and skills are treated as maintained project knowledge, not unbounded append-only piles.
- Stale or weak claims are surfaced by lint and review workflows before they mislead the agent.
- The agent can build a focused context pack for a task instead of reading the whole repository or every old note.
- The operator sees normal file diffs and short explanations for meaningful changes.

## Design Principles

### Project-Local First

The wiki belongs to the repository that uses it. The default storage path should be under the project, such as `docs/wiki` plus future local state under an ignored data directory. The MCP server should resolve the active workspace and avoid mixing knowledge across projects.

### No Local LLM Required

The baseline system must work on older laptops. Deterministic code should handle page storage, search, lint, backlinks, source references, stale markers, context pack assembly, and obvious cleanup suggestions.

Optional local or cloud LLM providers may improve synthesis later, but the project should never require Ollama, embeddings, a GPU, or a large local model to be useful.

### Agent Maintained, Human Auditable

The agent should do the routine maintenance: update affected pages, append log entries, propose merges, mark stale claims, and keep instructions current. The human should review meaningful changes through git diffs, docs pages, or a compact pending-changes view.

Low-risk cleanups can be auto-applied. Larger rewrites should be proposed with rationale and an undo path.

### Compile Knowledge Once

Karpathy's LLM Wiki pattern works because knowledge is compiled into a persistent markdown artifact instead of re-derived from raw documents on every question. Dendrite Wiki MCP applies that idea to software projects: codebase conventions, architecture decisions, known failures, tool workflows, and agent instructions should be written once, linked, linted, and reused.

### Prefer Evidence Over Confidence Theater

The system should avoid opaque confidence scores unless they are tied to visible evidence. A claim is useful when it has sources, date context, current status, and links to related pages. A memory is useful when it can explain why it still applies.

## Product Shape

The product has five durable surfaces:

| Surface | Purpose |
|---|---|
| Wiki pages | Canonical project understanding. |
| Sources | Evidence from files, conversations, commands, issues, and user decisions. |
| Claims | Specific facts with source links and stale status. |
| Instructions and skills | Agent behavior guidance that is linted, scoped, and kept current. |
| Project log | Chronological record of meaningful changes and maintenance events. |

## Success Criteria

- A fresh agent can answer "what is this project and how should I work here?" from the wiki without broad repo spelunking.
- Stale memories become visible lint findings instead of hidden context pollution.
- New answers and discoveries are filed back into the right page or log entry.
- Context packs are smaller and more relevant than dumping raw notes into the prompt.
- The operator spends less time organizing memory than before using the tool.
