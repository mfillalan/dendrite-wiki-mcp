import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DendriteBenchmarkEventSummary } from './benchmark-events.js';

export type DendriteTelemetrySharingMode = 'off' | 'opt-in';

export interface DendriteTelemetryConfig {
  schemaVersion: 1;
  sharingMode: DendriteTelemetrySharingMode;
  updatedAt: string;
}

export interface DendriteTelemetryStatusArtifact {
  schemaVersion: 1;
  generatedAt: string;
  sharingMode: DendriteTelemetrySharingMode;
  sharingEnabled: boolean;
  consent: {
    isExplicit: boolean;
    updatedAt: string | null;
  };
  paths: {
    configPath: string;
    statusArtifactPath: string;
    benchmarkEventLogPath: string;
    benchmarkEventSummaryPath: string;
  };
  remoteUpload: {
    configured: boolean;
    destination: string | null;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
  };
  benchmarkEvents: {
    eventCount: number;
    latestEventAt: string | null;
    byType: DendriteBenchmarkEventSummary['byType'];
  };
  notes: string[];
}

const dataDirRelativePath = process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data';
const telemetryConfigRelativePath = path.join(dataDirRelativePath, 'telemetry.json');
const benchmarkEventLogRelativePath = path.join(dataDirRelativePath, 'benchmark-events.jsonl');
const benchmarkEventSummaryRelativePath = path.join('docs', 'public', 'dendrite-benchmark-events-summary.json');
const telemetryStatusArtifactRelativePath = path.join('docs', 'public', 'dendrite-telemetry-status.json');

export function resolveTelemetryPaths(root: string = process.cwd()): {
  root: string;
  configPath: string;
  statusArtifactPath: string;
  benchmarkEventLogPath: string;
  benchmarkEventSummaryPath: string;
} {
  const resolvedRoot = path.resolve(root);
  return {
    root: resolvedRoot,
    configPath: path.join(resolvedRoot, telemetryConfigRelativePath),
    statusArtifactPath: path.join(resolvedRoot, telemetryStatusArtifactRelativePath),
    benchmarkEventLogPath: path.join(resolvedRoot, benchmarkEventLogRelativePath),
    benchmarkEventSummaryPath: path.join(resolvedRoot, benchmarkEventSummaryRelativePath)
  };
}

export async function readTelemetryConfig(root: string = process.cwd()): Promise<DendriteTelemetryConfig | null> {
  const { configPath } = resolveTelemetryPaths(root);
  const content = await fs.readFile(configPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });

  if (content === null) {
    return null;
  }

  const parsed = JSON.parse(content) as Partial<DendriteTelemetryConfig>;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`Unsupported telemetry config schema in ${toPortablePath(path.relative(root, configPath))}.`);
  }
  if (parsed.sharingMode !== 'off' && parsed.sharingMode !== 'opt-in') {
    throw new Error(`Invalid telemetry sharing mode in ${toPortablePath(path.relative(root, configPath))}.`);
  }
  if (typeof parsed.updatedAt !== 'string' || parsed.updatedAt.length === 0) {
    throw new Error(`Telemetry config in ${toPortablePath(path.relative(root, configPath))} is missing updatedAt.`);
  }

  return {
    schemaVersion: 1,
    sharingMode: parsed.sharingMode,
    updatedAt: parsed.updatedAt
  };
}

export async function setTelemetrySharingMode(
  sharingMode: DendriteTelemetrySharingMode,
  root: string = process.cwd()
): Promise<DendriteTelemetryStatusArtifact> {
  const { configPath } = resolveTelemetryPaths(root);
  const config: DendriteTelemetryConfig = {
    schemaVersion: 1,
    sharingMode,
    updatedAt: new Date().toISOString()
  };

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return writeTelemetryStatusArtifact(root);
}

export async function writeTelemetryStatusArtifact(root: string = process.cwd()): Promise<DendriteTelemetryStatusArtifact> {
  const telemetryStatus = await buildTelemetryStatusArtifact(root);
  const { statusArtifactPath } = resolveTelemetryPaths(root);

  await fs.mkdir(path.dirname(statusArtifactPath), { recursive: true });
  await fs.writeFile(statusArtifactPath, `${JSON.stringify(telemetryStatus, null, 2)}\n`, 'utf8');

  return telemetryStatus;
}

async function buildTelemetryStatusArtifact(root: string): Promise<DendriteTelemetryStatusArtifact> {
  const paths = resolveTelemetryPaths(root);
  const config = await readTelemetryConfig(root);
  const benchmarkEventSummary = await readBenchmarkEventSummary(paths.benchmarkEventSummaryPath);
  const latestEventAt = benchmarkEventSummary?.recentEvents.at(-1)?.timestamp ?? null;
  const sharingMode = config?.sharingMode ?? 'off';
  const notes = buildTelemetryNotes(sharingMode, benchmarkEventSummary?.eventCount ?? 0);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sharingMode,
    sharingEnabled: sharingMode === 'opt-in',
    consent: {
      isExplicit: config !== null,
      updatedAt: config?.updatedAt ?? null
    },
    paths: {
      configPath: toPortablePath(path.relative(paths.root, paths.configPath)),
      statusArtifactPath: toPortablePath(path.relative(paths.root, paths.statusArtifactPath)),
      benchmarkEventLogPath: toPortablePath(path.relative(paths.root, paths.benchmarkEventLogPath)),
      benchmarkEventSummaryPath: toPortablePath(path.relative(paths.root, paths.benchmarkEventSummaryPath))
    },
    remoteUpload: {
      configured: false,
      destination: null,
      lastAttemptAt: null,
      lastSuccessAt: null
    },
    benchmarkEvents: {
      eventCount: benchmarkEventSummary?.eventCount ?? 0,
      latestEventAt,
      byType: benchmarkEventSummary?.byType ?? createEmptyEventCounts()
    },
    notes
  };
}

async function readBenchmarkEventSummary(summaryPath: string): Promise<DendriteBenchmarkEventSummary | null> {
  const content = await fs.readFile(summaryPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });

  if (content === null) {
    return null;
  }

  return JSON.parse(content) as DendriteBenchmarkEventSummary;
}

function createEmptyEventCounts(): DendriteBenchmarkEventSummary['byType'] {
  return {
    session_started: 0,
    context_requested: 0,
    wiki_updated: 0,
    maintenance_state_changed: 0,
    session_snapshot: 0
  };
}

function buildTelemetryNotes(sharingMode: DendriteTelemetrySharingMode, eventCount: number): string[] {
  const notes = [`Automatic local benchmark events remain enabled and currently include ${eventCount} captured events.`];

  if (sharingMode === 'opt-in') {
    notes.push('Telemetry sharing consent is recorded locally, but no remote upload destination is configured yet.');
  } else {
    notes.push('Telemetry sharing is off. Local benchmark artifacts continue to work without sending data anywhere.');
  }

  return notes;
}

function toPortablePath(value: string): string {
  return value.replace(/\\/g, '/');
}