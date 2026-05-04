import { promises as fs } from 'node:fs';
import path from 'node:path';
import { listProjectMemories, recallProjectMemories, type ProjectMemoryRecord } from './memory-store.js';

export interface RecallBenchmarkProbe {
  id: string;
  query: string;
  expectedMemoryIds: string[];
  expectedTags: string[];
  expectedRelatedFiles: string[];
  expectedRelatedPages: string[];
  relatedFiles?: string[];
  relatedPages?: string[];
}

export interface RecallBenchmarkProbeResult {
  id: string;
  query: string;
  expectedMemoryIds: string[];
  expectedTags: string[];
  expectedRelatedFiles: string[];
  expectedRelatedPages: string[];
  matchedMemoryIds: string[];
  matchReason: 'memory-id' | 'tags' | 'related-files' | 'related-pages' | null;
  rankOfFirstMatch: number | null;
  hitAtTop1: boolean;
  hitAtTop5: boolean;
  reciprocalRank: number;
  reasonsForFirstMatch: string[];
}

export interface RecallBenchmarkResult {
  probesSource: 'auto-derived' | 'local-file';
  probesPath: string | null;
  probeCount: number;
  evaluatedProbeCount: number;
  top1HitCount: number;
  top5HitCount: number;
  missCount: number;
  meanReciprocalRank: number;
  averageReasonCount: number;
  probes: RecallBenchmarkProbeResult[];
}

interface RecallProbeFile {
  schemaVersion?: number;
  probes?: unknown[];
}

const probeRelativePath = path.join(process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data', 'recall-probes.json');
const recallProbeMaxItems = 5;
const minProbeQueryWordCount = 3;

export function resolveRecallProbeStorePath(root: string = process.cwd()): string {
  return path.resolve(root, probeRelativePath);
}

export async function loadOrDeriveRecallProbes(root: string = process.cwd()): Promise<{
  source: RecallBenchmarkResult['probesSource'];
  path: string | null;
  probes: RecallBenchmarkProbe[];
}> {
  const probePath = resolveRecallProbeStorePath(root);
  const fileContent = await fs.readFile(probePath, 'utf8').catch(() => undefined);

  if (fileContent) {
    const parsed = parseRecallProbeFile(fileContent);
    if (parsed.length > 0) {
      return {
        source: 'local-file',
        path: probePath,
        probes: parsed
      };
    }
  }

  const derived = await deriveRecallProbesFromMemories(root);
  return {
    source: 'auto-derived',
    path: null,
    probes: derived
  };
}

export async function runRecallBenchmark(root: string = process.cwd()): Promise<RecallBenchmarkResult> {
  const { source, path: probesPath, probes } = await loadOrDeriveRecallProbes(root);
  const probeResults: RecallBenchmarkProbeResult[] = [];
  let top1HitCount = 0;
  let top5HitCount = 0;
  let missCount = 0;
  let reciprocalRankTotal = 0;
  let evaluatedProbeCount = 0;
  let reasonCountTotal = 0;
  let reasonCountSamples = 0;

  for (const probe of probes) {
    if (!probeHasMatcher(probe) || probe.query.trim().length === 0) {
      continue;
    }
    evaluatedProbeCount += 1;
    const recalled = await recallProjectMemories(
      probe.query,
      {
        relatedFiles: probe.relatedFiles ?? [],
        relatedPages: probe.relatedPages ?? [],
        maxItems: recallProbeMaxItems
      },
      root
    );

    const matchedMemoryIds: string[] = [];
    let firstMatchIndex = -1;
    let matchReason: RecallBenchmarkProbeResult['matchReason'] = null;
    for (let index = 0; index < recalled.length; index += 1) {
      const candidate = recalled[index];
      if (!candidate) {
        continue;
      }
      const reason = matchProbeAgainstMemory(probe, candidate);
      if (reason) {
        matchedMemoryIds.push(candidate.id);
        if (firstMatchIndex === -1) {
          firstMatchIndex = index;
          matchReason = reason;
        }
      }
    }

    const rankOfFirstMatch = firstMatchIndex === -1 ? null : firstMatchIndex + 1;
    const hitAtTop1 = rankOfFirstMatch === 1;
    const hitAtTop5 = rankOfFirstMatch !== null && rankOfFirstMatch <= 5;
    const reciprocalRank = rankOfFirstMatch === null ? 0 : 1 / rankOfFirstMatch;
    const reasonsForFirstMatch = firstMatchIndex === -1 ? [] : recalled[firstMatchIndex]?.reasons ?? [];

    if (hitAtTop1) {
      top1HitCount += 1;
    }
    if (hitAtTop5) {
      top5HitCount += 1;
    }
    if (rankOfFirstMatch === null) {
      missCount += 1;
    } else {
      reasonCountTotal += reasonsForFirstMatch.length;
      reasonCountSamples += 1;
    }
    reciprocalRankTotal += reciprocalRank;

    probeResults.push({
      id: probe.id,
      query: probe.query,
      expectedMemoryIds: probe.expectedMemoryIds,
      expectedTags: probe.expectedTags,
      expectedRelatedFiles: probe.expectedRelatedFiles,
      expectedRelatedPages: probe.expectedRelatedPages,
      matchedMemoryIds,
      matchReason,
      rankOfFirstMatch,
      hitAtTop1,
      hitAtTop5,
      reciprocalRank,
      reasonsForFirstMatch
    });
  }

  return {
    probesSource: source,
    probesPath: probesPath ? toPortablePath(path.relative(root, probesPath)) : null,
    probeCount: probes.length,
    evaluatedProbeCount,
    top1HitCount,
    top5HitCount,
    missCount,
    meanReciprocalRank: evaluatedProbeCount === 0 ? 0 : reciprocalRankTotal / evaluatedProbeCount,
    averageReasonCount: reasonCountSamples === 0 ? 0 : reasonCountTotal / reasonCountSamples,
    probes: probeResults
  };
}

function parseRecallProbeFile(content: string): RecallBenchmarkProbe[] {
  let parsed: RecallProbeFile;
  try {
    parsed = JSON.parse(content) as RecallProbeFile;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.probes)) {
    return [];
  }

  return parsed.probes.flatMap((entry) => normalizeRecallProbeEntry(entry));
}

function normalizeRecallProbeEntry(entry: unknown): RecallBenchmarkProbe[] {
  if (!entry || typeof entry !== 'object') {
    return [];
  }

  const candidate = entry as Partial<RecallBenchmarkProbe>;
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : '';
  const query = typeof candidate.query === 'string' ? candidate.query.trim() : '';
  const expectedMemoryIds = readStringArray(candidate.expectedMemoryIds);
  const expectedTags = readStringArray(candidate.expectedTags);
  const expectedRelatedFiles = readStringArray(candidate.expectedRelatedFiles);
  const expectedRelatedPages = readStringArray(candidate.expectedRelatedPages);
  const hasMatcher =
    expectedMemoryIds.length > 0 ||
    expectedTags.length > 0 ||
    expectedRelatedFiles.length > 0 ||
    expectedRelatedPages.length > 0;

  if (!id || !query || !hasMatcher) {
    return [];
  }

  return [
    {
      id,
      query,
      expectedMemoryIds,
      expectedTags,
      expectedRelatedFiles,
      expectedRelatedPages,
      relatedFiles: Array.isArray(candidate.relatedFiles) ? readStringArray(candidate.relatedFiles) : undefined,
      relatedPages: Array.isArray(candidate.relatedPages) ? readStringArray(candidate.relatedPages) : undefined
    }
  ];
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

async function deriveRecallProbesFromMemories(root: string): Promise<RecallBenchmarkProbe[]> {
  const records = await listProjectMemories({ root, includeArchived: false });
  return records
    .filter((record) => record.kind !== 'handoff' && record.status === 'active')
    .flatMap((record) => buildAutoProbeForRecord(record));
}

function buildAutoProbeForRecord(record: ProjectMemoryRecord): RecallBenchmarkProbe[] {
  const query = buildAutoProbeQuery(record);
  if (query.split(/\s+/).filter(Boolean).length < minProbeQueryWordCount) {
    return [];
  }

  return [
    {
      id: `auto:${record.id}`,
      query,
      expectedMemoryIds: [record.id],
      expectedTags: record.tags,
      expectedRelatedFiles: record.relatedFiles,
      expectedRelatedPages: record.relatedPages,
      relatedFiles: record.relatedFiles.length > 0 ? record.relatedFiles : undefined,
      relatedPages: record.relatedPages.length > 0 ? record.relatedPages : undefined
    }
  ];
}

function buildAutoProbeQuery(record: ProjectMemoryRecord): string {
  const summary = record.summary.replace(/^Handoff summary:\s*/i, '').replace(/\s+/g, ' ').trim();
  if (summary.length >= 8) {
    return summary;
  }
  return record.text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function toPortablePath(value: string): string {
  return value.replace(/\\/g, '/');
}

export interface RecallProbeBootstrapOptions {
  root?: string;
  force?: boolean;
  outputPath?: string;
}

export interface RecallProbeBootstrapResult {
  outputPath: string;
  written: boolean;
  reason: 'created' | 'overwritten' | 'skipped-exists';
  probeCount: number;
  source: 'memory-store' | 'template';
  fileContent: string;
}

export async function bootstrapRecallProbeFile(
  options: RecallProbeBootstrapOptions = {}
): Promise<RecallProbeBootstrapResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const outputPath = options.outputPath ? path.resolve(root, options.outputPath) : resolveRecallProbeStorePath(root);
  const built = await buildBootstrapProbeFileContent(root);
  const existing = await fs.readFile(outputPath, 'utf8').catch(() => undefined);

  if (existing !== undefined && options.force !== true) {
    return {
      outputPath,
      written: false,
      reason: 'skipped-exists',
      probeCount: built.probeCount,
      source: built.source,
      fileContent: built.fileContent
    };
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, built.fileContent, 'utf8');

  return {
    outputPath,
    written: true,
    reason: existing === undefined ? 'created' : 'overwritten',
    probeCount: built.probeCount,
    source: built.source,
    fileContent: built.fileContent
  };
}

async function buildBootstrapProbeFileContent(root: string): Promise<{
  fileContent: string;
  probeCount: number;
  source: RecallProbeBootstrapResult['source'];
}> {
  const records = await listProjectMemories({ root, includeArchived: false });
  const probeRecords = records.filter((record) => record.kind !== 'handoff' && record.status === 'active');
  const probesFromMemories = probeRecords
    .flatMap((record) => buildBootstrapProbeForRecord(record))
    .map((probe) => stripEmptyProbeFields(probe));

  const usingMemories = probesFromMemories.length > 0;
  const probes = usingMemories ? probesFromMemories : buildBootstrapTemplateProbes();

  const payload = {
    schemaVersion: 1,
    probes
  };
  return {
    fileContent: `${JSON.stringify(payload, null, 2)}\n`,
    probeCount: probes.length,
    source: usingMemories ? 'memory-store' : 'template'
  };
}

function buildBootstrapProbeForRecord(record: ProjectMemoryRecord): RecallBenchmarkProbe[] {
  const query = buildAutoProbeQuery(record);
  if (query.split(/\s+/).filter(Boolean).length < minProbeQueryWordCount) {
    return [];
  }

  return [
    {
      id: `bootstrap:${record.id}`,
      query,
      expectedMemoryIds: [],
      expectedTags: record.tags,
      expectedRelatedFiles: record.relatedFiles,
      expectedRelatedPages: record.relatedPages,
      relatedFiles: record.relatedFiles.length > 0 ? record.relatedFiles : undefined,
      relatedPages: record.relatedPages.length > 0 ? record.relatedPages : undefined
    }
  ];
}

function stripEmptyProbeFields(probe: RecallBenchmarkProbe): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: probe.id,
    query: probe.query
  };
  if (probe.expectedMemoryIds.length > 0) {
    result.expectedMemoryIds = probe.expectedMemoryIds;
  }
  if (probe.expectedTags.length > 0) {
    result.expectedTags = probe.expectedTags;
  }
  if (probe.expectedRelatedFiles.length > 0) {
    result.expectedRelatedFiles = probe.expectedRelatedFiles;
  }
  if (probe.expectedRelatedPages.length > 0) {
    result.expectedRelatedPages = probe.expectedRelatedPages;
  }
  if (probe.relatedFiles && probe.relatedFiles.length > 0) {
    result.relatedFiles = probe.relatedFiles;
  }
  if (probe.relatedPages && probe.relatedPages.length > 0) {
    result.relatedPages = probe.relatedPages;
  }
  return result;
}

function buildBootstrapTemplateProbes(): Array<Record<string, unknown>> {
  return [
    {
      id: 'example-tag-matcher',
      query: 'replace this query with the recurring orientation question this probe should answer',
      expectedTags: ['replace-with-stable-tag'],
      relatedFiles: ['replace/with/relevant/path.ts']
    },
    {
      id: 'example-file-matcher',
      query: 'where does behavior X live in the repo',
      expectedRelatedFiles: ['src/replace-with-real-path.ts']
    },
    {
      id: 'example-page-matcher',
      query: 'how should the operator approach Y',
      expectedRelatedPages: ['replace-with-wiki-slug']
    }
  ];
}

function probeHasMatcher(probe: RecallBenchmarkProbe): boolean {
  return (
    probe.expectedMemoryIds.length > 0 ||
    probe.expectedTags.length > 0 ||
    probe.expectedRelatedFiles.length > 0 ||
    probe.expectedRelatedPages.length > 0
  );
}

function matchProbeAgainstMemory(
  probe: RecallBenchmarkProbe,
  memory: ProjectMemoryRecord
): RecallBenchmarkProbeResult['matchReason'] {
  if (probe.expectedMemoryIds.includes(memory.id)) {
    return 'memory-id';
  }
  if (probe.expectedTags.length > 0 && includesAll(memory.tags, probe.expectedTags)) {
    return 'tags';
  }
  if (probe.expectedRelatedFiles.length > 0 && includesAll(memory.relatedFiles, probe.expectedRelatedFiles)) {
    return 'related-files';
  }
  if (probe.expectedRelatedPages.length > 0 && includesAll(memory.relatedPages, probe.expectedRelatedPages)) {
    return 'related-pages';
  }
  return null;
}

function includesAll(actual: string[], expected: string[]): boolean {
  if (expected.length === 0) {
    return false;
  }
  const actualSet = new Set(actual.map((value) => value.toLowerCase()));
  return expected.every((value) => actualSet.has(value.toLowerCase()));
}
