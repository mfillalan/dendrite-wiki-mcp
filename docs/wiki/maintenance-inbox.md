# Maintenance Inbox

This page shows the current deterministic maintenance items for the project.

## Status
- Active proposals: 0
- Active lint findings: 0
- Active memory findings: 1
- Proposal groups: none.
- Lint rule groups: none.
- Memory review groups: `promotion-ready` (1)
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
| Promotion Ready | 1 |

## Active Memory Review Findings
### Promotion Ready (1)

#### Memory is promotion-ready: Gitignoring a directory with `local-data/` blocks `!local-data/recall-probes.json` re-include rules — git refuses to...

**Why this surfaced:** Recalled 2 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_a7d829c2-9115-4c30-879c-bfa16997ede7` (kind: `lesson`, recalled 2x)
- **Sources:** `command:git check-ignore -v`, `file:.gitignore`
- **Related files:** `.gitignore`, `local-data/recall-probes.json`

> Gitignoring a directory with `local-data/` blocks `!local-data/recall-probes.json` re-include rules — git refuses to descend into a fully-ignored directory. The working pattern is `local-data/*` (ignore contents, not the directory) followed by `!local-data/recall-probes.json`. Verify with `git check-ignore -v &lt;path&gt;` after editing .gitignore. This is the same trap that bit any future `!local-data/X.json` exemptions.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_a7d829c2-9115-4c30-879c-bfa16997ede7:draft-memory-promotion"
  ```
- Apply promotion (blocked: Draft the promotion first to confirm the canonical target page before applying it.)

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.
