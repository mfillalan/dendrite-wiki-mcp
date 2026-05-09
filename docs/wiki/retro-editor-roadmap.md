---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-09
source-coverage: partial
---

# Retro Editor Experiment Roadmap

This page tracks an experimental track to add a first-class **in-browser editing experience** to the Dendrite Wiki MCP browser UI, themed around the aesthetic of pre-WYSIWYG word processors (WordStar, WordPerfect 5.1, early DOS terminals, IBM Selectric output, monospace dot-matrix print). The audience archetype: a developer who genuinely enjoys documentation work, prints pages and clips them in a binder, and would rather a tool feel like a craftsman's instrument than an infinite-scroll SaaS app.

This experiment lives on the `retro-editor-experiment` branch. Nothing here is committed to the release roadmap until a slice ships and proves out.

## Why This, Why Now

Today the browser UI is a read-and-review surface. Editing wiki pages still requires a text editor and a git diff. Two friction sources fall out of that:

1. **Drive-by edits are clumsy.** A reviewer who notices a typo or a wrong claim while reading the rendered wiki has no way to fix it in the same surface they discovered it in.
2. **The browser UI doesn't have a personality yet.** It's a polite VitePress default. Polite is fine but unmemorable, and the project's audience (people who care enough to maintain a structured wiki) tends to also care about the *feel* of their tools.

The retro framing solves both at once: an editor that's purposeful and aesthetic enough to make documentation work feel rewarding, plus a tactile print/binder workflow that matches how this audience actually consumes long-form docs.

## Non-Goals (Important)

- **Not a CMS.** Markdown files stay canonical. Every save still produces a normal git diff. No hidden database, no rich-text-only round trip, no proprietary format.
- **Not a replacement for the agent write path.** `wiki_write` and `wiki_apply_proposal` remain the agent contract. The browser editor uses the same review-bridge HTTP surface that maintenance actions already use.
- **Not retro for retro's sake.** Every retro affordance has to earn its place by improving the editing experience. Status-bar key hints aren't decoration — they're how WordPerfect users actually navigated faster than mice. If a retro element is pure costume, it gets cut.
- **Not a rich-text editor.** The source is markdown. The editor is a markdown editor with optional live preview and a "reveal codes" mode (showing the raw markdown alongside the rendered view). No CKEditor, no TipTap-style WYSIWYG.

## Design Pillars

### 1. The Source Of Truth Is Still Markdown

Every editor save calls a new review-bridge endpoint that resolves to `writeWikiPage(slug, content)` in [`src/wiki/store.ts`](../../src/wiki/store.ts). The same lint and benchmark side-effects fire as when the agent writes. The same git diff appears. There is no parallel storage.

### 2. The Aesthetic Is A Coherent Theme, Not A Skin

A "retro mode" toggle in the nav switches the entire UI into one of (initial set):

- **Amber Terminal** — amber-on-black, IBM VGA 8x16 bitmap font (web-fonted), faint scanline overlay, blinking block cursor in the editor, function-key hints in a status bar at the bottom.
- **WordPerfect 5.1** — IBM beige background, blue status line at the bottom, monospace serif body font, "reveal codes" pane toggle that splits the view to show raw markdown side-by-side with the rendered output.
- **Selectric Print** — black on cream paper with a faint grid, a serif typewriter font (e.g. JMH Typewriter), justified body, page-numbered print layout. Optimized for the "I'm going to print this" workflow.

All three share the same component skeleton; only CSS variables and one font swap differ. Modern theme stays the default.

### 3. Editing Affordances Are Old-School On Purpose

- Status bar at the bottom of the screen showing line/column, word count, current section, and **function-key hints** (`F2 Save · F3 Preview · F5 Reveal Codes · F10 Menu`). These are real keybindings, not just labels.
- Wiki-link autocomplete on `[[`. Triggered against the in-memory page index that already exists for `wiki_search`.
- Frontmatter form view: instead of editing YAML by hand, a tabular form for `lifecycle`, `owner`, `last-reviewed`, `source-coverage`. Saves back as YAML.
- "Reveal codes" toggle: split-pane raw markdown ↔ rendered preview. Direct WordPerfect homage and genuinely useful for understanding why a page renders the way it does.
- Conflict-safe save: the editor sends an `if-match` token (file mtime + hash) on save; if the file changed under it (agent wrote, git pulled), the bridge rejects with a diff and lets the user merge.

### 4. The Print/Binder Workflow Is A First-Class Output

A "Compile to Binder" action on any page (or the whole wiki) that produces a styled PDF via headless Chrome:

- Cover page with project name, generated-on timestamp, table of contents
- Page numbers, section headers in the running header
- Print stylesheet that respects `page-break-before` for new sections
- A "binder mode" CSS that makes claims, source citations, and promoted lessons visually distinct in a way that survives black-and-white printing

This is half the appeal for the target audience and is mostly a print stylesheet plus a small CLI subcommand.

## Build Order

Each slice is independently shippable. The branch can merge at any slice boundary if the experiment proves worth keeping.

### R0: Branch Scaffold And Plan (this commit)

Create the branch, write this roadmap page, log the experiment kickoff. No code changes yet.

**Acceptance:** branch exists, this page exists, project-log entry exists.

### R1: Read-Only Retro Theme Toggle

A nav-bar dropdown that switches between Modern / Amber Terminal / WordPerfect / Selectric Print. Pure CSS variable swap plus a font load. No editing behavior yet.

**Acceptance:**
- Toggle persists in localStorage as `dendrite-ui-theme`.
- All three retro themes render the existing pages legibly without layout breakage.
- Print stylesheet for Selectric Print produces a clean PDF via the browser's "Print to PDF" with no Dendrite-specific CLI yet.
- Existing components (BenchmarkReport, MaintenanceReviewBoard, GraphNeighborhood) inherit theme variables cleanly.

**Build notes:** add `docs/.vitepress/theme/styles/retro-*.css`, a `ThemeSwitcher.vue` component, mount in `Layout.vue` next to `InboxNavBadge`. Theme tokens via `--dendrite-bg`, `--dendrite-fg`, `--dendrite-accent`, `--dendrite-mono-font`, `--dendrite-serif-font`.

### R2: Editor Surface (View-Mode Only)

Add a "Edit this page" button on every wiki page that opens an editor view (modal or full-screen) showing the raw markdown in a CodeMirror 6 instance. **Read-only at this slice.** Confirms the editor mounts, themes correctly, and can fetch page content via a new `/pages/read` review-bridge endpoint.

**Acceptance:**
- `/wiki/:slug` shows an "Edit" button that opens the editor.
- Editor pulls content via review-bridge, renders in CodeMirror, applies the active retro theme.
- "Reveal codes" toggle works (split pane).
- Closing the editor returns to the rendered page with no state changes.

**Build notes:** new `WikiEditor.vue`, new `GET /pages/read?slug=` endpoint in [`src/wiki/review-bridge.ts`](../../src/wiki/review-bridge.ts). Same auth model as the existing review-bridge endpoints.

### R3: Save Path

Wire the editor's save action to a new `POST /pages/write` endpoint that calls `writeWikiPage(slug, content)` and triggers the same generated-docs refresh that maintenance actions trigger. Conflict-safe via mtime + hash check.

**Acceptance:**
- `F2` or "Save" persists the markdown to disk.
- `git status` shows the expected diff.
- A project-log entry is appended (operator authorship, not agent).
- Concurrent agent write triggers a conflict response with a 3-way diff in the modal.
- Save bumps the wiki-updated benchmark event.

**Build notes:** `POST /pages/write` requires confirmation header per existing review-bridge convention. Reuse `runMaintenanceActionAndRefresh`-style refresh flow but via a thin direct path so we don't have to fake a maintenance action ID.

### R4: Function-Key Status Bar And Wiki-Link Autocomplete

Real keybindings (`F2 Save`, `F3 Preview toggle`, `F5 Reveal Codes`, `F10 Menu`, `Ctrl+S` as modern fallback). `[[` triggers a popover backed by `wiki_search` for fast wiki-link insertion.

**Acceptance:**
- All function keys do what their hints say.
- `[[arch` shows ranked candidates from the search index.
- Selecting an autocomplete result inserts `[[architecture|Architecture]]` (or whatever the project's link style is).
- Status bar shows line/col, word count, dirty state, current section.

### R5: Frontmatter Form View

A tabbed view in the editor: **Body** (markdown) / **Frontmatter** (form). Frontmatter form has typed inputs for the known fields and a free-form key/value table for the rest.

**Acceptance:**
- Switching tabs preserves dirty state.
- Saving from either tab serializes the merged result.
- Unknown frontmatter keys round-trip without loss.

### R6: Compile-To-Binder PDF

CLI command `dendrite-wiki binder:export [--pages slug1,slug2 | --all] [--theme selectric|amber|wordperfect] [--output binder.pdf]`. Renders selected pages through a headless Chrome with the print stylesheet, stitches into a single PDF with cover page, TOC, and page numbers.

**Acceptance:**
- `dendrite-wiki binder:export --all` produces a single PDF under `docs/public/binder.pdf` (gitignored).
- Cover page includes project name, generation timestamp, page count.
- TOC with page numbers.
- Each wiki page starts on a new printed page.
- Source citations and claims render distinctly even in B/W print.
- Optional `--theme` flag controls the print aesthetic (default: `selectric`).

### R7 (Stretch): "New Page" Wizard

A retro-styled wizard for creating a new wiki page: pick a template (architecture, decision-record, runbook, troubleshooting), prompts for slug, title, owner, then opens R2's editor pre-filled.

## Open Questions

- **Editor library:** CodeMirror 6 vs. Monaco vs. minimal `<textarea>` with Marked for preview. Leaning CodeMirror 6 — smaller, themeable to the bone, no Microsoft-corporate aesthetic to fight against.
- **Should "Edit this page" be visible to anyone visiting the local docs server, or gated behind the same review-bridge auth that maintenance actions use?** Probably the latter — same model as the Apply buttons. Local-first means local-trusted, but the bridge already has a clean auth story we shouldn't bypass.
- **PDF generation: bundled Puppeteer vs. detected-system-Chromium vs. shelling to `wkhtmltopdf`.** Puppeteer adds ~150 MB to install size; detected-Chromium has a "but I don't have Chrome" failure mode; wkhtmltopdf is unmaintained. Lean toward Puppeteer with `chrome-headless-shell` (smaller bundle), behind a lazy-install on first `binder:export` call.
- **Should there be a "scanline" / CRT effect on Amber Terminal?** It's costume, but it's *delightful* costume. Probably ship it behind a `--no-effects` flag for accessibility and call it a day.
- **How does this interact with the maintenance-inbox apply flow?** A page edited in the browser may invalidate pending proposals against that page. Probably: detect overlap on save and surface a "this save invalidates 2 pending proposals" warning.

## Risk / Cost

- **Build effort:** R1 is small (~1 day), R2–R3 medium (~3–5 days), R4–R5 small-medium, R6 medium, R7 small. Total experimental scope: ~2–3 weeks of focused work for a credible v1.
- **Maintenance surface:** an editor is a forever-feature. Once it ships, breaking changes to the markdown contract become user-visible. Worth it only if the editor demonstrably increases engagement with the wiki.
- **Audience risk:** the retro aesthetic is a strong opinion. Some users will love it; some will find it gimmicky. Mitigation: Modern theme stays the default, retro themes are opt-in via the toggle.

## How To Decide If This Ships

After R1–R3 land on the branch, dogfood for a week against this very repo:
- Does the operator actually use the in-browser editor for real edits, or fall back to the IDE?
- Does the retro aesthetic still feel good after day three, or does it become noise?
- Does the binder PDF (after R6) get printed and used, or is it a novelty?

If two out of three are yes, the experiment graduates to the [Paid Tier Roadmap](./paid-tier-roadmap.md) as the next "make-the-free-product-feel-premium" slice. If not, the branch gets archived as a learning experiment and the retro-themed read-only mode (R1) may still land on its own as low-cost polish.

## Status Tracker

| Slice | Status | Notes |
|---|---|---|
| R0: Branch + plan | Done | This page; branch `retro-editor-experiment` |
| R1: Read-only retro themes | Done | `ThemeSwitcher.vue` + `styles/retro.css` + early-paint head script. Verified end-to-end. R1.1 polish backlog: search-box and some nav chrome bleed-through in non-Modern themes. |
| R2: Editor surface (read-only) | Done | `WikiEditor.vue` (CodeMirror 6, full-screen overlay) + `EditPageButton.vue` (floating, only on `/wiki/*` pages) + new `GET /__review-bridge/pages/read?slug=` endpoint returning `{slug, content, mtime, hash, bytes}`. Reveal-codes split pane is stubbed for R3+. Status bar shows SLUG / MODE / LINES / WORDS plus function-key hints. Theme inheritance verified across all 4 themes. |
| R3: Save path | Done | `POST /__review-bridge/pages/write` with `ifMatch: {mtime, hash}` precondition, 409 conflict response carrying current disk state, three-way conflict resolver in `WikiEditor.vue` (Cancel / Discard mine / Keep mine — never silent overwrite). Save fires `wiki_updated` benchmark event with `trigger: 'browser-editor'` and appends an operator-authored project-log entry. F2 + Ctrl+S keybindings. Verified end-to-end: editor save → file diff → log entry → benchmark event → forced concurrent disk write → 409 with side-by-side resolver. |
| R4: Function keys + autocomplete | Done | `[[` triggers a CodeMirror autocompletion popover backed by new `GET /__review-bridge/pages/list` endpoint. Substring + prefix ranking by slug & title, top 12 candidates, selection inserts `[Title](./slug.md)` matching the existing wiki link style. Status bar gained LN/COL cursor tracking. F2/F5/Esc/Ctrl+S already wired in R2/R3. |
| R5: Frontmatter form | Planned | |
| R6: Compile-to-binder PDF | Done (HTML output, browser-Print to PDF) | New `dendrite-wiki binder:export [--all\|--pages a,b] [--theme selectric\|amber\|wordperfect\|modern] [--output] [--title]` CLI subcommand. New `src/wiki/binder-export.ts` renders selected wiki pages with `markdown-it`, wraps each in a numbered page section, prepends a cover page (double-bordered frame, project name, timestamp) and TOC (numbered, slug+title grid), and emits a single self-contained HTML file with `@media print` page-break rules. Default theme = Selectric, default output = `docs/public/binder.html` (gitignored). One step short of auto-PDF — operator opens in browser → File → Print → Save as PDF; Puppeteer auto-PDF deferred to optional R6.1. |
| R7: New-page wizard | Stretch | |
