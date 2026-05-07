# Maintenance Review

<div class="review-board-cta-block">
  <p class="review-board-cta-eyebrow">Operator command station</p>
  <p class="review-board-cta-title">Open the Review Board to actually run actions.</p>
  <p class="review-board-cta-detail">
    This page is documentation. The dashboard where you click through lint resolves, promote
    memories, snooze noise, rewrite drifted summaries, and process observation clusters lives
    on its own dedicated route — full viewport, no wiki preamble.
  </p>
  <p>
    <a class="review-board-cta-button" href="/review-board">→ Open Review Board</a>
  </p>
</div>

This page is the documentation consumer of the maintenance inbox snapshot — the *what* and *why* of every surface on the dashboard. The actual interactive board lives at [/review-board](/review-board).

It reads the generated inbox JSON and renders grouped proposal, lint, and memory review cards with the stable action metadata that a richer client would use.

When you want to execute one of those actions locally from this repository, use `npm run wiki:action -- "<action-id>"`. That command refreshes the generated docs and writes the latest action result to `docs/public/maintenance-action-result.json`, and the board rechecks those artifacts automatically every few seconds or immediately through the in-page refresh button.

For the click-to-run experience, start the docs site with `npm run docs:dev`. The review bridge is now embedded inside the VitePress dev server as a same-origin route (`/__review-bridge/health`, `/__review-bridge/execute`, `/__review-bridge/preview-promotion`), so the board picks it up automatically with no token to paste and no extra terminal. Run-now buttons work on the first click; apply actions still ask for confirmation before files are rewritten. If you prefer the standalone bridge (separate process, token-gated, useful when the docs site is not running), `npm run review-bridge` still works and the board falls back to it when the embedded one is not present. The full contract for both deployments lives on [Review Bridge](./review-bridge.md).

<style>
.review-board-cta-block {
  display: grid;
  gap: 0.5rem;
  padding: 1.25rem 1.5rem;
  margin: 0 0 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  border-left: 4px solid var(--vp-c-brand-1, #4a6cf7);
}
.review-board-cta-eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}
.review-board-cta-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.review-board-cta-detail {
  margin: 0;
  color: var(--vp-c-text-2);
  max-width: 60rem;
}
.review-board-cta-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.1rem;
  border-radius: 10px;
  background: var(--vp-c-brand-1, #4a6cf7);
  color: var(--vp-c-bg, white);
  font-weight: 600;
  text-decoration: none !important;
  transition: filter 160ms ease;
}
.review-board-cta-button:hover {
  filter: brightness(1.08);
}
</style>

## One Decision Surface Per Item

The board is a triage list. Each row is a single clickable button — eyebrow (source kind), title, subtitle, caret. No inline action buttons, no expanded-card details. Click a row and a modal opens with everything needed to decide:

1. **Header** — source eyebrow + item title + close.
2. **Why this is here** — rationale paragraph (the memory's surfaced reason, the lint rule, the proposal rationale).
3. **Preview body** — only when the item's primary action is irreversible:
   - Memory → wiki page promotion: target wiki page + section heading + unified whole-file diff. If the proposed text already exists, a "No file changes needed" banner replaces the diff and the apply button becomes "Mark superseded".
   - Wiki proposal (route-guidance / merge-guidance): one unified diff per affected file. Files that already match are flagged rather than rendered as no-op diffs.
   - Memory → skill promotion: two-card record comparison — source memory on the left, prospective new skill record (with the inferred scope grid) on the right, plus a plain-language "What apply will do" effects list.
4. **Context body** — for items without a preview (archive, snooze, run-diagnostic): full memory text + sources + related files/pages, OR lint path/message/rule, OR proposal summary/affected-paths/undo-path.
5. **Actions panel** — every available action as a labeled button with a one-line "what this does" description. The preview-apply action sits at the top in primary blue; everything else (Archive, Draft, Snooze, Read wiki page, etc.) renders below as ghost buttons. Greyed-out actions show their unavailability reason on hover.
6. **Footer** — Close.

The previews are read-only — they call `previewProjectMemoryPromotion()`, `previewWikiProposal()`, or `previewMemoryPromoteToSkill()`, none of which write to disk or mutate the memory store. When the operator clicks Apply or any other action, the modal closes the moment the bridge POST returns 200; the row underneath shows the per-item completion overlay in place; the inbox refresh removes the row via the TransitionGroup leave animation; the next item slides up. The operator stays anchored at the same scroll position throughout — no full-page resets, no jumping back to the top.

The standalone `/wiki/maintenance-inbox` page used to be an auto-generated text dump of every active finding; it has been collapsed to a thin redirect stub that points at the Review Board. The structured `docs/public/maintenance-inbox.json` snapshot remains the authoritative data source.

## Lint Resolve Actions

Lint findings used to surface only **Read wiki page** + **Re-run lint** — both diagnostic, neither closing the finding. Every page-drift, missing-h1, or dormant-skill row meant leaving the board to edit a file by hand. The board now ships rule-specific resolve actions so most findings can be closed with a single click:

| Rule | Primary resolve action | What it does |
|---|---|---|
| `page-drift` | **Snooze 30 days** | Adds an entry to `local-data/page-drift-snoozes.json`; the lint pass skips the page until the snooze expires. No file edits. Use when the drift signal is session noise (one busy day's burst of off-topic project-log entries) rather than real divergence. |
| `page-drift` (real drift) | **Rewrite first paragraph** (inline editor in expanded details) | Pre-populates a textarea, save overwrites the page's first paragraph on disk via the bridge with confirmation. Use when the page genuinely outgrew its summary. |
| `missing-h1` | **Insert H1 from slug** | Idempotent: parses the slug into title-case, inserts `# Title` after the frontmatter, writes the page. |
| `dormant-skill` | **Archive skill file** | Moves the file into a sibling `archive/` directory. Bridge confirmation gates this because a real file move on disk is harder to undo than a wiki page edit. |
| every rule | **Read wiki page**, **Re-run lint** | Diagnostic fallbacks remain for findings that need editorial judgment (`stale-claim`, `unsupported-claim`, `conflicting-guidance`). |

The deliberate omission: there is **no auto-fix for `stale-claim` / `unsupported-claim`**. Those findings need editorial review by definition — a one-click "mark reviewed" that bumps the date without re-reading the claim would let stale documentation calcify under a refreshed timestamp. For those rules the board keeps the diagnostic-only behavior so the operator has to actually visit the page.

Behind the scenes: lint findings carry a `synapticTag` aggregate (`src/wiki/raw-observations.ts` + `src/wiki/session-outcome.ts`) inherited from the contributing observation clusters' session outcomes; pages that the project log only mentions in a single concentrated burst (one day's worth of unrelated activity) automatically suppress drift findings via the `src/wiki/page-drift.ts` `MIN_DISTINCT_DAYS_FOR_DRIFT_CHECK` gate.

## Trust-Gated Auto-Promotion

Some memories don't need operator review at all — they've earned their way into the wiki through usage. Set `DENDRITE_AUTO_PROMOTE=on` and the `npm run wiki:refresh` command will sweep the project-local memory store for high-trust candidates and apply their promotions automatically, before regenerating derived docs.

The gate is intentionally strict so anything uncertain falls back to the operator-review path:

- Memory status is `active` (not archived/superseded)
- Memory kind is `lesson`, `fact`, or `warning` (skills go through `memory_promote_skill` instead)
- `recallCount >= 20` (configurable via `src/wiki/auto-promote.ts` `AutoPromoteCriteria`)
- At least one source has typed provenance — `file:`, `command:`, `decision:`, or `wiki:`. Observation/raw-stream sources don't count.
- The first `relatedPages` entry resolves to an existing wiki page on disk
- No `contradiction`-kind review finding references the memory

Auto-promotions still write to git-tracked files (the target wiki page, the project-log entry, and the memory record's status flips to `superseded`). `git diff` is the review surface — the operator inspects the auto-applied changes the same way they'd inspect any other commit, just without having to click apply individually.

Three usage modes:

```bash
# Diagnostic — anytime, no env var needed, no writes
npx dendrite-wiki memory:auto-promote --dry-run

# One-shot — requires DENDRITE_AUTO_PROMOTE=on
DENDRITE_AUTO_PROMOTE=on npx dendrite-wiki memory:auto-promote

# Set-and-forget — sweep runs before each wiki refresh
DENDRITE_AUTO_PROMOTE=on npm run wiki:refresh
```

The sweep **never fires** from the per-action refresh that the maintenance-runner triggers on every operator click — that path runs too often and would create a feedback loop. Auto-promotion cadence stays operator-controlled: explicit CLI invocations and explicit `npm run wiki:refresh` only.

Per-sweep cap of 10 promotions prevents runaway churn if a project's memory store has accumulated dozens of qualifying candidates at once. The next sweep picks up the rest.

## Three Verbs On The Board

The review board groups every work item by the verb the operator is doing, not by the system that produced the finding. Three verbs, in fixed order:

- **Promote** — graduate work upward. Memories with sources promote into the wiki; recurring memories promote into skills; raw observations promote into intentional memories. Most positive group, always at the top.
- **Reconcile** — fix divergence between the wiki and reality. Apply a route-guidance proposal so AGENTS.md routes correctly, rewrite a drifted page summary, insert a missing H1, run a diagnostic to confirm a finding still holds. Corrective alignment work.
- **Quiet** — acknowledge a signal so the inbox stops flagging it. Snooze a page-drift signal that's session noise, archive a dormant skill, mark a duplicate memory superseded. Acknowledgment work, no canonical content changes.

The hero numbers above the list (`X to promote · X to reconcile · X to quiet`) tell you at a glance how the work breaks down. Within each group, items still sort by priority (urgent first), and each item's eyebrow keeps the original source kind ("Memory · Promotion Ready", "Lint · Page Drift", "Proposal · route-guidance") so you can tell what type of finding you're acting on without leaving the verb-grouped frame.

Purpose is derived from the primary action's kind, not from the source. So an `archive-memory` primary on a stale-memory finding renders as Quiet even though the finding lives in the Memory bucket of the inbox snapshot. New action kinds added later auto-route via `PURPOSE_BY_ACTION_KIND` in `MaintenanceReviewBoard.vue`.

## What The Operator Actually Does

The human role here is review and editorial control. With the verb grouping above and the per-action previews described earlier, the loop is short:

1. Open the board and look at the three hero numbers. If `to promote` is non-zero, you have positive work to do; if `urgent` is non-zero, that bubbles to the top regardless of group.
2. **Promote** anything ready: click the row, see the preview, apply.
3. **Reconcile** divergence: for proposals click Preview proposal and read the diff before applying; for page drift use the inline rewriter or snooze if it's session noise; for missing H1 just click the resolve action.
4. **Quiet** the noise: archive duplicates, archive dormant skills, snooze page-drift signals you've already accepted.
5. If `DENDRITE_AUTO_PROMOTE=on`, review the auto-promoted changes via `git diff` after each refresh and revert any that landed wrong.

Read [Operator Workflow](./operator-workflow.md) for the fuller day-to-day loop.

Ready to actually use it? **[Open the Review Board](/review-board)**.