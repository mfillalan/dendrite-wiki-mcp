// Page-drift snooze store — lets the operator suppress a `page-drift` lint finding for
// a configurable window without modifying the underlying page. Why this exists: the
// drift detector can fire for legitimate reasons (page genuinely outgrew its purpose)
// OR for noise (a single busy session put unrelated tokens in the project log). The
// operator is the right judge of which is which; the snooze gives them a one-click
// "yes I see this, it's noise, hide it for a month" without forcing a fake edit to
// the page just to clear the finding.
//
// Storage: a simple JSON file at local-data/page-drift-snoozes.json. Each entry maps
// a page slug to an ISO timestamp the snooze expires at. Expired entries are pruned
// on every read so the file doesn't grow indefinitely.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const SNOOZES_FILE_RELATIVE = 'local-data/page-drift-snoozes.json';
const DEFAULT_SNOOZE_DAYS = 30;

export interface PageDriftSnooze {
  slug: string;
  snoozedUntil: string;
  snoozedAt: string;
  reason: string;
}

interface PageDriftSnoozesFile {
  schemaVersion: 1;
  snoozes: PageDriftSnooze[];
}

export function resolvePageDriftSnoozesPath(root: string = process.cwd()): string {
  return path.resolve(root, SNOOZES_FILE_RELATIVE);
}

export async function loadActivePageDriftSnoozes(
  root: string = process.cwd(),
  now: Date = new Date()
): Promise<Map<string, PageDriftSnooze>> {
  const store = await readSnoozesFile(root);
  const cutoffMs = now.getTime();
  const active = new Map<string, PageDriftSnooze>();
  for (const snooze of store.snoozes) {
    const expiresMs = Date.parse(snooze.snoozedUntil);
    if (Number.isFinite(expiresMs) && expiresMs > cutoffMs) {
      active.set(snooze.slug, snooze);
    }
  }
  return active;
}

export async function isPageDriftSnoozed(
  slug: string,
  root: string = process.cwd(),
  now: Date = new Date()
): Promise<boolean> {
  const active = await loadActivePageDriftSnoozes(root, now);
  return active.has(slug);
}

export interface SnoozePageDriftOptions {
  days?: number;
  reason?: string;
  now?: Date;
}

export async function snoozePageDrift(
  slug: string,
  options: SnoozePageDriftOptions = {},
  root: string = process.cwd()
): Promise<PageDriftSnooze> {
  const trimmed = slug.trim();
  if (!trimmed) {
    throw new Error('snoozePageDrift requires a non-empty slug.');
  }
  const days = Math.max(1, Math.floor(options.days ?? DEFAULT_SNOOZE_DAYS));
  const now = options.now ?? new Date();
  const snoozedUntil = new Date(now.getTime() + days * 86_400_000).toISOString();
  const snooze: PageDriftSnooze = {
    slug: trimmed,
    snoozedUntil,
    snoozedAt: now.toISOString(),
    reason: (options.reason ?? '').trim().slice(0, 200)
  };

  const store = await readSnoozesFile(root);
  // Prune expired entries on every write so the file stays small.
  const pruned = pruneExpired(store.snoozes, now);
  const next = pruned.filter((existing) => existing.slug !== trimmed);
  next.push(snooze);
  await writeSnoozesFile(root, { schemaVersion: 1, snoozes: next });
  return snooze;
}

export async function clearPageDriftSnooze(
  slug: string,
  root: string = process.cwd()
): Promise<boolean> {
  const trimmed = slug.trim();
  if (!trimmed) return false;
  const store = await readSnoozesFile(root);
  const before = store.snoozes.length;
  const next = store.snoozes.filter((entry) => entry.slug !== trimmed);
  if (next.length === before) {
    return false;
  }
  await writeSnoozesFile(root, { schemaVersion: 1, snoozes: next });
  return true;
}

function pruneExpired(snoozes: PageDriftSnooze[], now: Date): PageDriftSnooze[] {
  const cutoffMs = now.getTime();
  return snoozes.filter((entry) => {
    const expires = Date.parse(entry.snoozedUntil);
    return Number.isFinite(expires) && expires > cutoffMs;
  });
}

async function readSnoozesFile(root: string): Promise<PageDriftSnoozesFile> {
  const filePath = resolvePageDriftSnoozesPath(root);
  const content = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) {
    return { schemaVersion: 1, snoozes: [] };
  }
  try {
    const parsed = JSON.parse(content) as Partial<PageDriftSnoozesFile>;
    const snoozes = Array.isArray(parsed.snoozes)
      ? parsed.snoozes.flatMap(normalizeStoredSnooze)
      : [];
    return { schemaVersion: 1, snoozes };
  } catch {
    return { schemaVersion: 1, snoozes: [] };
  }
}

async function writeSnoozesFile(root: string, store: PageDriftSnoozesFile): Promise<void> {
  const filePath = resolvePageDriftSnoozesPath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const next: PageDriftSnoozesFile = {
    schemaVersion: 1,
    snoozes: [...store.snoozes].sort((left, right) => left.slug.localeCompare(right.slug))
  };
  await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function normalizeStoredSnooze(record: Partial<PageDriftSnooze>): PageDriftSnooze[] {
  if (typeof record.slug !== 'string' || !record.slug.trim()) return [];
  if (typeof record.snoozedUntil !== 'string' || !record.snoozedUntil.trim()) return [];
  return [
    {
      slug: record.slug.trim(),
      snoozedUntil: record.snoozedUntil,
      snoozedAt: typeof record.snoozedAt === 'string' ? record.snoozedAt : new Date().toISOString(),
      reason: typeof record.reason === 'string' ? record.reason : ''
    }
  ];
}
