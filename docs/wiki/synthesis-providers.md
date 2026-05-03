# Synthesis Providers

This page explains the optional synthesis-provider surface for Dendrite Wiki MCP.

## Purpose

Synthesis providers add optional model-assisted explanations without making inference a requirement for the wiki to be useful.

The first product-facing slice is deliberately narrow:

- `wiki_synthesize_proposals` can generate short proposal explanations for the current deterministic maintenance proposals.
- The default provider stays `none`, so the tool returns explicit disabled metadata instead of silently trying to call a model.
- Existing deterministic tools such as `wiki_proposals`, `wiki_maintenance_inbox`, and `wiki_apply_proposal` stay unchanged.

## Provider Kinds

| Provider | Status | Notes |
|---|---|---|
| `none` | Available now | Default. Returns disabled status and leaves deterministic behavior unchanged. |
| `agent` | Reserved | Planned for a future client-side handoff flow instead of MCP-server-side inference. |
| `ollama` | Available now | Calls a local Ollama `/api/generate` endpoint for bounded proposal explanations. |
| `cloud` | Reserved | Placeholder for future remote inference providers. |

## Configuration

The MCP server reads these environment variables:

```bash
DENDRITE_WIKI_SYNTHESIS_PROVIDER=none
DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS=8000
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e2b
```

Notes:

- `DENDRITE_WIKI_SYNTHESIS_PROVIDER` defaults to `none`.
- `DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS` bounds provider latency.
- `OLLAMA_MODEL` is required when the selected provider is `ollama`.
- `agent` and `cloud` are typed provider options, but they currently return an explicit unavailable status.

## MCP Tool

Use `wiki_synthesize_proposals` when you want optional, bounded proposal explanations without changing any files.

Example:

```json
{
  "provider": "ollama",
  "maxItems": 2
}
```

The tool returns:

- provider metadata: kind, status, timeout, and any configuration reason
- deterministic proposal context: summary, current-state summary, after-apply summary, and rationale
- synthesis status per proposal: `disabled`, `unavailable`, `generated`, or `failed`
- synthesized text only when the provider succeeds

## Safety Model

Optional synthesis is additive and read-only in the current phase.

- The tool does not mutate wiki files.
- Provider output is normalized into a single short sentence.
- Oversized or empty provider output is rejected instead of being trusted.
- Deterministic lint, proposal generation, review pages, and apply flows remain the write gateway for project changes.

## Planned Expansion

Later Phase 6 work can reuse the same provider contract for:

- stale-claim explanations
- instruction distillation
- richer merge or cleanup rationale

Those future paths should keep the same rule: providers may suggest, but deterministic validation gates every write.