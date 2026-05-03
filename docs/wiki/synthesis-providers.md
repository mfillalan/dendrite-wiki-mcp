# Synthesis Providers

This page explains the optional synthesis-provider surface for Dendrite Wiki MCP.

## Purpose

Synthesis providers add optional model-assisted explanations without making inference a requirement for the wiki to be useful.

The Phase 6 product-facing surface is deliberately read-only:

- `wiki_synthesize_proposals` can generate short proposal explanations for the current deterministic maintenance proposals.
- `wiki_synthesize_claims` can generate review explanations for stale or non-current claims.
- `wiki_synthesize_guidance` can generate concise distillation notes for agent guidance files.
- The default provider stays `none`, so the tool returns explicit disabled metadata instead of silently trying to call a model.
- Existing deterministic tools such as `wiki_proposals`, `wiki_maintenance_inbox`, and `wiki_apply_proposal` stay unchanged.

## Provider Kinds

| Provider | Status | Notes |
|---|---|---|
| `none` | Available now | Default. Returns disabled status and leaves deterministic behavior unchanged. |
| `agent` | Available now | Returns bounded handoff prompts for the active coding agent instead of running server-side inference. |
| `ollama` | Available now | Calls a local Ollama `/api/generate` endpoint for bounded synthesis output. |
| `cloud` | Available when configured | Calls an OpenAI-compatible chat-completions HTTP endpoint with a bearer token. |

## Configuration

The MCP server reads these environment variables:

```bash
DENDRITE_WIKI_SYNTHESIS_PROVIDER=none
DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS=8000
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e2b
DENDRITE_WIKI_CLOUD_URL=https://api.example.invalid/v1/chat/completions
DENDRITE_WIKI_CLOUD_MODEL=example-model
DENDRITE_WIKI_CLOUD_API_KEY=...
```

Notes:

- `DENDRITE_WIKI_SYNTHESIS_PROVIDER` defaults to `none`.
- `DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS` bounds provider latency.
- `OLLAMA_MODEL` is required when the selected provider is `ollama`.
- `agent` returns handoff prompts that a coding agent can act on through normal tool calls.
- `cloud` requires `DENDRITE_WIKI_CLOUD_URL`, `DENDRITE_WIKI_CLOUD_MODEL`, and `DENDRITE_WIKI_CLOUD_API_KEY`. The endpoint should accept an OpenAI-compatible chat-completions request and return either `choices[0].message.content` or `output_text`.

## MCP Tool

Use the synthesis tools when you want optional, bounded model-assisted explanations without changing any files.

Example:

```json
{
  "provider": "ollama",
  "maxItems": 2
}
```

The tool returns:

- provider metadata: kind, status, timeout, and any configuration reason
- deterministic evidence context for the requested synthesis target
- synthesis status per item: `disabled`, `unavailable`, `handoff`, `generated`, or `failed`
- synthesized text only when the provider succeeds
- handoff prompts when the provider is `agent`

Current tools:

| Tool | Purpose |
|---|---|
| `wiki_synthesize_proposals` | Summarize deterministic maintenance proposals and merge or route guidance suggestions. |
| `wiki_synthesize_claims` | Explain why stale or non-current claims should be reviewed before trust. |
| `wiki_synthesize_guidance` | Distill agent instruction and skill files into concise review notes. |

## Safety Model

Optional synthesis is additive and read-only.

- The tools do not mutate wiki files.
- Provider output is normalized into a single short sentence.
- Oversized or empty provider output is rejected instead of being trusted.
- Deterministic lint, proposal generation, review pages, and apply flows remain the write gateway for project changes.
- Providers may suggest, but deterministic validation gates every write.