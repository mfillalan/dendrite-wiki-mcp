import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DendriteBenchmarkEventSummary } from './benchmark-events.js';

export type DendriteTelemetrySharingMode = 'off' | 'opt-in';

export interface DendriteTelemetryConfig {
  schemaVersion: 1;
  sharingMode: DendriteTelemetrySharingMode;
  updatedAt: string;
  installationId: string;
  projectId: string;
}

export interface DendriteTelemetryUploadPayload {
  schemaVersion: 1;
  installationId: string;
  projectId: string;
  packageVersion: string | null;
  event: 'telemetry_summary';
  timestamp: string;
  sharingMode: 'opt-in';
  clientProfiles: string[];
  metrics: {
    eventCount: number;
    sessionStartedCount: number;
    contextRequestCount: number;
    wikiUpdateCount: number;
    maintenanceStateChangeCount: number;
    sessionSnapshotCount: number;
    latestContextPageCount: number | null;
    latestContextOmittedPageCount: number | null;
    latestOpenQuestionCount: number | null;
    acceptedProposalCount: number;
    latestLintFindingCount: number | null;
    latestProposalCount: number | null;
  };
}

export interface DendriteTelemetryUploadAttempt {
  attemptedAt: string;
  status: 'success' | 'error' | 'skipped';
  destination: string | null;
  reason: string | null;
  httpStatus: number | null;
  responseBody: string | null;
  payload: DendriteTelemetryUploadPayload | null;
}

export interface DendriteTelemetryUploadAudit {
  schemaVersion: 1;
  updatedAt: string;
  destination: string | null;
  lastAttempt: DendriteTelemetryUploadAttempt | null;
  lastSuccess: DendriteTelemetryUploadAttempt | null;
}

export interface DendriteTelemetryUploadResult {
  ok: boolean;
  message: string;
  auditPath: string;
  destination: string | null;
  attempt: DendriteTelemetryUploadAttempt;
  status: DendriteTelemetryStatusArtifact;
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
    uploadAuditPath: string;
    benchmarkEventLogPath: string;
    benchmarkEventSummaryPath: string;
  };
  remoteUpload: {
    configured: boolean;
    destination: string | null;
    auditPath: string;
    lastAttemptAt: string | null;
    lastAttemptStatus: 'success' | 'error' | 'skipped' | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastPayloadPreview: DendriteTelemetryUploadPayload | null;
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
const telemetryUploadAuditRelativePath = path.join(dataDirRelativePath, 'telemetry-upload-audit.json');
const benchmarkEventLogRelativePath = path.join(dataDirRelativePath, 'benchmark-events.jsonl');
const benchmarkEventSummaryRelativePath = path.join('docs', 'public', 'dendrite-benchmark-events-summary.json');
const telemetryStatusArtifactRelativePath = path.join('docs', 'public', 'dendrite-telemetry-status.json');

interface TelemetryUploadOptions {
  root?: string;
  fetchImpl?: typeof fetch;
  packageVersion?: string | null;
}

interface SupabaseUploadTarget {
  configured: boolean;
  destination: string | null;
  apiKey: string | null;
}

export function resolveTelemetryPaths(root: string = process.cwd()): {
  root: string;
  configPath: string;
  statusArtifactPath: string;
  uploadAuditPath: string;
  benchmarkEventLogPath: string;
  benchmarkEventSummaryPath: string;
} {
  const resolvedRoot = path.resolve(root);
  return {
    root: resolvedRoot,
    configPath: path.join(resolvedRoot, telemetryConfigRelativePath),
    statusArtifactPath: path.join(resolvedRoot, telemetryStatusArtifactRelativePath),
    uploadAuditPath: path.join(resolvedRoot, telemetryUploadAuditRelativePath),
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
  if (typeof parsed.installationId !== 'string' || parsed.installationId.length === 0) {
    throw new Error(`Telemetry config in ${toPortablePath(path.relative(root, configPath))} is missing installationId.`);
  }
  if (typeof parsed.projectId !== 'string' || parsed.projectId.length === 0) {
    throw new Error(`Telemetry config in ${toPortablePath(path.relative(root, configPath))} is missing projectId.`);
  }

  return {
    schemaVersion: 1,
    sharingMode: parsed.sharingMode,
    updatedAt: parsed.updatedAt,
    installationId: parsed.installationId,
    projectId: parsed.projectId
  };
}

export async function setTelemetrySharingMode(
  sharingMode: DendriteTelemetrySharingMode,
  root: string = process.cwd()
): Promise<DendriteTelemetryStatusArtifact> {
  const existingConfig = await readTelemetryConfig(root).catch((error) => {
    if (error instanceof Error && /missing installationId|missing projectId/.test(error.message)) {
      return null;
    }
    throw error;
  });
  const { configPath } = resolveTelemetryPaths(root);
  const config: DendriteTelemetryConfig = {
    schemaVersion: 1,
    sharingMode,
    updatedAt: new Date().toISOString(),
    installationId: existingConfig?.installationId ?? randomUUID(),
    projectId: existingConfig?.projectId ?? randomUUID()
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

export async function uploadTelemetry(options: TelemetryUploadOptions = {}): Promise<DendriteTelemetryUploadResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const fetchImpl = options.fetchImpl ?? fetch;
  const telemetryConfig = await readTelemetryConfig(root).catch((error) => {
    if (error instanceof Error && /missing installationId|missing projectId/.test(error.message)) {
      return null;
    }
    throw error;
  });
  const target = resolveSupabaseUploadTarget();
  const packageVersion = options.packageVersion ?? (await readPackageVersion(root));

  if (telemetryConfig?.sharingMode !== 'opt-in') {
    return finalizeUploadAttempt(root, target.destination, {
      attemptedAt: new Date().toISOString(),
      status: 'skipped',
      destination: target.destination,
      reason: 'Telemetry sharing is not enabled. Run dendrite-wiki telemetry opt-in first.',
      httpStatus: null,
      responseBody: null,
      payload: null
    });
  }

  if (!target.configured || !target.destination || !target.apiKey) {
    return finalizeUploadAttempt(root, target.destination, {
      attemptedAt: new Date().toISOString(),
      status: 'skipped',
      destination: target.destination,
      reason: 'Supabase upload is not configured. Set DENDRITE_WIKI_TELEMETRY_SUPABASE_URL and DENDRITE_WIKI_TELEMETRY_SUPABASE_KEY.',
      httpStatus: null,
      responseBody: null,
      payload: null
    });
  }

  const payload = await buildTelemetryUploadPayload(root, telemetryConfig, packageVersion);

  let attempt = 0;
  let lastError: DendriteTelemetryUploadAttempt | null = null;
  while (attempt < 2) {
    attempt += 1;
    try {
      const response = await fetchImpl(target.destination, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: target.apiKey,
          authorization: `Bearer ${target.apiKey}`,
          prefer: 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
      const responseBody = await response.text();

      if (response.ok) {
        return finalizeUploadAttempt(root, target.destination, {
          attemptedAt: new Date().toISOString(),
          status: 'success',
          destination: target.destination,
          reason: null,
          httpStatus: response.status,
          responseBody: responseBody.length > 0 ? responseBody : null,
          payload
        });
      }

      lastError = {
        attemptedAt: new Date().toISOString(),
        status: 'error',
        destination: target.destination,
        reason: `Supabase upload failed with HTTP ${response.status}.`,
        httpStatus: response.status,
        responseBody: responseBody.length > 0 ? responseBody : null,
        payload
      };
      if (response.status < 500) {
        break;
      }
    } catch (error) {
      lastError = {
        attemptedAt: new Date().toISOString(),
        status: 'error',
        destination: target.destination,
        reason: error instanceof Error ? error.message : String(error),
        httpStatus: null,
        responseBody: null,
        payload
      };
    }
  }

  return finalizeUploadAttempt(
    root,
    target.destination,
    lastError ?? {
      attemptedAt: new Date().toISOString(),
      status: 'error',
      destination: target.destination,
      reason: 'Supabase upload failed.',
      httpStatus: null,
      responseBody: null,
      payload
    }
  );
}

async function buildTelemetryStatusArtifact(root: string): Promise<DendriteTelemetryStatusArtifact> {
  const paths = resolveTelemetryPaths(root);
  const config = await readTelemetryConfig(root);
  const benchmarkEventSummary = await readBenchmarkEventSummary(paths.benchmarkEventSummaryPath);
  const uploadAudit = await readTelemetryUploadAudit(paths.uploadAuditPath);
  const uploadTarget = resolveSupabaseUploadTarget();
  const latestEventAt = benchmarkEventSummary?.recentEvents.at(-1)?.timestamp ?? null;
  const sharingMode = config?.sharingMode ?? 'off';
  const notes = buildTelemetryNotes(sharingMode, benchmarkEventSummary?.eventCount ?? 0, uploadTarget.configured, uploadAudit?.lastAttempt ?? null);

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
      uploadAuditPath: toPortablePath(path.relative(paths.root, paths.uploadAuditPath)),
      benchmarkEventLogPath: toPortablePath(path.relative(paths.root, paths.benchmarkEventLogPath)),
      benchmarkEventSummaryPath: toPortablePath(path.relative(paths.root, paths.benchmarkEventSummaryPath))
    },
    remoteUpload: {
      configured: uploadTarget.configured,
      destination: uploadTarget.destination,
      auditPath: toPortablePath(path.relative(paths.root, paths.uploadAuditPath)),
      lastAttemptAt: uploadAudit?.lastAttempt?.attemptedAt ?? null,
      lastAttemptStatus: uploadAudit?.lastAttempt?.status ?? null,
      lastSuccessAt: uploadAudit?.lastSuccess?.attemptedAt ?? null,
      lastError: uploadAudit?.lastAttempt?.status === 'error' ? uploadAudit.lastAttempt.reason : null,
      lastPayloadPreview: uploadAudit?.lastSuccess?.payload ?? uploadAudit?.lastAttempt?.payload ?? null
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

async function readTelemetryUploadAudit(auditPath: string): Promise<DendriteTelemetryUploadAudit | null> {
  const content = await fs.readFile(auditPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });

  if (content === null) {
    return null;
  }

  return JSON.parse(content) as DendriteTelemetryUploadAudit;
}

async function writeTelemetryUploadAudit(root: string, audit: DendriteTelemetryUploadAudit): Promise<void> {
  const { uploadAuditPath } = resolveTelemetryPaths(root);
  await fs.mkdir(path.dirname(uploadAuditPath), { recursive: true });
  await fs.writeFile(uploadAuditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

async function finalizeUploadAttempt(
  root: string,
  destination: string | null,
  attempt: DendriteTelemetryUploadAttempt
): Promise<DendriteTelemetryUploadResult> {
  const previousAudit = await readTelemetryUploadAudit(resolveTelemetryPaths(root).uploadAuditPath);
  const audit: DendriteTelemetryUploadAudit = {
    schemaVersion: 1,
    updatedAt: attempt.attemptedAt,
    destination,
    lastAttempt: attempt,
    lastSuccess: attempt.status === 'success' ? attempt : previousAudit?.lastSuccess ?? null
  };

  await writeTelemetryUploadAudit(root, audit);
  const status = await writeTelemetryStatusArtifact(root);

  return {
    ok: attempt.status === 'success',
    message: attempt.reason ?? (attempt.status === 'success' ? 'Telemetry upload completed.' : 'Telemetry upload skipped.'),
    auditPath: status.paths.uploadAuditPath,
    destination,
    attempt,
    status
  };
}

async function buildTelemetryUploadPayload(
  root: string,
  config: DendriteTelemetryConfig,
  packageVersion: string | null
): Promise<DendriteTelemetryUploadPayload> {
  const benchmarkEventSummary = await readBenchmarkEventSummary(resolveTelemetryPaths(root).benchmarkEventSummaryPath);

  return {
    schemaVersion: 1,
    installationId: config.installationId,
    projectId: config.projectId,
    packageVersion,
    event: 'telemetry_summary',
    timestamp: new Date().toISOString(),
    sharingMode: 'opt-in',
    clientProfiles: readClientProfilesFromEnv(),
    metrics: {
      eventCount: benchmarkEventSummary?.eventCount ?? 0,
      sessionStartedCount: benchmarkEventSummary?.usage.sessionStartedCount ?? 0,
      contextRequestCount: benchmarkEventSummary?.usage.contextRequestCount ?? 0,
      wikiUpdateCount: benchmarkEventSummary?.usage.wikiUpdateCount ?? 0,
      maintenanceStateChangeCount: benchmarkEventSummary?.usage.maintenanceStateChangeCount ?? 0,
      sessionSnapshotCount: benchmarkEventSummary?.usage.sessionSnapshotCount ?? 0,
      latestContextPageCount: benchmarkEventSummary?.orientation.latestContextPageCount ?? null,
      latestContextOmittedPageCount: benchmarkEventSummary?.orientation.latestContextOmittedPageCount ?? null,
      latestOpenQuestionCount: benchmarkEventSummary?.orientation.latestOpenQuestionCount ?? null,
      acceptedProposalCount: benchmarkEventSummary?.maintenance.acceptedProposalCount ?? 0,
      latestLintFindingCount: benchmarkEventSummary?.maintenance.latestLintFindingCount ?? null,
      latestProposalCount: benchmarkEventSummary?.maintenance.latestProposalCount ?? null
    }
  };
}

function resolveSupabaseUploadTarget(): SupabaseUploadTarget {
  const baseUrl = process.env.DENDRITE_WIKI_TELEMETRY_SUPABASE_URL?.trim() ?? '';
  const apiKey = process.env.DENDRITE_WIKI_TELEMETRY_SUPABASE_KEY?.trim() ?? '';
  const table = process.env.DENDRITE_WIKI_TELEMETRY_SUPABASE_TABLE?.trim() || 'benchmark_events';

  if (!baseUrl || !apiKey) {
    return {
      configured: false,
      destination: baseUrl ? `${baseUrl.replace(/\/$/, '')}/rest/v1/${table}` : null,
      apiKey: apiKey || null
    };
  }

  return {
    configured: true,
    destination: `${baseUrl.replace(/\/$/, '')}/rest/v1/${table}`,
    apiKey
  };
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

function buildTelemetryNotes(
  sharingMode: DendriteTelemetrySharingMode,
  eventCount: number,
  uploadConfigured: boolean,
  lastAttempt: DendriteTelemetryUploadAttempt | null
): string[] {
  const notes = [`Automatic local benchmark events remain enabled and currently include ${eventCount} captured events.`];

  if (sharingMode === 'opt-in') {
    notes.push(
      uploadConfigured
        ? 'Telemetry sharing consent is recorded locally and the uploader can send the sanitized summary payload when you run dendrite-wiki telemetry upload.'
        : 'Telemetry sharing consent is recorded locally, but no Supabase upload destination is configured yet.'
    );
  } else {
    notes.push('Telemetry sharing is off. Local benchmark artifacts continue to work without sending data anywhere.');
  }

  if (lastAttempt?.status === 'success') {
    notes.push('The last telemetry upload completed successfully and the sanitized payload preview is available on this page.');
  } else if (lastAttempt?.status === 'error') {
    notes.push(`The last telemetry upload failed: ${lastAttempt.reason ?? 'unknown error'}`);
  }

  return notes;
}

function readClientProfilesFromEnv(): string[] {
  const value = process.env.DENDRITE_WIKI_TELEMETRY_CLIENT_PROFILES?.trim();
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function readPackageVersion(root: string): Promise<string | null> {
  const packageJsonPath = path.join(root, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });

  if (content === null) {
    return null;
  }

  const parsed = JSON.parse(content) as { version?: unknown };
  return typeof parsed.version === 'string' ? parsed.version : null;
}

function toPortablePath(value: string): string {
  return value.replace(/\\/g, '/');
}