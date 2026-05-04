import { promises as fs } from 'node:fs';
import path from 'node:path';

export type DendriteBenchmarkEventName =
  | 'session_started'
  | 'context_requested'
  | 'wiki_updated'
  | 'maintenance_state_changed'
  | 'session_snapshot';

export type DendriteBenchmarkEventTrigger =
  | 'server'
  | 'wiki_context'
  | 'wiki_write'
  | 'wiki_log'
  | 'wiki_write_proposals'
  | 'wiki_apply_proposal'
  | 'wiki_execute_maintenance_action';

export interface DendriteBenchmarkEvent {
  schemaVersion: 1;
  timestamp: string;
  event: DendriteBenchmarkEventName;
  trigger: DendriteBenchmarkEventTrigger;
  metrics?: Record<string, number>;
  detail?: Record<string, boolean | number | string>;
}

export interface DendriteBenchmarkEventSummary {
  schemaVersion: 1;
  generatedAt: string;
  eventCount: number;
  logPath: string;
  byType: Record<DendriteBenchmarkEventName, number>;
  usage: {
    sessionStartedCount: number;
    contextRequestCount: number;
    wikiUpdateCount: number;
    maintenanceStateChangeCount: number;
    sessionSnapshotCount: number;
  };
  orientation: {
    latestContextPageCount: number | null;
    latestContextOmittedPageCount: number | null;
    latestOpenQuestionCount: number | null;
  };
  maintenance: {
    acceptedProposalCount: number;
    latestLintFindingCount: number | null;
    latestProposalCount: number | null;
  };
  recentEvents: Array<Pick<DendriteBenchmarkEvent, 'timestamp' | 'event' | 'trigger'>>;
}

interface BenchmarkEventWriteOptions {
  root?: string;
}

interface DendriteBenchmarkEventInput {
  event: DendriteBenchmarkEventName;
  trigger: DendriteBenchmarkEventTrigger;
  metrics?: Record<string, number>;
  detail?: Record<string, boolean | number | string>;
}

const eventLogRelativePath = path.join('local-data', 'benchmark-events.jsonl');
const summaryRelativePath = path.join('docs', 'public', 'dendrite-benchmark-events-summary.json');

export async function appendBenchmarkEvent(
  input: DendriteBenchmarkEventInput,
  options: BenchmarkEventWriteOptions = {}
): Promise<DendriteBenchmarkEvent> {
  const event: DendriteBenchmarkEvent = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    event: input.event,
    trigger: input.trigger,
    metrics: input.metrics,
    detail: input.detail
  };

  if (isBenchmarkEventCaptureDisabled()) {
    return event;
  }

  const root = path.resolve(options.root ?? process.cwd());
  const eventLogPath = path.join(root, eventLogRelativePath);
  const summaryPath = path.join(root, summaryRelativePath);

  await fs.mkdir(path.dirname(eventLogPath), { recursive: true });
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.appendFile(eventLogPath, `${JSON.stringify(event)}\n`, 'utf8');

  const summary = await buildBenchmarkEventSummary(eventLogPath);
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  return event;
}

export async function captureBenchmarkEvent(
  input: DendriteBenchmarkEventInput,
  options: BenchmarkEventWriteOptions = {}
): Promise<void> {
  if (isBenchmarkEventCaptureDisabled()) {
    return;
  }

  try {
    await appendBenchmarkEvent(input, options);
  } catch {
    // Benchmark event capture is advisory and should not block MCP usage.
  }
}

async function buildBenchmarkEventSummary(eventLogPath: string): Promise<DendriteBenchmarkEventSummary> {
  const events = await readBenchmarkEvents(eventLogPath);
  const byType = createEmptyEventCounts();
  let latestContextPageCount: number | null = null;
  let latestContextOmittedPageCount: number | null = null;
  let latestOpenQuestionCount: number | null = null;
  let latestLintFindingCount: number | null = null;
  let latestProposalCount: number | null = null;
  let acceptedProposalCount = 0;

  for (const event of events) {
    byType[event.event] += 1;

    if (event.event === 'context_requested') {
      latestContextPageCount = event.metrics?.contextPageCount ?? latestContextPageCount;
      latestContextOmittedPageCount = event.metrics?.contextOmittedPageCount ?? latestContextOmittedPageCount;
      latestOpenQuestionCount = event.metrics?.openQuestionCount ?? latestOpenQuestionCount;
    }

    if (event.event === 'maintenance_state_changed') {
      latestLintFindingCount = event.metrics?.lintFindingCount ?? latestLintFindingCount;
      latestProposalCount = event.metrics?.proposalCount ?? latestProposalCount;
      if (event.detail?.acceptedProposal === true) {
        acceptedProposalCount += 1;
      }
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    eventCount: events.length,
    logPath: eventLogRelativePath.replace(/\\/g, '/'),
    byType,
    usage: {
      sessionStartedCount: byType.session_started,
      contextRequestCount: byType.context_requested,
      wikiUpdateCount: byType.wiki_updated,
      maintenanceStateChangeCount: byType.maintenance_state_changed,
      sessionSnapshotCount: byType.session_snapshot
    },
    orientation: {
      latestContextPageCount,
      latestContextOmittedPageCount,
      latestOpenQuestionCount
    },
    maintenance: {
      acceptedProposalCount,
      latestLintFindingCount,
      latestProposalCount
    },
    recentEvents: events.slice(-8).map(({ timestamp, event, trigger }) => ({ timestamp, event, trigger }))
  };
}

async function readBenchmarkEvents(eventLogPath: string): Promise<DendriteBenchmarkEvent[]> {
  const content = await fs.readFile(eventLogPath, 'utf8').catch(() => '');
  if (content.trim().length === 0) {
    return [];
  }

  return content
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as DendriteBenchmarkEvent];
      } catch {
        return [];
      }
    });
}

function createEmptyEventCounts(): Record<DendriteBenchmarkEventName, number> {
  return {
    session_started: 0,
    context_requested: 0,
    wiki_updated: 0,
    maintenance_state_changed: 0,
    session_snapshot: 0
  };
}

function isBenchmarkEventCaptureDisabled(): boolean {
  return process.env.DENDRITE_WIKI_DISABLE_BENCHMARK_EVENTS === '1';
}