---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: shipped
---

# GitHub Action: Dendrite Context for Diff

This page documents the Dendrite Wiki PR-context GitHub Action — a composite Action that posts the same project knowledge the in-editor agent sees as a PR comment, scoped to the changed files.

The Action is the deployment wrapper around the `dendrite-wiki context-for-diff` CLI shipped in C6 slice 2. It exposes the moat (markdown-canonical wiki + scoped skills + explainable recall) at exactly the moment teams care most: code review.

## What it does

On every pull request open or push:

1. Computes the changed file list between base and head SHAs.
2. Runs `dendrite-wiki context-for-diff` against that file list, scoped to the downstream repo's own `docs/wiki/` and `local-data/project-memories.json`.
3. Posts the result as a sticky-style PR comment (or writes to the GitHub job summary if no PR context is available).

The output surfaces matching wiki pages, project-local memories, and skill memories — each with the same explainable `reasons[]` the in-editor agent sees, so reviewers know *why* a memory was surfaced for this change.

## Setup (downstream repo)

Create `.github/workflows/dendrite-pr-context.yml` in your repo:

```yaml
name: Dendrite PR Context

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: mfillalan/dendrite-wiki-mcp/.github/actions/dendrite-context@main
        with:
          base-ref: ${{ github.event.pull_request.base.sha }}
          head-ref: ${{ github.event.pull_request.head.sha }}
```

That's the whole setup. The Action installs `dendrite-wiki-mcp` from npm at runtime (no separate dependency to manage) and uses your repo's existing `docs/wiki/` content as the knowledge source.

## Inputs

| Input | Default | Notes |
|---|---|---|
| `base-ref` | PR base SHA, then `origin/main`, then `HEAD~1` | Git ref or SHA the diff is computed against. |
| `head-ref` | `HEAD` | Git ref or SHA representing the changes. |
| `query` | (auto) | Optional task description to refine context recall. |
| `comment-mode` | `pr` on PR events, `summary` otherwise | `pr` posts a comment; `summary` writes to the GitHub job summary; `stdout` prints only. |
| `dist-tag` | `alpha` | npm dist-tag for `dendrite-wiki-mcp`. Switch to `latest` once a stable tag ships. |
| `node-version` | `20` | Node.js version to use. |

## Outputs

| Output | Notes |
|---|---|
| `changed-files-count` | Number of changed files analyzed. |
| `context-markdown-path` | Local path to the rendered markdown comment body. |

## Required permissions

The downstream workflow needs:

- `contents: read` — to check out the repo and run `git diff`.
- `pull-requests: write` — to post a comment when `comment-mode: pr`.

If you only want a job summary (no PR comment), drop `pull-requests: write`.

## What it surfaces

Per file in the diff, the comment shows up to:

- **Matching skills** — scope-bound skill memories whose `filePatterns`, `frameworks`, `languages`, or `taskKeywords` match the file. Each row carries the skill's id, summary, and the top 2 explainable reasons from the recall layer.
- **Relevant memories** — project-local memories ranked against the file path; same explainability surface as the in-editor `wiki_context` tool.
- **Relevant wiki pages** — pages from `docs/wiki/` ranked by the same deterministic search the agent uses. Each row links to the page in the repo.

Duplicates are removed across files, so a single memory or page only appears once even if it matches multiple files in the diff.

## Why this matters

Most memory tools cannot expose their state at code-review time because their storage is opaque (vector DBs, observation blobs). Dendrite's storage is markdown — so the Action just renders the same `wiki_context` output the agent sees. Reviewers benefit from the same project knowledge the agent does, without having to ask the agent to summarize.

For the broader competitive framing, see [comparison-claude-mem](./comparison-claude-mem.md). For the CLI half (which works locally without an Action), see the `context-for-diff` subcommand documented in the [Competitive Feature Roadmap](./competitive-feature-roadmap.md) under phase C6.

## Limits

- The Action depends on the downstream repo having a populated `docs/wiki/` directory and active project-local memories. Empty repos produce a "no relevant context" comment.
- Comments are not currently sticky-edited — each PR push will post a new comment rather than editing the previous one. A sticky-comment slice can ship later if the noise becomes a real problem.
- The Action runs `npx -y dendrite-wiki-mcp@<dist-tag> context-for-diff` at runtime; first invocation per workflow run will incur the npm download cost.

## Related pages

- [Competitive Feature Roadmap](./competitive-feature-roadmap.md) — phase C6 (this slice)
- [Comparison: Dendrite vs claude-mem](./comparison-claude-mem.md) — why this Action is a moat play
- [MCP Server Installation](./mcp-installation.md) — how to wire up the in-editor counterpart

## Claims

- [current] The dendrite-context GitHub Action is a composite manifest at `.github/actions/dendrite-context/action.yml` that wraps the `dendrite-wiki context-for-diff` CLI shipped in C6 slice 2; downstream repos consume it via `uses: mfillalan/dendrite-wiki-mcp/.github/actions/dendrite-context@main` with `pull-requests: write` permission. Sources: file:.github/actions/dendrite-context/action.yml, file:src/wiki/diff-context.ts, [Competitive Feature Roadmap](./competitive-feature-roadmap.md)
