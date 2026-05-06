import { promises as fs } from 'node:fs';
import path from 'node:path';

// Raw-observations stream is the auto-capture feeder for the Competitive Feature
// Roadmap (C1). It records compact, agent-emitted tool observations to a JSONL file
// kept strictly separate from the curated memory store so the auditable wiki layer
// never mixes with raw firehose data. Cluster-based promotion into curated memory
// is intentionally deferred to slice 2 of C1.

export type RawObservationKind =
  | 'edit'
  | 'read'
  | 'command'
  | 'search'
  | 'web'
  | 'other';

export type RawObservationOutcome = 'ok' | 'error' | 'unknown';

export interface RawObservation {
  ts: string;
  sessionId: string;
  tool: string;
  kind: RawObservationKind;
  target: string;
  outcome: RawObservationOutcome;
  summary: string;
}

export interface CaptureRawObservationInput {
  tool: string;
  target?: string;
  summary?: string;
  outcome?: RawObservationOutcome;
  sessionId?: string;
}

const dataDirRelativePath = process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data';
const observationsRelativePath = path.join(dataDirRelativePath, 'raw-observations.jsonl');
const defaultMaxLines = 5000;
const targetClipMax = 200;
const summaryClipMax = 200;
const sessionClipMax = 64;

export function resolveRawObservationsPath(root: string = process.cwd()): string {
  return path.resolve(root, observationsRelativePath);
}

// Default-on. Operator opts out via DENDRITE_RAW_OBSERVATIONS=off (or false/0/no/disable).
export function isRawObservationsCaptureEnabled(): boolean {
  const flag = (process.env.DENDRITE_RAW_OBSERVATIONS ?? '').trim().toLowerCase();
  if (flag === '') {
    return true;
  }
  return !['off', 'false', '0', 'no', 'disable', 'disabled'].includes(flag);
}

// Deterministic tool→kind mapping. Slice 1 keeps this minimal; slice 2 will add
// content-based decision-marker / error-response classification.
export function classifyObservationKind(tool: string): RawObservationKind {
  const normalized = tool.trim().toLowerCase();
  if (
    normalized === 'edit' ||
    normalized === 'write' ||
    normalized === 'multiedit' ||
    normalized === 'notebookedit'
  ) {
    return 'edit';
  }
  if (normalized === 'read' || normalized === 'notebookread') {
    return 'read';
  }
  if (normalized === 'bash' || normalized === 'powershell') {
    return 'command';
  }
  if (normalized === 'grep' || normalized === 'glob') {
    return 'search';
  }
  if (normalized === 'webfetch' || normalized === 'websearch') {
    return 'web';
  }
  return 'other';
}

export async function captureRawObservation(
  input: CaptureRawObservationInput,
  root: string = process.cwd()
): Promise<RawObservation | undefined> {
  if (!isRawObservationsCaptureEnabled()) {
    return undefined;
  }

  const tool = input.tool.trim();
  if (!tool) {
    return undefined;
  }

  const observation: RawObservation = {
    ts: new Date().toISOString(),
    sessionId: clipText(input.sessionId, sessionClipMax) || 'unknown',
    tool,
    kind: classifyObservationKind(tool),
    target: clipText(input.target, targetClipMax),
    outcome: input.outcome ?? 'unknown',
    summary: clipText(input.summary, summaryClipMax)
  };

  const filePath = resolveRawObservationsPath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(observation)}\n`, 'utf8');

  // Retention runs lazily after every write so the file stays bounded without a
  // background scheduler. A failure here must not lose the just-appended observation,
  // so we swallow errors instead of propagating them.
  await enforceRawObservationsRetention(root).catch(() => undefined);

  return observation;
}

export interface ReadRawObservationsOptions {
  root?: string;
  limit?: number;
}

export async function readRawObservations(
  options: ReadRawObservationsOptions = {}
): Promise<RawObservation[]> {
  const filePath = resolveRawObservationsPath(options.root);
  const content = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) {
    return [];
  }

  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const limit = options.limit !== undefined ? Math.max(1, Math.floor(options.limit)) : lines.length;
  const tail = lines.slice(-limit);

  const records: RawObservation[] = [];
  for (const line of tail) {
    const parsed = parseObservationLine(line);
    if (parsed) {
      records.push(parsed);
    }
  }
  return records;
}

export async function enforceRawObservationsRetention(
  root: string = process.cwd()
): Promise<{ removedLines: number; keptLines: number }> {
  const maxLines = readMaxLinesFromEnv();
  const filePath = resolveRawObservationsPath(root);
  const content = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) {
    return { removedLines: 0, keptLines: 0 };
  }

  const nonEmpty = content.split('\n').filter((line) => line.trim().length > 0);
  if (nonEmpty.length <= maxLines) {
    return { removedLines: 0, keptLines: nonEmpty.length };
  }

  const kept = nonEmpty.slice(-maxLines);
  await fs.writeFile(filePath, `${kept.join('\n')}\n`, 'utf8');
  return { removedLines: nonEmpty.length - kept.length, keptLines: kept.length };
}

function readMaxLinesFromEnv(): number {
  const raw = (process.env.DENDRITE_RAW_OBSERVATIONS_MAX_LINES ?? '').trim();
  if (!raw) {
    return defaultMaxLines;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultMaxLines;
  }
  return parsed;
}

function clipText(value: string | undefined, max: number): string {
  if (!value) {
    return '';
  }
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) {
    return flat;
  }
  return `${flat.slice(0, Math.max(1, max - 1))}…`;
}

function parseObservationLine(line: string): RawObservation | undefined {
  try {
    const parsed = JSON.parse(line) as Partial<RawObservation>;
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }
    if (
      typeof parsed.ts !== 'string' ||
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.tool !== 'string' ||
      typeof parsed.kind !== 'string' ||
      typeof parsed.target !== 'string' ||
      typeof parsed.outcome !== 'string' ||
      typeof parsed.summary !== 'string'
    ) {
      return undefined;
    }
    return parsed as RawObservation;
  } catch {
    return undefined;
  }
}
