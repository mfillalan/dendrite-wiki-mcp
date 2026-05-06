-- Turso libSQL schema for the Dendrite Wiki MCP telemetry uploader.
-- See docs/wiki/telemetry-schema.md for the full operator setup walkthrough.
--
-- Run once when provisioning the database, e.g.:
--   turso db shell <db-name> < dendrite-telemetry-turso-schema.sql

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
