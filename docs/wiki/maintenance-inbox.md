# Maintenance Inbox

This page shows the current deterministic maintenance items for the project.

## Status
- Active proposals: 0
- Active lint findings: 0
- Active memory findings: 15
- Proposal groups: none.
- Lint rule groups: none.
- Memory review groups: `unsupported` (4), `promotion-ready` (11)
- There are no active proposals right now.
- There are no active lint findings right now.
- Review the memory findings below before stale or duplicated project lessons mislead future agents.

## What To Do Next
- Read [Proposal Workflow](./proposal-workflow.md) for the review and apply flow.
- No proposal pages need to be generated right now.
- The lint queue is clear right now.
- Review stale, unsupported, and contradictory memories first, then archive or consolidate duplicates with `memory_forget` where appropriate.
- Promote repeated source-backed lessons into canonical wiki pages once the memory findings confirm they are stable enough to keep.

## Proposal Queue Summary
No active proposal groups.

## Active Proposals
No active proposals.

## Lint Queue Summary
No active lint groups.

## Active Lint Findings
No active lint findings.

## Memory Review Summary
| Kind | Count |
|---|---:|
| Unsupported | 4 |
| Promotion Ready | 11 |

## Active Memory Review Findings
### Unsupported (4)

#### Memory has no supporting sources: For dynamic indicators on VitePress nav links (e.g.

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_f31ab5bb-6333-4d25-82f8-9da62b08d8a0` (kind: `lesson`, recalled 5x)
- **Sources:** none
- **Related pages:** `review-bridge`
- **Related files:** `docs/.vitepress/theme/components/InboxNavBadge.vue`, `docs/.vitepress/theme/Layout.vue`

> For dynamic indicators on VitePress nav links (e.g. notification counts on `Inbox`/`Review Board`), use Vue Teleport from a host component mounted in `nav-bar-content-after`. Pattern in `docs/.vitepress/theme/components/InboxNavBadge.vue`: (1) keep host component in the slot to own SSE/polling lifecycle; (2) on mount, querySelectorAll matching link elements (`a.VPNavBarMenuLink, a.VPNavScreenMenuLink` to cover BOTH the desktop nav and the mobile screen menu — they use different VPLink subclasses); (3) Teleport a `&lt;span&gt;` badge into each matched link; (4) attach a MutationObserver to `.VPNav` (NOT `.VPNavBar` — the mobile screen menu lives outside `.VPNavBar`) to refresh targets when VitePress re-renders the menu, but use a reference-equality check on the matched-list to skip no-op updates so the badge teleport (which itself mutates the link) doesn't loop. Avoid hardcoding base path: filter by `href` ending with `/wiki/...` so any `vitepress base` config works. Bonus: this approach naturally drops the standalone badge UI — the indicator now sits directly on the link the user needs to click, which is better UX (one visual cue, not two).

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_f31ab5bb-6333-4d25-82f8-9da62b08d8a0:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Handoff summary: Repo prepped for first public alpha publish to npm.

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_2a096d6e-02ad-4a22-95c6-568769e3c61a` (kind: `handoff`, recalled 0x)
- **Sources:** none
- **Related pages:** `commercialization-plan`, `mcp-installation`, `release-readiness-roadmap`
- **Related files:** `CHANGELOG.md`, `package.json`, `README.md`, `tsconfig.json`

> Handoff summary: Repo prepped for first public alpha publish to npm. CHANGELOG.md (inaugural, covers 0.1.0), README hero rewrite, package.json files field tightened from `dist` → `dist/src`, second dry-run verified (34→27 files, 90.3→87.3kB). Operator wants to review diffs and dry-run output before pushing to origin/main or running the real `npm publish`. Annotated tag message for v0.1.0 was drafted in chat for the operator to copy when they run `git tag -a v0.1.0 -F -`. Branch is now 34 commits ahead of origin/main (the prep commit will make it 35 once committed; the prep itself is currently uncommitted in the working tree).
> 
> Next steps:
> - After publish lands, watch for first external installer issues — especially around the `--profile` flag and the four hook-capable client paths
> - Commit the prep, push to origin/main, run `git tag -a v0.1.0 -F tagmsg.txt`, push tags, then `npm publish --access public --tag alpha`
> - Operator decides versioning strategy: keep 0.1.0 with `--tag alpha` on publish, or bump to 0.1.0-alpha.0 in package.json before publish (current dry-run would publish to `latest` dist-tag — not what an alpha wants)
> - Operator reviews CHANGELOG.md, README.md hero diff, and package.json files-field diff
> 
> Open questions:
> - Is the .npmrc `always-auth` warning that surfaces in dry-run a user-config thing or a project-level .npmrc concern? (looks like user config — not blocking)
> - Should `prepack` also run `npm run test` before letting a publish through, given there is no CI gate yet?
> - Should the package.json version be bumped to `0.1.0-alpha.0` so the version itself signals pre-release, or is `0.1.0` published with `--tag alpha` enough?

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_2a096d6e-02ad-4a22-95c6-568769e3c61a:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_be137e5a-061f-46f9-8e3e-d80cf2b2d7ef` (kind: `lesson`, recalled 0x)
- **Sources:** none
- **Related pages:** `maintenance-inbox`, `maintenance-review`
- **Related files:** `docs/wiki/maintenance-inbox.md`, `src/wiki/maintenance-inbox.ts`, `test/maintenance-inbox.test.ts`

> VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag parser with "Element is missing end tag" and breaks `npm run docs:build`. This is especially dangerous in auto-generated wiki pages that emit operator-supplied content into markdown — `docs/wiki/maintenance-inbox.md` is generated by `src/wiki/maintenance-inbox.ts` from project-local memory bodies, and a single memory containing `.github/agents/&lt;name&gt;.agent.md` was enough to break the whole docs build. The defense lives at the markdown sink, not the input: `escapeMarkdownForVue()` in `src/wiki/maintenance-inbox.ts` HTML-escapes `&lt;` and `&gt;` to `&lt;`/`&gt;` before emitting `finding.summary` into the `####` heading and `record.text` into the blockquote. The escape preserves backticks, code blocks, and other markdown formatting; it only neutralizes the Vue tag parser. When adding any new emit point in the inbox generator (or any other generator that writes user-supplied content into a `.md` file under `docs/wiki/`), apply `escapeMarkdownForVue` to the user-supplied portion. Test/maintenance-inbox.test.ts has a regression test ("escapes angle brackets in memory summary and body so VitePress can render the page") asserting both the heading and blockquote escape correctly.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_be137e5a-061f-46f9-8e3e-d80cf2b2d7ef:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: When publishing dendrite-wiki-mcp to npm, the `files` field in package.json must be `dist/src` (not `dist`).

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_aa6fb1b0-a332-4b5d-9e47-647dd7ed8f7a` (kind: `lesson`, recalled 0x)
- **Sources:** none
- **Related pages:** `mcp-installation`, `release-readiness-roadmap`
- **Related files:** `package.json`, `src/install.ts`, `tsconfig.json`

> When publishing dendrite-wiki-mcp to npm, the `files` field in package.json must be `dist/src` (not `dist`). The wider `dist` value drags in `dist/docs/.vitepress/*` and `dist/scripts/*` because tsconfig.json includes those source directories — but at runtime nothing in the published package needs them: the bin entries are `dist/src/index.js` and `dist/src/cli.js`, no src/* code references compiled scripts/ or docs/.vitepress/ outputs (verified — no `__dirname`/`fileURLToPath`/`import.meta.url` lookups in src/, and install.ts embeds all seeded content as strings rather than copying from the package install location). Tightening to `dist/src` cut tarball from 34 files / 90.3kB to 27 files / 87.3kB. If tsconfig.json's `include` ever shrinks to `["src/**/*.ts"]`, the wider `dist` value would become safe again — but as long as docs/.vitepress and scripts are typechecked through the same tsconfig, keep `dist/src`.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_aa6fb1b0-a332-4b5d-9e47-647dd7ed8f7a:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

### Promotion Ready (11)

#### Memory is promotion-ready: For real-time push updates from a static JSON file to a browser UI (the inbox notification badge here), use Server-Se...

**Why this surfaced:** Recalled 9 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_fe33df9e-ef14-42ab-beb9-96a3aa02a05c` (kind: `fact`, recalled 9x)
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

#### Memory is promotion-ready: GitHub Copilot in VS Code custom agents (preview): live at .github/agents/&lt;name&gt;.agent.md with YAML frontmatter that...

**Why this surfaced:** Recalled 8 times and backed by 1 source, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_7f54e2f8-0c99-4bad-9eb5-9193c96a14e2` (kind: `lesson`, recalled 8x)
- **Sources:** `file:src/install.ts`
- **Related pages:** `agent-enforcement-architecture`
- **Related files:** `src/install.ts`, `test/install.test.ts`

> GitHub Copilot in VS Code custom agents (preview): live at .github/agents/&lt;name&gt;.agent.md with YAML frontmatter that supports a hooks: block (sessionStart, userPromptSubmitted, postToolUse, sessionEnd, errorOccurred). Gated behind chat.useCustomAgentHooks setting — must be toggled on by the user. Agent must also be EXPLICITLY SELECTED in the chat panel by the user; default Agent mode does NOT honor agent-scoped hooks. The hook output format is presumed to mirror Claude Code's (hookSpecificOutput.additionalContext) since the research indicated the protocols are similar; if Copilot's actual format diverges, the buildCopilotAgent() function is easy to adjust later. Major usability caveat: shipping the agent file is necessary but not sufficient — the user must complete three manual steps (enable preview setting, restart VS Code, select the agent) for the hooks to fire. The universal MCP-side ritual checkpoint footer is the always-on fallback for users who skip those steps. Documented all this inside the .agent.md file's body so users discover it.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_7f54e2f8-0c99-4bad-9eb5-9193c96a14e2:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_7f54e2f8-0c99-4bad-9eb5-9193c96a14e2:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: Three-hook layered defense against agent memory drift in long Claude Code sessions, all in .claude/settings.json (CLI...

**Why this surfaced:** Recalled 49 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_fac57340-154d-4bb0-9c07-330014147ec7` (kind: `lesson`, recalled 49x)
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

#### Memory is promotion-ready: Universal MCP-side enforcement via tool response injection works in every MCP client because every spec-compliant cli...

**Why this surfaced:** Recalled 5 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_0cd55447-f84f-4045-be0c-bc37dedd490c` (kind: `lesson`, recalled 5x)
- **Sources:** `file:src/server.ts`, `file:src/wiki/ritual-state.ts`
- **Related pages:** `agent-enforcement-architecture`, `agent-workflow`
- **Related files:** `src/server.ts`, `src/wiki/ritual-state.ts`, `test/mcp-server.test.ts`, `test/ritual-state.test.ts`

> Universal MCP-side enforcement via tool response injection works in every MCP client because every spec-compliant client surfaces tool response content blocks to the agent's context window. Implementation in src/wiki/ritual-state.ts + src/server.ts wraps every tool callback's return through wrapToolResponse(toolName, baseText) which appends a ritual checkpoint footer as a SECOND text content block when reminders are active. The footer never breaks JSON-parsing test code that uses content[0] (the payload), but tools that JOIN all text blocks must be updated to only parse content[0] for JSON — see test/mcp-server.test.ts jsonContent helper fix. The ritual layer cannot be silently disabled by hook misconfiguration, IDE restarts, or extension reloads because it lives inside the MCP server process itself. This is the foundational enforcement layer; per-client hook scripts (UserPromptSubmit, PreToolUse) are additive hardening, not replacements.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_0cd55447-f84f-4045-be0c-bc37dedd490c:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_0cd55447-f84f-4045-be0c-bc37dedd490c:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When a docs site (VitePress here) needs to call into a local server, mount the server's request handler as Vite middl...

**Why this surfaced:** Recalled 37 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_dba1952d-1998-4277-abec-a5c1e8c84f87` (kind: `fact`, recalled 37x)
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

**Why this surfaced:** Recalled 13 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd` (kind: `lesson`, recalled 13x)
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

#### Memory is promotion-ready: When adding diagnostic/audit commands like `dendrite doctor`, use a two-phase check structure: first run cheap filesy...

**Why this surfaced:** Recalled 2 times and backed by 1 source, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_f5e1d3eb-8805-48da-a76e-3745416d31f4` (kind: `lesson`, recalled 2x)
- **Sources:** `file:src/wiki/doctor.ts`
- **Related pages:** `paid-tier-roadmap`
- **Related files:** `src/wiki/doctor.ts`, `test/doctor.test.ts`

> When adding diagnostic/audit commands like `dendrite doctor`, use a two-phase check structure: first run cheap filesystem checks for skeleton existence (does docs/wiki/ exist? does docs/index.md exist?), then conditionally run deeper checks that depend on those prerequisites being satisfied. The deeper checks (lintWikiPages, listWikiProposals, reviewProjectMemories, readBenchmarkHistory) all internally call into store.ts and will throw or noisy-error if the wiki skeleton isn't there. The pattern in src/wiki/doctor.ts uses `if (skeletonOk) { Promise.all([...]) }` with `.catch(() =&gt; fallback)` on each call, which gives the doctor command three good properties: (1) it never crashes on a totally-uninitialized project, (2) critical findings always surface even when the skeleton is broken, (3) deeper warnings/info only appear when they have real data behind them. Also: every critical finding MUST include a `fix` field with a concrete command — the test enforces this as a product invariant, since the whole point of doctor is "tell me what's wrong AND how to fix it." Future audit commands should follow the same shape.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_f5e1d3eb-8805-48da-a76e-3745416d31f4:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_f5e1d3eb-8805-48da-a76e-3745416d31f4:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When applying a memory promotion (memory_promote mode='apply' in src/wiki/memory-promotion.ts), call markProjectMemor...

**Why this surfaced:** Recalled 29 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_6cf2c199-3710-4704-a5f1-55a30cb2b44a` (kind: `lesson`, recalled 29x)
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

#### Memory is promotion-ready: When building shareable export artifacts (e.g.

**Why this surfaced:** Recalled 2 times and backed by 1 source, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_e65eb5c2-4263-4f04-812a-fc7ed9092480` (kind: `lesson`, recalled 2x)
- **Sources:** `file:src/wiki/report-export.ts`
- **Related pages:** `commercialization-plan`, `paid-tier-roadmap`
- **Related files:** `src/wiki/report-export.ts`

> When building shareable export artifacts (e.g. the benchmark HTML report), keep them dependency-free and self-contained: inline all CSS, embed all images as base64, use inline SVG for charts. This makes the file emailable, attachable to a Notion page, or hostable as a static asset without breaking. The first Pro-tier feature (P1: Exportable Benchmark Report) uses this pattern in src/wiki/report-export.ts — one HTML file, no external requests, ~8KB for 3 snapshots. Future Pro features that produce shareable artifacts (PDF reports, branded templates) should follow the same pattern. Avoid pulling in puppeteer/playwright for PDF generation — adds tens of MB to the install footprint; prefer browser-native print-to-PDF on a self-contained HTML.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_e65eb5c2-4263-4f04-812a-fc7ed9092480:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_e65eb5c2-4263-4f04-812a-fc7ed9092480:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When two code paths answer overlapping questions (e.g.

**Why this surfaced:** Recalled 8 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_69ab9049-03ba-48d9-947e-f169d9385955` (kind: `lesson`, recalled 8x)
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

#### Memory is promotion-ready: When two install helpers share the same target file (writeCodexConfig replaces the [mcp_servers] section, ensureCodex...

**Why this surfaced:** Recalled 6 times and backed by 1 source, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_586d17a2-890d-4f67-9f76-f7422e66cfff` (kind: `lesson`, recalled 6x)
- **Sources:** `file:src/install.ts`
- **Related pages:** `agent-enforcement-architecture`
- **Related files:** `src/install.ts`, `test/install.test.ts`

> When two install helpers share the same target file (writeCodexConfig replaces the [mcp_servers] section, ensureCodexFeatureFlag adds [features]), the second helper must write its content ADJACENT to the previous section with no blank-line padding. writeCodexConfig replaces "from [mcp_servers] header until the next [section] header", which strips any intermediate blank lines on re-run. If ensureCodexFeatureFlag adds two blank lines before [features] on first pass, the second pass's writeCodexConfig replaces the section and the blank lines disappear — producing a different file from the first pass and breaking idempotency. Test caught this with `assert.equal(secondResult.written.length, 0)`. Lesson: any helper that appends to a file edited by another helper must produce content that survives the other helper's idempotency guarantee. TOML allows adjacent sections without blank lines, so the cosmetic cost is acceptable.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_586d17a2-890d-4f67-9f76-f7422e66cfff:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_586d17a2-890d-4f67-9f76-f7422e66cfff:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.
