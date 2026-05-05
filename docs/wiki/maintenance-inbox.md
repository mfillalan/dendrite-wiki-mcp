# Maintenance Inbox

This page shows the current deterministic maintenance items for the project.

## Status
- Active proposals: 1
- Active lint findings: 1
- Active memory findings: 7
- Proposal groups: `route-guidance` (1)
- Lint rule groups: `oversized-guidance` (1)
- Memory review groups: `unsupported` (1), `promotion-ready` (6)
- Run `wiki_write_proposals` when you want to materialize review pages for the active proposals.
- Review the lint findings below before they turn into stale project guidance.
- Review the memory findings below before stale or duplicated project lessons mislead future agents.

## What To Do Next
- Read [Proposal Workflow](./proposal-workflow.md) for the review and apply flow.
- Run `wiki_write_proposals` to materialize review pages under `docs/wiki/pending-review/`.
- Review the proposal group tables below and open any linked review pages before applying changes.
- Resolve the lint buckets below, starting with the `review-now` rules before the cleanup-only rules.
- Rerun `npm run wiki:refresh` or `npm run check` after fixes so the inbox reflects the current state.
- Review stale, unsupported, and contradictory memories first, then archive or consolidate duplicates with `memory_forget` where appropriate.
- Promote repeated source-backed lessons into canonical wiki pages once the memory findings confirm they are stable enough to keep.

## Proposal Queue Summary
| Kind | Count |
|---|---:|
| `route-guidance` | 1 |

## Active Proposals
### `route-guidance` (1)

| Summary | Rationale | Affected Paths | Current State | After Apply | Undo Path | Review Page |
|---|---|---|---|---|---|---|
| Trim AGENTS.md and route to docs/index.md | This guidance file exceeds the preferred length and already links to canonical local docs pages that can carry the detailed workflow. | AGENTS.md | AGENTS.md is longer than the preferred guidance length. | AGENTS.md becomes a short entry file that routes to docs/index.md. | Before committing, inspect the changed guidance file with git diff and restore AGENTS.md from version control if the route is not wanted. | `pending-review/route-guidance-agents-md` (run `wiki_write_proposals`) |

## Lint Queue Summary
| Bucket | Rule | Count |
|---|---|---:|
| Cleanup Queue | `oversized-guidance` | 1 |

## Active Lint Findings
### Cleanup Queue (1)

#### `oversized-guidance` (1)

| Path | Message |
|---|---|
| `AGENTS.md` | Guidance file exceeds 40 lines: AGENTS.md (46 lines). |

## Memory Review Summary
| Kind | Count |
|---|---:|
| Unsupported | 1 |
| Promotion Ready | 6 |

## Active Memory Review Findings
### Unsupported (1)

#### Memory has no supporting sources: For dynamic indicators on VitePress nav links (e.g.

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_f31ab5bb-6333-4d25-82f8-9da62b08d8a0` (kind: `lesson`, recalled 2x)
- **Sources:** none
- **Related pages:** `review-bridge`
- **Related files:** `docs/.vitepress/theme/components/InboxNavBadge.vue`, `docs/.vitepress/theme/Layout.vue`

> For dynamic indicators on VitePress nav links (e.g. notification counts on `Inbox`/`Review Board`), use Vue Teleport from a host component mounted in `nav-bar-content-after`. Pattern in `docs/.vitepress/theme/components/InboxNavBadge.vue`: (1) keep host component in the slot to own SSE/polling lifecycle; (2) on mount, querySelectorAll matching link elements (`a.VPNavBarMenuLink, a.VPNavScreenMenuLink` to cover BOTH the desktop nav and the mobile screen menu — they use different VPLink subclasses); (3) Teleport a `<span>` badge into each matched link; (4) attach a MutationObserver to `.VPNav` (NOT `.VPNavBar` — the mobile screen menu lives outside `.VPNavBar`) to refresh targets when VitePress re-renders the menu, but use a reference-equality check on the matched-list to skip no-op updates so the badge teleport (which itself mutates the link) doesn't loop. Avoid hardcoding base path: filter by `href` ending with `/wiki/...` so any `vitepress base` config works. Bonus: this approach naturally drops the standalone badge UI — the indicator now sits directly on the link the user needs to click, which is better UX (one visual cue, not two).

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_f31ab5bb-6333-4d25-82f8-9da62b08d8a0:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

### Promotion Ready (6)

#### Memory is promotion-ready: For real-time push updates from a static JSON file to a browser UI (the inbox notification badge here), use Server-Se...

**Why this surfaced:** Recalled 4 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_fe33df9e-ef14-42ab-beb9-96a3aa02a05c` (kind: `fact`, recalled 4x)
- **Sources:** `file:docs/.vitepress/plugins/review-bridge-plugin.ts`, `file:docs/.vitepress/theme/components/InboxNavBadge.vue`
- **Related pages:** `review-bridge`
- **Related files:** `docs/.vitepress/plugins/review-bridge-plugin.ts`, `docs/.vitepress/theme/components/InboxNavBadge.vue`

> For real-time push updates from a static JSON file to a browser UI (the inbox notification badge here), use Server-Sent Events (SSE) over the existing same-origin Vite middleware: fs.watch the file's parent directory + filter by filename, debounce file events by 200ms (Windows fs.watch can fire multiple events per logical write), broadcast to all connected SSE responses on each change. Send an initial event immediately on connection so the client populates without an extra HTTP round-trip. 25s keepalive comments (`: keepalive\\n\\n`) prevent idle proxies from killing the stream. Browser-side: EventSource handles auto-reconnect; fall back to polling if the stream doesn't open within 5s (some local proxies hang silently). SSE was chosen over WebSockets because we only need server→client (one-way), no library needed (native EventSource), simpler to mount in Connect middleware. Reference: docs/.vitepress/plugins/review-bridge-plugin.ts and docs/.vitepress/theme/components/InboxNavBadge.vue.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_fe33df9e-ef14-42ab-beb9-96a3aa02a05c:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_fe33df9e-ef14-42ab-beb9-96a3aa02a05c:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: Three-hook layered defense against agent memory drift in long Claude Code sessions, all in .claude/settings.json (CLI...

**Why this surfaced:** Recalled 25 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_fac57340-154d-4bb0-9c07-330014147ec7` (kind: `lesson`, recalled 25x)
- **Sources:** `file:.claude/settings.json`, `file:src/install.ts`
- **Related pages:** `agent-workflow`, `ai-memory-companion-roadmap`
- **Related files:** `.claude/settings.json`, `AGENTS.md`, `src/install.ts`

> Three-hook layered defense against agent memory drift in long Claude Code sessions, all in .claude/settings.json (CLI and VS Code extension share the same settings file — there are no VS Code-extension-only hooks): (1) SessionStart injects the full ritual list once at session begin; (2) PostToolUse with matcher='mcp__dendrite-wiki-mcp__wiki_context' fires right after orientation loads, reminding the agent that memory_remember and wiki_log are per-pass rituals not end-of-session batches — fires at the high-attention moment; (3) UserPromptSubmit with a Node.js stdin filter for `source==='compact'` fires only when context auto-compaction happens, re-anchoring the rituals at the moment they are most likely to be lost. All three use inline `node -e ...` one-liners (cross-platform, no script files to maintain). Key insight from the claude-code-guide research: hooks REMIND deterministically but cannot ENFORCE model behavior. Best strategy is high-frequency, low-cost reminders at psychologically receptive moments (right after context load, right after compaction). Avoid: per-prompt unconditional injection (bloats every message), Stop hooks (fires after every turn = noise), tool-blocking hooks (can't force a model to call a different tool).

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_fac57340-154d-4bb0-9c07-330014147ec7:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_fac57340-154d-4bb0-9c07-330014147ec7:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When a docs site (VitePress here) needs to call into a local server, mount the server's request handler as Vite middl...

**Why this surfaced:** Recalled 22 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_dba1952d-1998-4277-abec-a5c1e8c84f87` (kind: `fact`, recalled 22x)
- **Sources:** `file:docs/.vitepress/plugins/review-bridge-plugin.ts`, `wiki:review-bridge`
- **Related pages:** `architecture`, `maintenance-review`, `review-bridge`
- **Related files:** `docs/.vitepress/config.ts`, `docs/.vitepress/plugins/review-bridge-plugin.ts`, `src/wiki/review-bridge.ts`

> When a docs site (VitePress here) needs to call into a local server, mount the server's request handler as Vite middleware on the same origin via `configureServer` in a Vite plugin (see docs/.vitepress/plugins/review-bridge-plugin.ts). Same-origin browser requests don't need CORS, don't need a token, don't need any UI handshake — the user just opens the docs site and clicks. The original review bridge ran on a separate port (5417) which forced cross-origin requests, which forced a per-startup token, which forced a paste-into-browser UI that the operator hated. Pattern: extract the handler logic so it can run in either mode (createReviewBridgeHandler with authMode: 'token' | 'same-origin'); same-origin mode skips Origin/CORS enforcement and skips the token check entirely. Safety: docs server binds 127.0.0.1 only, browser CORS blocks cross-origin POSTs to localhost from random pages; the only real attack vector is "another local app the user opens in the same browser", which is already protected against by the browser's same-origin policy.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_dba1952d-1998-4277-abec-a5c1e8c84f87:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_dba1952d-1998-4277-abec-a5c1e8c84f87:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When adding a required field to DendriteBenchmarkSnapshot, also extend `normalizeStoredBenchmarkSnapshot` in src/wiki...

**Why this surfaced:** Recalled 7 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd` (kind: `lesson`, recalled 7x)
- **Sources:** `file:docs/.vitepress/theme/components/BenchmarkReport.vue`, `file:src/wiki/benchmark.ts`
- **Related pages:** `benchmark-report`, `benchmarking`
- **Related files:** `docs/.vitepress/theme/components/BenchmarkReport.vue`, `src/wiki/benchmark.ts`

> When adding a required field to DendriteBenchmarkSnapshot, also extend `normalizeStoredBenchmarkSnapshot` in src/wiki/benchmark.ts to inject defaults for the new field — older history artifacts on disk lack new fields, and `readBenchmarkHistoryArtifact` / `readLatestBenchmarkSnapshot` route both through the normalizer. Separately, the browser BenchmarkReport.vue component fetches `docs/public/dendrite-benchmark-history.json` directly and bypasses the server-side normalizer, so new fields must also be declared optional in the Vue component's local interface and accessed via `?.` chains. Skipping either step causes runtime errors only on stale artifacts, which is easy to miss in tests.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When applying a memory promotion (memory_promote mode='apply' in src/wiki/memory-promotion.ts), call markProjectMemor...

**Why this surfaced:** Recalled 9 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_6cf2c199-3710-4704-a5f1-55a30cb2b44a` (kind: `lesson`, recalled 9x)
- **Sources:** `file:src/wiki/memory-promotion.ts`, `file:src/wiki/memory-store.ts`
- **Related pages:** `ai-memory-companion-roadmap`
- **Related files:** `src/wiki/memory-promotion.ts`, `src/wiki/memory-store.ts`

> When applying a memory promotion (memory_promote mode='apply' in src/wiki/memory-promotion.ts), call markProjectMemoriesSuperseded(memoryIds) from src/wiki/memory-store.ts to transition the source memory record(s) to status='superseded' in the SAME operation as writing the wiki page and project log entry. Without this, the inbox keeps re-flagging the memory as promotion-ready forever (recallCount and sources still qualify). Also: reviewProjectMemories must filter `record.status === 'active'` by default (NOT just `status !== 'archived'`) so superseded records don't immediately re-appear under the 'stale' bucket. Architecturally: superseded means "deliberately moved to canonical wiki" — fundamentally different from "old needs review." The supersede call belongs in BOTH the success branch AND the skippedBecauseUnchanged branch (the latter handles the case where the page already has the text from a prior apply but the memory still needs cleaning up).

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_6cf2c199-3710-4704-a5f1-55a30cb2b44a:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_6cf2c199-3710-4704-a5f1-55a30cb2b44a:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When two code paths answer overlapping questions (e.g.

**Why this surfaced:** Recalled 3 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_69ab9049-03ba-48d9-947e-f169d9385955` (kind: `lesson`, recalled 3x)
- **Sources:** `file:src/wiki/maintenance-inbox.ts`, `file:src/wiki/memory-promotion.ts`
- **Related files:** `src/wiki/maintenance-inbox.ts`, `src/wiki/memory-promotion.ts`

> When two code paths answer overlapping questions (e.g. "what target page would a promotion write to?" and "is the Apply button available?"), they MUST share the implementation. The bug where src/wiki/maintenance-inbox.ts had its own resolveMemoryPromotionTargetSlug copy that lacked the project-log/architecture fallback caused Apply to be permanently gated even when the actual src/wiki/memory-promotion.ts resolvePromotionTargetSlug would have succeeded. Pattern: when you find duplicated logic across modules, export the canonical version and import it everywhere. The cost of "small inline copy looks fine" compounds across releases. Specifically: the inbox availability gate must use the same target-resolution function the draft/apply paths use, so what the gate predicts and what the action does always match.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_69ab9049-03ba-48d9-947e-f169d9385955:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_69ab9049-03ba-48d9-947e-f169d9385955:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.
