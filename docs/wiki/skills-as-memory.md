---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: shipped
---

# Skills As Memory

This page defines the **skills layer** built on top of the memory store. Skills are specialized memories scoped to task patterns (file globs, frameworks, languages, task descriptions) that the frontier coding agent can discover and load on demand to avoid re-stepping on the same project-specific bugs and quirks.

This track extends [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md) Phase M7. Team-tier additions that build on this layer live in [Team Tier Architecture](./team-tier-architecture.md).

## Shipped Status (2026-05-05)

All seven free-tier build phases (S1–S7) shipped end-to-end in a single implementation campaign. The skills layer is functional today:

| Phase | Status | Notes |
|---|---|---|
| S1: Skill Memory Kind | Shipped | New `kind: 'skill'` with five-dimensional scope schema; hard-reject validation. |
| S2: Skill Matching And Ranking | Shipped | New `wiki_skills_list` MCP tool; deterministic matching (no local LLM). |
| S3: `wiki_context` Skill Surfacing | Shipped | Top-3 default; `maxSkills`, `relatedFiles`, `languages`, `frameworks` options. |
| S4: `wiki_skill_load` Tool | Shipped | Atomic recall-counter increment; typed error for unknown id. |
| S5: Skill Promotion Workflow | Shipped | `skill-promotion-ready` review finding with `inferredScope`; `memory_promote_skill` MCP tool. |
| S6: Hook-Injected Enforcement | Shipped | `dendrite-wiki skills:hook` CLI; `PreToolUse` on Edit/Write/MultiEdit in Claude settings; standalone hook manifest at `.github/hooks/dendrite-wiki-skills.json`. |
| S7: Skill Wiki Pages | Directory shipped | `docs/wiki/skills/` exists with index page; mature skills can be promoted into it manually when teams want canonical human-edited versions. |

## Why Skills

The memory companion already lets the agent record durable lessons. But three real failure modes show up in practice:

1. **Same bug, different session.** A future agent forgets a project-specific gotcha because the memory wasn't surfaced when the relevant work began.
2. **Recall depends on remembering to recall.** `wiki_context` only fires when the agent calls it. Long sessions drift (see the [agent-discipline warning](./agent-workflow.md)).
3. **Context bloat.** Loading every memory every time wastes context window. Loading only memories matching the current task pattern is dramatically cheaper.

Skills solve all three by being:

- **Scoped** — each skill declares what task it applies to (file pattern, framework, language, task description match).
- **Auto-surfaced** — when the agent starts a matching task, the skill's *summary* appears in the briefing without anyone calling a tool.
- **Two-phase fetched** — full skill content is loaded on demand by the frontier agent only for skills it actually picks.

## Design Principles

The same principles that govern the memory companion apply here:

- **No required local LLM.** The frontier coding agent (Claude/Cursor/Codex/etc) is the model in context with the user's task — it picks the relevant skills. Dendrite's job is matching, ranking, and serving.
- **Local-first storage.** Skills are markdown wiki pages plus structured memory records. Auditable, gitable, diff-friendly.
- **Composable with Anthropic's `.claude/skills/`.** Native Anthropic skills act as the always-loaded floor; Dendrite skills are the dynamic, recall-scored layer on top.
- **Promotion-driven.** Skills are not authored from scratch — they emerge from memories that have been recalled repeatedly for the same task pattern. The promotion path is `memory → skill → wiki page`.
- **Visible enforcement.** When agent discipline drifts, hooks (PreToolUse on Edit/Write, UserPromptSubmit) inject matching skills automatically rather than relying on the agent to remember.

## Scope Schema

A skill extends the existing memory record with these scope fields:

| Field | Purpose | Example |
|---|---|---|
| `kind: skill` | New memory kind alongside fact/lesson/handoff/warning. | `skill` |
| `scope.filePatterns[]` | Glob patterns matched against the file the agent is editing or the file paths in the task description. | `["src/**/*.tsx", "**/components/**"]` |
| `scope.frameworks[]` | Detected frameworks (from package.json, imports, or task description). | `["vue", "vitepress"]` |
| `scope.languages[]` | Detected languages. | `["typescript", "vue"]` |
| `scope.taskKeywords[]` | Keywords that match against the user's task description or recent agent messages. | `["auth", "login", "session"]` |
| `scope.matchMode` | How matchers combine. `"any"` (default) fires when any matcher matches; `"all"` requires all declared matchers to match. | `"any"` |
| `body` | The skill content itself — what to do, what to avoid, code patterns, gotchas. | (markdown) |

A skill must declare at least one scope dimension. Scope-less skills become regular memories.

## Tool Surface

Two new MCP tools, plus an enhancement to `wiki_context`:

| Tool | Purpose |
|---|---|
| `wiki_skills_list` | Return summaries of skills matching a query/scope (file path, language, frameworks, keywords). Cheap. Used standalone when the agent wants to browse without a full briefing. |
| `wiki_skill_load` | Return the full body of a skill by ID. Called once per skill the agent decides to use. |

`wiki_context` gains a `skills` array in its response — skill summaries matching the task, ranked the same way memories are ranked. Agents that already call `wiki_context` get skill discovery for free without learning a new tool.

## Two-Phase Fetch Flow

The expected agent flow:

1. Agent calls `wiki_context("fix the auth bug, file src/auth/login.ts")`.
2. Briefing returns pages, memories, project log entries, **and skill summaries** matching the task scope.
3. Agent reads the summaries and picks the skills it wants full content for.
4. Agent calls `wiki_skill_load(skillId)` for each picked skill.
5. Agent uses skill content while doing the work.

This mirrors the existing `wiki_search` → `wiki_read` two-phase pattern and is idiomatic to the codebase.

## Hook-Injected Enforcement

Agent discipline is unreliable (documented in [agent-workflow](./agent-workflow.md) and the warning memory tagged `agent-discipline`). The hook layer is how skills become reliable in practice:

- **UserPromptSubmit hook** — fires `wiki_context` automatically on every user prompt, injects matched skills into the agent's context. Agent can't skip it.
- **PreToolUse hook on Edit/Write** — when the agent is about to edit a file, fires a quick skill scope match against the file path and language, injects matching skill *summaries* (not bodies) as a system reminder.
- **Skill load hook** — when the agent calls `wiki_skill_load`, increments a recall counter on the skill so heavily-used skills rank higher.

The installer should ship these hook manifests under `.github/hooks/` alongside the existing session-start, session-handoff, and benchmark hooks.

## Promotion Path: Memory → Skill → Wiki Page

Skills shouldn't be hand-written; they should emerge:

1. **Memory captured.** A regular `memory_remember` call records a project-specific lesson during work.
2. **Repeated use detected.** When the same memory is recalled N times for tasks matching a similar scope (same file pattern, same framework), the maintenance review surfaces it as a "skill promotion candidate."
3. **Promoted to skill.** Operator approves; the memory becomes a skill with inferred scope (the dominant scope across its recall history) plus operator-edited refinements.
4. **Promoted to wiki page.** Mature skills (high recall count, multi-month stability) get promoted further into a canonical wiki page under `docs/wiki/skills/`. The skill memory record stays active for recall; the wiki page becomes the human-readable canonical version.

This three-tier promotion (memory → skill → wiki page) extends the existing two-tier promotion and reuses the existing review board UI.

## Wiki Surface

Skills live in two places:

- **Skill memory records** — JSONL/SQLite store, same as other memories.
- **Promoted skill wiki pages** — `docs/wiki/skills/<slug>.md`. Each promoted skill becomes a wiki page. The page has frontmatter matching the scope schema; the body is the canonical edited version.

The VitePress site gains a `/skills/` index that lists all promoted skills filterable by language/framework/file-pattern.

## Composition With Anthropic's Native Skills

Anthropic's Claude Code supports `.claude/skills/<name>/SKILL.md` — these are always loaded into the agent's context. Dendrite skills should compose with these, not replace them:

- **Native skills** (`.claude/skills/`) — the always-loaded floor. Use for skills that are universally relevant (project orientation, core conventions). Operator authors these directly.
- **Dendrite skills** (memory store + promoted wiki pages) — the dynamic, recall-scored layer. Use for skills scoped to specific work patterns. Emerge from repeated memories.

The installer should populate `.claude/skills/dendrite-wiki/SKILL.md` (already exists) with instructions for the agent on how to discover Dendrite skills via `wiki_context.skills` and `wiki_skill_load`.

## Build Order

This is a meaningful redesign but every required primitive already exists. Recommended order:

### S1: Skill Memory Kind (Free Tier)

**What:** Add `skill` to the memory `kind` enum. Add the `scope` field to memory records. Update `memory_remember` to accept a scope. Update the memory store schema.

**Acceptance:**
- `memory_remember` accepts `kind: 'skill'` and a `scope` object.
- Stored skills are visible in the existing maintenance review board with a distinct badge.
- Existing memories continue to work unchanged.
- Tests cover scope persistence and round-trip.

### S2: Skill Matching And Ranking (Free Tier)

**What:** Implement the scope match logic — given a task description and current file context, return matching skill memories ranked by scope specificity, recall count, and freshness.

**Acceptance:**
- `wiki_skills_list` tool returns matching skills with reasons.
- Tests cover file-pattern, language, framework, and keyword match modes.
- Ranking is deterministic and explainable (same reasons-array pattern as memory recall).

### S3: `wiki_context` Skill Surfacing (Free Tier)

**What:** Extend `wiki_context` response with a `skills` array containing summaries of matching skills. Limited to top N per task to prevent context bloat.

**Acceptance:**
- `wiki_context` response includes skills when they match the task.
- Skills appear in the briefing markdown with a clear section header.
- Tests cover the skill section appearing only when relevant.

### S4: `wiki_skill_load` Tool (Free Tier)

**What:** New MCP tool that returns the full body of a skill by ID, increments its recall counter.

**Acceptance:**
- `wiki_skill_load(id)` returns the full skill body.
- Skill recall counter increments on each load.
- Loading a non-existent skill returns a clear error.

### S5: Skill Promotion Workflow (Free Tier)

**What:** Extend `memory_review` to surface "skill promotion candidates" — memories with high recall count matching a consistent scope. Extend `memory_promote` with mode `'promote-to-skill'`.

**Acceptance:**
- Maintenance inbox surfaces skill candidates with inferred scope.
- Operator can approve promotion; memory becomes skill with the inferred scope.
- The original memory transitions to status `'superseded'` (same pattern as wiki promotion).

### S6: Hook-Injected Enforcement (Free Tier)

**What:** Add `UserPromptSubmit` and `PreToolUse:Edit/Write` hook manifests to the installer. These fire `wiki_context` / `wiki_skills_list` automatically and inject results.

**Acceptance:**
- Installer writes hook manifests under `.github/hooks/`.
- Hooks work in Claude Code, Cursor, and other supported harnesses.
- The injected briefing is clearly labeled so the agent knows it came from Dendrite.

### S7: Skill Wiki Pages (Free Tier)

**What:** New wiki page directory `docs/wiki/skills/`. Mature skills (high recall, multi-month stability) get promoted into canonical wiki pages with full edit history.

**Acceptance:**
- Promoted skill wiki pages have frontmatter matching the scope schema.
- VitePress `/skills/` index renders all promoted skills filterable by language/framework.
- The skill memory record stays active for recall; the wiki page is the canonical edited version.

## What Stays In Free Tier vs Pro vs Team

Per the existing roadmap principle ("build value first, monetize later"), all of S1–S7 land in the **free tier** as enhanced free-product polish. Gating decisions wait until a paying customer creates the need.

The Pro and Team tracks gain skill-aware enhancements rather than skill-only features:

- **Pro:** the exportable benchmark report (P1) gains a "Skills Library Snapshot" section. The doctor command (P2) checks for un-promoted skill candidates rotting in memory.
- **Team:** see [Team Tier Architecture](./team-tier-architecture.md) for the shared-skill model — the steward agent merges and deduplicates skills across team members on the hosted node.

## Resolved Design Decisions

These were debated and resolved on 2026-05-05 before S1 implementation began.

### Scope Schema: Ship All Five Dimensions In V1

Ship `filePatterns`, `frameworks`, `languages`, `taskKeywords`, and `matchMode` together in S1 rather than starting minimal and growing. Rationale: redesigning the schema after persistence is expensive; if a dimension turns out to be noise it can be tone back from real usage data without breaking the store.

### Storage: Same Store As Other Memories

Skills live in the existing JSONL/SQLite memory store with `kind: 'skill'` discriminator. Reuses the maintenance review board automatically and preserves a single recall path. The `scope` field is optional on the existing memory record schema — only required when `kind === 'skill'`.

### Skill Without Scope: Reject Hard With Clear Error

`memory_remember` with `kind: 'skill'` and no scope fields returns a typed validation error explaining the contract: "skill memories require at least one scope field (filePatterns, frameworks, languages, taskKeywords)." Soft-downgrade to `kind: 'fact'` was rejected because it hides the contract from the agent and creates two paths to the same data.

### Skill Budget Per Briefing: Top 3 By Score

`wiki_context` surfaces at most 3 skill summaries by default. Override via a `maxSkills` parameter on the call. Three is the smallest number that still allows the frontier agent to compare options without context bloat. If real usage shows useful skills routinely getting cut, raise to 5; do not raise blindly.

### Matching Approach: Deterministic-Only For V1, Local LLM Deferred

Matching uses deterministic scope hard-filters + recency/specificity ranking. **No local LLM dependency in the free tier.** This is the most consequential decision and deserves the longest justification:

- The predecessor project (`dendrite-mcp`) used a 3-layer hybrid (deterministic filters → Ollama LLM ranking → algorithmic fallback). Audit data showed the LLM brought misfire rate from ~30% (pure level-dominance picking) down to ~5%, but the **bulk of the win came from deterministic guard-rails** (language hard-filter + level demotion), not from the LLM itself. The LLM was the last 5% of polish.
- The predecessor project force-injected matched skills directly into the agent's context. **Our two-phase fetch is fundamentally different** — `wiki_context` returns skill *summaries*, the frontier coding agent (Claude/Cursor/etc) picks which to load, then `wiki_skill_load` fetches full content. The frontier agent is already an LLM doing semantic reranking on the candidate list; we don't need a *second* LLM to do it again.
- The `dendritemcp-lessons` page in this wiki explicitly lists "Heavy Background Model Dependency" as a pattern to avoid for this product, citing the older-laptop user case.
- An optional Ollama/embedding reranker can be added later as a post-S7 polish slice gated on real usage signals (matching precision metric below acceptable threshold). The toggle pattern from the old project (`MEMORYD_BEGIN_TASK_LLM_DISABLE`) is a proven precedent.

The deterministic guard-rails to borrow from the predecessor's audit (commit `ff27e93`):

1. **Scope hard-filters before scoring.** Language mismatch → exclude. Framework mismatch → exclude. Filter is conservative: missing scope dimension on the skill keeps the skill in the candidate set rather than excluding it.
2. **Recency demotion.** Older / less-recently-recalled skills demoted in scoring so high-recall historical skills don't dominate over recent better-fit candidates.
3. **Token bigram bonuses.** "Stored procedures" matches as a phrase, not just two words. Cheap to implement, high-value for multi-word task descriptions.

### Multi-Skill Conflict: Surface Both With Source Attribution

When two surfaced skills give conflicting advice, the briefing shows both with their respective sources and recall counts. The frontier agent reads both and decides; conflicts are not silently resolved. Operator can later mark one as canonical via maintenance review, which suppresses the other from briefings.

### Skill Versioning: Wiki Pages Yes, Memory Records No

Skill memory records get overwritten on edit (last-write-wins, like other memories). Promoted skill wiki pages get full git history because they live in `docs/wiki/skills/` and are committed.

### Scope Inference For Existing Memories: Yes, Surface As Promotion Candidates

Maintenance review will automatically infer scope from a memory's recall history (which task patterns it was recalled for) and surface high-confidence candidates as "promote to skill" suggestions. Operator confirms or edits the inferred scope before promotion.

### Hook Performance Budget: Benchmark, Don't Pre-Decide

Add timing to the existing benchmark snapshot (`npm run benchmark:snapshot`) for the matching path. Track p50/p95 latency over the recall benchmark probe set. Set the budget from observed data rather than guessing. Initial target: p95 under 50ms; revisit if user-visible latency emerges.

### Hook Failure Mode: Log And Continue

Hook errors never block the user's Edit/Write. Skill discovery is an enhancement, not a gate. Errors get logged to a per-session log so they're discoverable but don't interrupt work.

### Native Skills vs Dendrite Skills: Documented Guidance, Not Enforced

`.claude/skills/<name>/SKILL.md` is the always-loaded floor. Dendrite skills are the dynamic recall-scored layer. Operators choose; the wiki documents the trade-off but does not enforce a boundary. Rule of thumb that ships in the docs: "if every session needs it, write it as a native skill; if it's specific to certain work patterns, let it emerge from memory."

## Claims

(none yet — this is design)
