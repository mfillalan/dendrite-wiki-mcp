import { autoPromoteMemories, isAutoPromoteEnabled } from '@rarusoft/dendrite-memory';
import { refreshGeneratedWikiDocs } from '@rarusoft/dendrite-wiki';

// Trust-gated auto-promotion runs BEFORE the docs refresh so the regenerated artifacts
// (maintenance-inbox.json, search index, etc.) reflect the post-promotion state. The
// gate is opt-in via DENDRITE_AUTO_PROMOTE=on so projects that don't want auto-writes
// see the existing manual-review behavior unchanged.
//
// Important: this only fires from explicit `npm run wiki:refresh` (or the equivalent
// CLI), NOT from per-action refreshes that the maintenance-runner triggers after every
// operator click. That keeps the auto-promotion cadence operator-controlled.
if (isAutoPromoteEnabled()) {
  const sweep = await autoPromoteMemories();
  if (sweep.applied.length > 0) {
    console.log(`Auto-promoted ${sweep.applied.length} memor${sweep.applied.length === 1 ? 'y' : 'ies'} via DENDRITE_AUTO_PROMOTE.`);
    for (const r of sweep.applied) {
      console.log(`  → ${r.targetPage.slug}: ${r.memoryIds.join(', ')}`);
    }
  } else if (sweep.candidates.length > 0) {
    console.log(`Auto-promote found ${sweep.candidates.length} candidate(s) but applied none (likely already promoted in a prior pass).`);
  }
}

const result = await refreshGeneratedWikiDocs();
console.log(`Refreshed wiki catalog with ${result.pageCount} pages.`);
