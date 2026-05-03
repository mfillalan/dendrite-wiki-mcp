# Local LLM Evaluation

Dendrite Wiki MCP should not require a local LLM. A small local model can be useful later, but it is not worth making it part of the baseline product.

## Recommendation

Build the project around a deterministic no-LLM core. Treat local LLM support as an optional intelligence provider that can be enabled for richer synthesis on machines that can run it comfortably.

This keeps the MCP server useful on older laptops and keeps the product compatible with any coding agent IDE. The frontier agent already has reasoning ability during active work; this server's first job is to provide durable, structured, local project context.

## What A Small Local LLM Could Help With

A small local model can help with judgment-heavy maintenance that is tedious to encode by hand:

| Capability | Benefit |
|---|---|
| Summarize recent changes | Turns logs and diffs into concise page updates. |
| Propose page merges | Detects duplicated topics that deterministic link checks may miss. |
| Suggest missing links | Finds conceptual relationships beyond exact title matching. |
| Draft stale-claim notes | Explains why a claim may no longer match newer evidence. |
| Distill reusable instructions | Converts repeated fixes into a candidate skill or instruction update. |
| Rewrite noisy pages | Compresses long, repetitive pages into cleaner canonical summaries. |

These are real benefits, but they are quality-of-life accelerators. They are not required for the core value proposition.

## Costs And Risks

| Risk | Why It Matters |
|---|---|
| Hardware exclusion | Older laptops may not run even small models acceptably. |
| Latency | Background synthesis can make a lightweight MCP server feel heavy. |
| Operational friction | Ollama setup, model downloads, ports, and timeouts become user support burden. |
| Silent corruption | A weak model can summarize incorrectly and make stale memory worse. |
| Non-determinism | Tests and maintenance become harder to reason about. |
| Token savings uncertainty | A local model saves frontier tokens only if its outputs are trusted and compact. |

The most dangerous failure is not that the local model is slow. It is that the local model confidently reorganizes project memory into a wrong but polished shape.

## No-LLM Alternatives

Many high-value maintenance jobs can be done without a local model:

| Need | Deterministic Approach |
|---|---|
| Find pages | File catalog, title search, content search, SQLite FTS later. |
| Find broken links | Parse markdown links and validate targets. |
| Find orphan pages | Build inbound link counts from index and wiki pages. |
| Detect stale memories | Track source timestamps, file hashes, claim status, and last verified dates. |
| Prevent duplicate pages | Slug aliases, title normalization, frontmatter IDs, similarity by tokens. |
| Build context packs | Rank by explicit links, tags, recent edits, user query terms, and source freshness. |
| Keep instructions small | Enforce length budgets and split durable details into linked wiki pages. |
| Review changes | Use git diffs, patch summaries, and pending proposal files. |

The frontier coding agent can still perform synthesis when the user is actively working. The MCP server should provide the rails: retrieve evidence, enforce structure, write safely, and lint output.

## Optional Provider Model

If local LLM support is added, it should be provider-agnostic and optional:

- `none`: default deterministic behavior.
- `agent`: ask the active coding agent to perform synthesis through normal tool calls.
- `ollama`: use a local model when available.
- `cloud`: optional future provider for users who choose remote inference.

Every provider should write through the same validation gateway. No provider should bypass source checks, link checks, stale-claim rules, or undo logging.

## Decision

The project should remove local LLM from required Phase 5 language and replace it with "optional synthesis providers." The first milestone should prove that deterministic wiki hygiene, project-local context packs, and source-backed claims reduce stale memory noise before adding any model-driven background worker.
