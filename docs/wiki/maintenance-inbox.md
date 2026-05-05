# Maintenance Inbox

This page shows the current deterministic maintenance items for the project.

## Status
- Active proposals: 1
- Active lint findings: 1
- Active memory findings: 1
- Proposal groups: `route-guidance` (1)
- Lint rule groups: `oversized-guidance` (1)
- Memory review groups: `promotion-ready` (1)
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
| Promotion Ready | 1 |

## Active Memory Review Findings
### Promotion Ready (1)

#### Memory is promotion-ready: When adding a required field to DendriteBenchmarkSnapshot, also extend `normalizeStoredBenchmarkSnapshot` in src/wiki...

**Why this surfaced:** Recalled 3 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd` (kind: `lesson`, recalled 3x)
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
