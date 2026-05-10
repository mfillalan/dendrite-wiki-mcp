/**
 * Memory auto-clean runner — applies a batch of LLM-produced verdicts against the
 * project-local memory store and records the run so it can be audited and reverted.
 *
 * The MCP server itself stays LLM-free. A calling agent (the local Ollama bridge
 * behind the Review Board's "Auto-clean" button, or any other LLM caller) produces
 * the verdicts and posts them as a single batch. This module is the apply-and-audit
 * layer between that LLM output and the durable memory store.
 *
 * Verb set, current scope:
 *   - `archive`         — flip memory.status active → archived (revertible).
 *   - `keep-and-watch`  — no-op verdict; recorded so the audit reflects what the
 *                         LLM saw and chose to leave alone.
 *
 * Promote/merge/add-source/rephrase verbs are deliberately out of scope here —
 * each has its own validation path (memory_promote / memory_promote_skill /
 * memory_remember) and shouldn't be folded into a bulk-apply batch until we have
 * per-verb safety nets matching what those tools already enforce.
 *
 * Run records live in `local-data/auto-clean-runs.json` as an append-only log
 * keyed by `runId`. `revertAutoCleanRun(runId)` walks the recorded decisions and
 * undoes them (currently: restore any archived memories via restoreProjectMemory).
 * Keep-and-watch verdicts don't need reverting.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { forgetProjectMemory, restoreProjectMemory } from './memory-store.js';

export type AutoCleanVerb = 'archive' | 'keep-and-watch';

export interface AutoCleanDecision {
  memoryId: string;
  verb: AutoCleanVerb;
  reason: string;
  confidence?: number;
}

export type AutoCleanOutcome = 'applied' | 'noop' | 'skipped';
export type AutoCleanSkipReason = 'memory-not-found' | 'already-archived';

export interface AutoCleanDecisionResult {
  memoryId: string;
  verb: AutoCleanVerb;
  reason: string;
  confidence?: number;
  outcome: AutoCleanOutcome;
  skipReason?: AutoCleanSkipReason;
}

export interface AutoCleanRun {
  runId: string;
  createdAt: string;
  decisions: AutoCleanDecisionResult[];
  summary: {
    archived: number;
    kept: number;
    skipped: number;
  };
  reverted?: {
    revertedAt: string;
    restored: number;
    skipped: number;
  };
}

export interface RevertAutoCleanRunResult {
  runId: string;
  reverted: boolean;
  restoredMemoryIds: string[];
  skippedMemoryIds: string[];
  refusalReason?: 'run-not-found' | 'already-reverted';
}

interface AutoCleanRunStoreFile {
  schemaVersion: 1;
  runs: AutoCleanRun[];
}

const dataDirRelativePath = process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data';
const runStoreRelativePath = path.join(dataDirRelativePath, 'auto-clean-runs.json');

export function resolveAutoCleanRunStorePath(root: string = process.cwd()): string {
  return path.resolve(root, runStoreRelativePath);
}

export async function applyAutoCleanDecisions(
  decisions: AutoCleanDecision[],
  root: string = process.cwd()
): Promise<AutoCleanRun> {
  const results: AutoCleanDecisionResult[] = [];
  let archived = 0;
  let kept = 0;
  let skipped = 0;

  for (const decision of decisions) {
    if (decision.verb === 'keep-and-watch') {
      results.push({ ...decision, outcome: 'noop' });
      kept += 1;
      continue;
    }

    // verb === 'archive'
    const forgetResult = await forgetProjectMemory(decision.memoryId, 'archive', root);
    if (!forgetResult.removed) {
      results.push({ ...decision, outcome: 'skipped', skipReason: 'memory-not-found' });
      skipped += 1;
      continue;
    }
    results.push({ ...decision, outcome: 'applied' });
    archived += 1;
  }

  const run: AutoCleanRun = {
    runId: `run_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    decisions: results,
    summary: { archived, kept, skipped }
  };

  const store = await readAutoCleanRunStore(root);
  store.runs.push(run);
  await writeAutoCleanRunStore(root, store);
  return run;
}

export async function revertAutoCleanRun(
  runId: string,
  root: string = process.cwd()
): Promise<RevertAutoCleanRunResult> {
  const store = await readAutoCleanRunStore(root);
  const run = store.runs.find((candidate) => candidate.runId === runId);
  if (!run) {
    return { runId, reverted: false, restoredMemoryIds: [], skippedMemoryIds: [], refusalReason: 'run-not-found' };
  }
  if (run.reverted) {
    return { runId, reverted: false, restoredMemoryIds: [], skippedMemoryIds: [], refusalReason: 'already-reverted' };
  }

  const restoredMemoryIds: string[] = [];
  const skippedMemoryIds: string[] = [];

  for (const decision of run.decisions) {
    if (decision.outcome !== 'applied' || decision.verb !== 'archive') {
      // Only archive-applied decisions need a revert. Keep-and-watch verdicts and any
      // skipped decisions are inert.
      continue;
    }
    const restoreResult = await restoreProjectMemory(decision.memoryId, root);
    if (restoreResult.restored) {
      restoredMemoryIds.push(decision.memoryId);
    } else {
      skippedMemoryIds.push(decision.memoryId);
    }
  }

  run.reverted = {
    revertedAt: new Date().toISOString(),
    restored: restoredMemoryIds.length,
    skipped: skippedMemoryIds.length
  };
  await writeAutoCleanRunStore(root, store);
  return { runId, reverted: true, restoredMemoryIds, skippedMemoryIds };
}

export async function listAutoCleanRuns(root: string = process.cwd()): Promise<AutoCleanRun[]> {
  const store = await readAutoCleanRunStore(root);
  return [...store.runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function readAutoCleanRunStore(root: string): Promise<AutoCleanRunStoreFile> {
  const filePath = resolveAutoCleanRunStorePath(root);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AutoCleanRunStoreFile>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.runs)) {
      return { schemaVersion: 1, runs: [] };
    }
    return { schemaVersion: 1, runs: parsed.runs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { schemaVersion: 1, runs: [] };
    }
    throw error;
  }
}

async function writeAutoCleanRunStore(root: string, store: AutoCleanRunStoreFile): Promise<void> {
  const filePath = resolveAutoCleanRunStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}
