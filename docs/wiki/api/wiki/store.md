---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/store.ts
---

# `src/wiki/store.ts`

The wiki page store and the heart of the read/write/search/lint surface.

Owns everything about wiki pages as filesystem markdown: listing pages under
`docs/wiki/**`, parsing frontmatter into `WikiPageMetadata`, reading and writing page
content, extracting source-backed claims, building the graph of inbound/outbound links,
surfacing lint findings (`missing-h1`, `orphan-page`, `stale-claim`, `page-drift`, etc.),
and assembling the task-scoped briefing returned by `wiki_context`. The lint pass exempts
`lifecycle: generated` pages so auto-managed surfaces (the API reference tree) don't
surface findings humans can't act on.

Most other modules in `src/wiki/` consume this module rather than the filesystem directly.
`memory-store.ts` joins memories to pages here, `synthesis.ts` reads pages for claim
synthesis prompts, `generated-docs.ts` rebuilds derived artifacts from the page list.

## Exports

- [`WikiPageSummary`](#wikipagesummary) — interface
- [`WikiPageLifecycle`](#wikipagelifecycle) — type alias
- [`WikiPageMetadata`](#wikipagemetadata) — interface
- [`WikiLintRule`](#wikilintrule) — type alias
- [`WikiLintFinding`](#wikilintfinding) — interface
- [`WikiContextOptions`](#wikicontextoptions) — interface
- [`WikiContextPage`](#wikicontextpage) — interface
- [`WikiContextEvidence`](#wikicontextevidence) — interface
- [`WikiClaimStatus`](#wikiclaimstatus) — type alias
- [`WikiClaimSourceKind`](#wikiclaimsourcekind) — type alias
- [`WikiClaimSource`](#wikiclaimsource) — interface
- [`WikiClaim`](#wikiclaim) — interface
- [`WikiGuidanceKind`](#wikiguidancekind) — type alias
- [`WikiGuidanceFile`](#wikiguidancefile) — interface
- [`WikiGuidanceLifecycleStatus`](#wikiguidancelifecyclestatus) — type alias
- [`WikiGuidanceLifecycleItem`](#wikiguidancelifecycleitem) — interface
- [`WikiMergeGuidanceProposal`](#wikimergeguidanceproposal) — interface
- [`WikiRouteGuidanceProposal`](#wikirouteguidanceproposal) — interface
- [`WikiProposal`](#wikiproposal) — type alias
- [`WikiContextResult`](#wikicontextresult) — interface
- [`WikiGraphNode`](#wikigraphnode) — interface
- [`WikiGraphSnapshot`](#wikigraphsnapshot) — interface
- [`WikiProposalPage`](#wikiproposalpage) — interface
- [`WikiAppliedProposalResult`](#wikiappliedproposalresult) — interface
- [`WikiProposalFileChange`](#wikiproposalfilechange) — interface
- [`WikiProposalPreview`](#wikiproposalpreview) — interface
- [`listWikiProposals`](#listwikiproposals) — function
- [`writeWikiProposalPages`](#writewikiproposalpages) — function
- [`applyWikiProposal`](#applywikiproposal) — function
- [`previewWikiProposal`](#previewwikiproposal) — function
- [`pagePathFromSlug`](#pagepathfromslug) — function
- [`readWikiPage`](#readwikipage) — function
- [`writeWikiPage`](#writewikipage) — function
- [`appendProjectLog`](#appendprojectlog) — function
- [`insertH1FromSlug`](#inserth1fromslug) — function
- [`EditPageSummaryResult`](#editpagesummaryresult) — interface
- [`editPageSummary`](#editpagesummary) — function
- [`archiveGuidanceFile`](#archiveguidancefile) — function
- [`extractWikiPageMetadata`](#extractwikipagemetadata) — function
- [`listWikiPages`](#listwikipages) — function
- [`listGuidanceLifecycle`](#listguidancelifecycle) — function
- [`lintWikiPages`](#lintwikipages) — function
- [`searchWikiPages`](#searchwikipages) — function
- [`buildWikiContext`](#buildwikicontext) — function
- [`buildWikiGraphSnapshot`](#buildwikigraphsnapshot) — function
- [`listProjectGuidanceFiles`](#listprojectguidancefiles) — function
- [`extractWikiClaims`](#extractwikiclaims) — function

---

### `WikiPageSummary`

**Kind:** interface · **Source:** [src/wiki/store.ts:46](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L46)

```ts
interface WikiPageSummary {
    slug: string;
    title: string;
    path: string;
    metadata?: WikiPageMetadata;
}
```

---

### `WikiPageLifecycle`

**Kind:** type alias · **Source:** [src/wiki/store.ts:53](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L53)

```ts
type WikiPageLifecycle = 'active' | 'dormant' | 'superseded' | 'pending-review' | 'generated'
```

---

### `WikiPageMetadata`

**Kind:** interface · **Source:** [src/wiki/store.ts:55](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L55)

```ts
interface WikiPageMetadata {
    lifecycle: WikiPageLifecycle;
    owner: string;
    lastReviewed: string;
    sourceCoverage: 'none' | 'partial' | 'complete' | 'unknown';
}
```

---

### `WikiLintRule`

**Kind:** type alias · **Source:** [src/wiki/store.ts:62](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L62)

```ts
type WikiLintRule = 'missing-h1' | 'missing-summary' | 'orphan-page' | 'stale-claim' | 'unsupported-claim' | 'dormant-skill' | 'oversized-guidance' | 'duplicate-guidance' | 'stale-guidance-reference' | 'conflicting-guidance' | 'unrouted-guidance' | 'page-drift'
```

---

### `WikiLintFinding`

**Kind:** interface · **Source:** [src/wiki/store.ts:76](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L76)

```ts
interface WikiLintFinding {
    rule: WikiLintRule;
    slug: string;
    path: string;
    message: string;
}
```

---

### `WikiContextOptions`

**Kind:** interface · **Source:** [src/wiki/store.ts:83](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L83)

```ts
interface WikiContextOptions {
    maxPages?: number;
    includeLint?: boolean;
    maxLogEntries?: number;
    maxSkills?: number;
    relatedFiles?: string[];
    languages?: string[];
    frameworks?: string[];
}
```

---

### `WikiContextPage`

**Kind:** interface · **Source:** [src/wiki/store.ts:93](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L93)

```ts
interface WikiContextPage extends WikiPageSummary {
    score: number;
    summary: string;
    reason: string;
    evidence: WikiContextEvidence;
}
```

---

### `WikiContextEvidence`

**Kind:** interface · **Source:** [src/wiki/store.ts:100](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L100)

```ts
interface WikiContextEvidence {
    matchedTerms: string[];
    inboundLinks: number;
    relatedPages: string[];
}
```

---

### `WikiClaimStatus`

**Kind:** type alias · **Source:** [src/wiki/store.ts:106](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L106)

```ts
type WikiClaimStatus = 'current' | 'needs-review' | 'superseded' | 'unknown'
```

---

### `WikiClaimSourceKind`

**Kind:** type alias · **Source:** [src/wiki/store.ts:107](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L107)

```ts
type WikiClaimSourceKind = 'wiki' | 'file' | 'command' | 'decision'
```

---

### `WikiClaimSource`

**Kind:** interface · **Source:** [src/wiki/store.ts:109](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L109)

```ts
interface WikiClaimSource {
    kind: WikiClaimSourceKind;
    label: string;
    slug: string;
}
```

---

### `WikiClaim`

**Kind:** interface · **Source:** [src/wiki/store.ts:115](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L115)

```ts
interface WikiClaim {
    pageSlug: string;
    text: string;
    status: WikiClaimStatus;
    sources: WikiClaimSource[];
}
```

---

### `WikiGuidanceKind`

**Kind:** type alias · **Source:** [src/wiki/store.ts:122](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L122)

```ts
type WikiGuidanceKind = 'agents' | 'copilot-instructions' | 'instruction' | 'prompt' | 'agent' | 'skill'
```

---

### `WikiGuidanceFile`

**Kind:** interface · **Source:** [src/wiki/store.ts:124](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L124)

```ts
interface WikiGuidanceFile {
    path: string;
    kind: WikiGuidanceKind;
    summary: string;
}
```

---

### `WikiGuidanceLifecycleStatus`

**Kind:** type alias · **Source:** [src/wiki/store.ts:130](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L130)

```ts
type WikiGuidanceLifecycleStatus = 'active' | 'dormant' | 'superseded' | 'pending-review'
```

---

### `WikiGuidanceLifecycleItem`

**Kind:** interface · **Source:** [src/wiki/store.ts:132](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L132)

```ts
interface WikiGuidanceLifecycleItem extends WikiGuidanceFile {
    status: WikiGuidanceLifecycleStatus;
    linkedFrom: string[];
    archiveTarget?: string;
    reviewStatus?: 'none' | 'pending-review';
    reason: string;
}
```

---

### `WikiMergeGuidanceProposal`

**Kind:** interface · **Source:** [src/wiki/store.ts:140](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L140)

```ts
interface WikiMergeGuidanceProposal {
    kind: 'merge-guidance';
    summary: string;
    currentStateSummary: string;
    afterApplySummary: string;
    reviewSlug: string;
    reviewPath: string;
    canonicalPath: string;
    duplicatePaths: string[];
    archiveTargets: Array<{
        sourcePath: string;
        suggestedPath: string;
        reviewStatus: 'pending-review';
        reason: string;
    }>;
    rationale: string;
}
```

---

### `WikiRouteGuidanceProposal`

**Kind:** interface · **Source:** [src/wiki/store.ts:153](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L153)

```ts
interface WikiRouteGuidanceProposal {
    kind: 'route-guidance';
    summary: string;
    currentStateSummary: string;
    afterApplySummary: string;
    reviewSlug: string;
    reviewPath: string;
    guidancePath: string;
    targetPaths: string[];
    rationale: string;
}
```

---

### `WikiProposal`

**Kind:** type alias · **Source:** [src/wiki/store.ts:165](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L165)

```ts
type WikiProposal = WikiMergeGuidanceProposal | WikiRouteGuidanceProposal
```

---

### `WikiContextResult`

**Kind:** interface · **Source:** [src/wiki/store.ts:170](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L170)

```ts
interface WikiContextResult {
    query: string;
    briefing: string;
    readFirst: string[];
    handoffs: RecalledProjectMemory[];
    pages: WikiContextPage[];
    memories: RecalledProjectMemory[];
    skills: RecalledProjectSkill[];
    claims: WikiClaim[];
    guidanceFiles: WikiGuidanceFile[];
    omittedPages: number;
    omittedPageReasons: Array<{
        slug: string;
        score: number;
        reason: string;
    }>;
    recentLogEntries: string[];
    findings: WikiLintFinding[];
    openQuestions: string[];
    memoryBacklog: MemoryBacklogSummary;
}
```

---

### `WikiGraphNode`

**Kind:** interface · **Source:** [src/wiki/store.ts:188](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L188)

```ts
interface WikiGraphNode extends WikiSearchGraphNode {
    title: string;
    path: string;
    staleClaimCount: number;
    claimCount: number;
}
```

---

### `WikiGraphSnapshot`

**Kind:** interface · **Source:** [src/wiki/store.ts:195](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L195)

```ts
interface WikiGraphSnapshot {
    pages: number;
    nodes: WikiGraphNode[];
}
```

---

### `WikiProposalPage`

**Kind:** interface · **Source:** [src/wiki/store.ts:200](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L200)

```ts
interface WikiProposalPage extends WikiPageSummary {
    proposalKind: WikiProposal['kind'];
}
```

---

### `WikiAppliedProposalResult`

**Kind:** interface · **Source:** [src/wiki/store.ts:204](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L204)

```ts
interface WikiAppliedProposalResult {
    reviewSlug: string;
    proposalKind: WikiProposal['kind'];
    updatedPaths: string[];
    removedReviewSlugs: string[];
    activeReviewSlugs: string[];
}
```

---

### `WikiProposalFileChange`

**Kind:** interface · **Source:** [src/wiki/store.ts:212](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L212)

```ts
interface WikiProposalFileChange {
    path: string;
    currentContent: string;
    proposedContent: string;
    unifiedDiff: string;
    skippedBecauseUnchanged: boolean;
}
```

---

### `WikiProposalPreview`

**Kind:** interface · **Source:** [src/wiki/store.ts:220](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L220)

```ts
interface WikiProposalPreview {
    mode: 'preview';
    reviewSlug: string;
    proposalKind: WikiProposal['kind'];
    summary: string;
    rationale: string;
    warnings: string[];
    fileChanges: WikiProposalFileChange[];
}
```

---

### `listWikiProposals`

**Kind:** function · **Source:** [src/wiki/store.ts:237](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L237)

```ts
function listWikiProposals(): Promise<WikiProposal[]>
```

---

### `writeWikiProposalPages`

**Kind:** function · **Source:** [src/wiki/store.ts:286](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L286)

```ts
function writeWikiProposalPages(): Promise<WikiProposalPage[]>
```

---

### `applyWikiProposal`

**Kind:** function · **Source:** [src/wiki/store.ts:291](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L291)

```ts
function applyWikiProposal(reviewSlug: string): Promise<WikiAppliedProposalResult>
```

---

### `previewWikiProposal`

**Kind:** function · **Source:** [src/wiki/store.ts:340](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L340)

```ts
function previewWikiProposal(reviewSlug: string): Promise<WikiProposalPreview>
```

---

### `pagePathFromSlug`

**Kind:** function · **Source:** [src/wiki/store.ts:647](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L647)

```ts
function pagePathFromSlug(slug: string): string
```

---

### `readWikiPage`

**Kind:** function · **Source:** [src/wiki/store.ts:662](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L662)

```ts
function readWikiPage(slug: string): Promise<string>
```

---

### `writeWikiPage`

**Kind:** function · **Source:** [src/wiki/store.ts:666](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L666)

```ts
function writeWikiPage(slug: string, content: string): Promise<void>
```

---

### `appendProjectLog`

**Kind:** function · **Source:** [src/wiki/store.ts:673](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L673)

```ts
function appendProjectLog(entry: string, date): Promise<void>
```

---

### `insertH1FromSlug`

**Kind:** function · **Source:** [src/wiki/store.ts:700](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L700)

```ts
function insertH1FromSlug(slug: string): Promise<boolean>
```

---

### `EditPageSummaryResult`

**Kind:** interface · **Source:** [src/wiki/store.ts:746](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L746)

```ts
interface EditPageSummaryResult {
    slug: string;
    changed: boolean;
    previousSummary: string;
    newSummary: string;
}
```

---

### `editPageSummary`

**Kind:** function · **Source:** [src/wiki/store.ts:753](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L753)

```ts
function editPageSummary(slug: string, newFirstParagraph: string): Promise<EditPageSummaryResult>
```

---

### `archiveGuidanceFile`

**Kind:** function · **Source:** [src/wiki/store.ts:807](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L807)

```ts
function archiveGuidanceFile(relativePath: string): Promise<{
    from: string;
    to: string;
    moved: boolean;
}>
```

---

### `extractWikiPageMetadata`

**Kind:** function · **Source:** [src/wiki/store.ts:832](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L832)

```ts
function extractWikiPageMetadata(content: string): WikiPageMetadata
```

---

### `listWikiPages`

**Kind:** function · **Source:** [src/wiki/store.ts:877](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L877)

```ts
function listWikiPages(): Promise<WikiPageSummary[]>
```

---

### `listGuidanceLifecycle`

**Kind:** function · **Source:** [src/wiki/store.ts:903](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L903)

```ts
function listGuidanceLifecycle(): Promise<WikiGuidanceLifecycleItem[]>
```

---

### `lintWikiPages`

**Kind:** function · **Source:** [src/wiki/store.ts:976](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L976)

```ts
function lintWikiPages(): Promise<WikiLintFinding[]>
```

---

### `searchWikiPages`

**Kind:** function · **Source:** [src/wiki/store.ts:1132](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1132)

```ts
function searchWikiPages(query: string): Promise<WikiSearchResult[]>
```

---

### `buildWikiContext`

**Kind:** function · **Source:** [src/wiki/store.ts:1137](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1137)

```ts
function buildWikiContext(query: string, options: WikiContextOptions): Promise<WikiContextResult>
```

---

### `buildWikiGraphSnapshot`

**Kind:** function · **Source:** [src/wiki/store.ts:1229](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1229)

```ts
function buildWikiGraphSnapshot(): Promise<WikiGraphSnapshot>
```

---

### `listProjectGuidanceFiles`

**Kind:** function · **Source:** [src/wiki/store.ts:1519](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1519)

```ts
function listProjectGuidanceFiles(): Promise<WikiGuidanceFile[]>
```

---

### `extractWikiClaims`

**Kind:** function · **Source:** [src/wiki/store.ts:1834](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1834)

```ts
function extractWikiClaims(pageSlug: string, content: string, pageByPath: Map<string, string>): WikiClaim[]
```
