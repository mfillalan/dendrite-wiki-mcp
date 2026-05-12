---
lifecycle: active
owner: unassigned
sourceCoverage: generated
---

# Telemetry Status

This page exposes the current local telemetry consent state and the benchmark event stream that exists even when sharing is off.

## Two Ways To Manage Consent

**Browser (when running `npm run docs:dev`):** the panel below has interactive buttons for **Opt in to sharing**, **Stop sharing**, and **Upload latest snapshot**. The buttons talk to the same-origin review bridge mounted by the VitePress dev plugin — no CORS, no token, no terminal required. When the browser bridge isn't available (static-built page), the panel automatically falls back to read-only display with the CLI instructions below.

**CLI (always available):**

- `dendrite-wiki telemetry status` refreshes the status artifact.
- `dendrite-wiki telemetry opt-in` records explicit local consent for future sanitized uploads.
- `dendrite-wiki telemetry opt-out` keeps the product local-only.
- `dendrite-wiki telemetry upload` sends the current sanitized summary payload when consent is on and the Turso libSQL env vars are configured.

## Upload Configuration

- Set `DENDRITE_WIKI_TELEMETRY_TURSO_URL` to the Turso libSQL database base URL such as `https://my-db-myorg.turso.io`. The uploader appends `/v2/pipeline` to reach the libSQL HTTP API.
- Set `DENDRITE_WIKI_TELEMETRY_TURSO_TOKEN` to the auth token from `turso db tokens create <db>` or the Turso dashboard.
- Optional: set `DENDRITE_WIKI_TELEMETRY_TURSO_TABLE` to override the default `benchmark_events` table.
- Optional: set `DENDRITE_WIKI_TELEMETRY_CLIENT_PROFILES` to a comma-separated list such as `claude,codex,cursor`.

## Disclosure And Contract

- Read [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md) for the exact shared fields and the fields that never leave the machine in this milestone.
- Read [Telemetry Ingestion Schema](./telemetry-schema.md) for the current Turso libSQL table contract and the published SQL artifact.
- The current example upload row is published at [/dendrite-telemetry-sample-payload.json](/dendrite-telemetry-sample-payload.json).

## Local-First Rules

- No upload happens by default.
- The upload attempt always writes a local audit artifact at `local-data/telemetry-upload-audit.json`.
- The status page mirrors the last sanitized payload preview so the operator can inspect what would be or was sent.
- Benchmark pages, event summaries, and the wiki itself remain useful with no account and no network.

<TelemetryStatus />