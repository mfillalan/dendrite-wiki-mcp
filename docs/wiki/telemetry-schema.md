---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Telemetry Ingestion Schema

This page defines the Turso libSQL schema for the current telemetry uploader. The goal is a direct, inspectable insert path with minimal transformation before any richer hosted analytics layer exists.

## Why Turso (vs Supabase)

The original draft of this page targeted Supabase. We switched to Turso because:

- **No idle pause on the free tier.** Supabase free projects pause after 7 days of no activity; Turso databases stay live indefinitely. For a low-volume telemetry endpoint that may receive nothing for weeks during early adoption, that meant the first opt-in upload after a quiet stretch would fail with a 503 wake-up window.
- **Generous free quota.** Turso Starter: 9 GB total storage, 1 billion row reads/month, 25 million row writes/month, 500 databases. Supabase free: 500 MB Postgres, max 2 active projects.
- **libSQL is SQLite-compatible.** Familiar shape, easy local debugging via `turso db shell` if you later want to inspect ingested rows interactively.

The trade-off: libSQL doesn't have JSONB as a first-class type the way Postgres does. Aggregate counters and the client-profile array are stored as TEXT-encoded JSON. SQLite's `json_extract()` lets you query into them anyway.

## Current Target

- The uploader posts to `<base>/v2/pipeline` where `<base>` is `DENDRITE_WIKI_TELEMETRY_TURSO_URL` (e.g. `https://my-db-myorg.turso.io`).
- Auth: `Authorization: Bearer <token>` where the token comes from `DENDRITE_WIKI_TELEMETRY_TURSO_TOKEN` (generated via `turso db tokens create <db>` or the Turso dashboard).
- The default table name is `benchmark_events`, overridable with `DENDRITE_WIKI_TELEMETRY_TURSO_TABLE`.
- Each upload sends one libSQL pipeline with two requests: an `execute` containing the parameterized `INSERT`, then a `close`.

## Column Contract

| Column | Type | Notes |
|---|---|---|
| `id` | `text primary key` | Server-side receipt id (UUID, generated as `lower(hex(randomblob(16)))`). |
| `received_at` | `text` | Server-side receipt timestamp (ISO 8601 UTC, `CURRENT_TIMESTAMP`). |
| `installation_id` | `text not null` | Random local installation id from the client (UUID). |
| `project_id` | `text not null` | Random local project id from the client (UUID). |
| `package_version` | `text` | Current package version or null. |
| `event` | `text not null` | Fixed to `telemetry_summary` in this milestone. |
| `timestamp` | `text` | Client-side event timestamp for the upload row (ISO 8601). |
| `sharing_mode` | `text` | Fixed to `opt-in`. |
| `client_profiles` | `text` | JSON-encoded array of client profile labels. |
| `metrics` | `text not null` | JSON-encoded object with aggregate counters only. |

The schema uses snake_case to match SQLite/libSQL conventions (vs the predecessor draft's camelCase quoted identifiers, which Postgres tolerated but SQLite handles awkwardly).

## SQL Artifact

Run once in the Turso CLI or dashboard SQL editor when you provision the database:

```sql
CREATE TABLE IF NOT EXISTS benchmark_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  installation_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  package_version TEXT,
  event TEXT NOT NULL CHECK (event = 'telemetry_summary'),
  timestamp TEXT,
  sharing_mode TEXT NOT NULL CHECK (sharing_mode = 'opt-in'),
  client_profiles TEXT,
  metrics TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS benchmark_events_timestamp_idx
  ON benchmark_events (timestamp DESC);

CREATE INDEX IF NOT EXISTS benchmark_events_installation_project_idx
  ON benchmark_events (installation_id, project_id);
```

## Operator Setup

If you want to receive telemetry from opt-in users (or send your own), one-time setup:

1. Sign up at https://turso.tech (free, GitHub OAuth)
2. `turso db create dendrite-wiki-telemetry` (or via dashboard)
3. `turso db shell dendrite-wiki-telemetry` and paste the SQL above
4. `turso db tokens create dendrite-wiki-telemetry` to generate an auth token
5. Get the database URL: `turso db show dendrite-wiki-telemetry --url`
6. Set the env vars locally for testing:
   ```
   DENDRITE_WIKI_TELEMETRY_TURSO_URL=https://dendrite-wiki-telemetry-<your-org>.turso.io
   DENDRITE_WIKI_TELEMETRY_TURSO_TOKEN=<the-token-from-step-4>
   ```
7. Run `npx dendrite-wiki telemetry opt-in` then `npx dendrite-wiki telemetry upload` to test the path

When ready to receive telemetry from external opt-in users, bake the URL + token into the package as defaults rather than requiring users to configure their own destination. The auth token can be scoped read-write only on the one table; users sending data shouldn't be able to query other rows.

## Access Notes

- The token in `DENDRITE_WIKI_TELEMETRY_TURSO_TOKEN` is supplied from a local shell, secrets manager, or baked-in package default — not from browser code.
- Keep the auth token narrowly scoped. Turso supports per-database tokens with read-only or read-write scopes; for this use case, read-write on the `benchmark_events` table only.
- If you later move to a different ingestion layer (e.g. a Worker that writes batched rows), preserve this wire contract or version it deliberately.

## Future Evolution

- Add richer tables only after the current payload stays stable across real opted-in projects.
- Prefer additive versioned changes instead of rewriting historical rows.
- If you outgrow the libSQL pipeline shape (e.g. need batched inserts of many rows per upload, or server-side aggregation), introduce a thin Worker / Edge Function that owns the schema and exposes a stable POST contract — don't change the client wire format silently.

See [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md) for the human-readable explanation of what the payload means and what never leaves the machine.
