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

**Kind:** interface · **Source:** [src/wiki/store.ts:40](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L40)

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

**Kind:** type alias · **Source:** [src/wiki/store.ts:47](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L47)

```ts
type WikiPageLifecycle = 'active' | 'dormant' | 'superseded' | 'pending-review' | 'generated'
```

---

### `WikiPageMetadata`

**Kind:** interface · **Source:** [src/wiki/store.ts:49](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L49)

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

**Kind:** type alias · **Source:** [src/wiki/store.ts:56](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L56)

```ts
type WikiLintRule = 'missing-h1' | 'missing-summary' | 'orphan-page' | 'stale-claim' | 'unsupported-claim' | 'dormant-skill' | 'oversized-guidance' | 'duplicate-guidance' | 'stale-guidance-reference' | 'conflicting-guidance' | 'unrouted-guidance' | 'page-drift'
```

---

### `WikiLintFinding`

**Kind:** interface · **Source:** [src/wiki/store.ts:70](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L70)

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

**Kind:** interface · **Source:** [src/wiki/store.ts:77](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L77)

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

**Kind:** interface · **Source:** [src/wiki/store.ts:87](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L87)

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

**Kind:** interface · **Source:** [src/wiki/store.ts:94](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L94)

```ts
interface WikiContextEvidence {
    matchedTerms: string[];
    inboundLinks: number;
    relatedPages: string[];
}
```

---

### `WikiClaimStatus`

**Kind:** type alias · **Source:** [src/wiki/store.ts:100](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L100)

```ts
type WikiClaimStatus = 'current' | 'needs-review' | 'superseded' | 'unknown'
```

---

### `WikiClaimSourceKind`

**Kind:** type alias · **Source:** [src/wiki/store.ts:101](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L101)

```ts
type WikiClaimSourceKind = 'wiki' | 'file' | 'command' | 'decision'
```

---

### `WikiClaimSource`

**Kind:** interface · **Source:** [src/wiki/store.ts:103](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L103)

```ts
interface WikiClaimSource {
    kind: WikiClaimSourceKind;
    label: string;
    slug: string;
}
```

---

### `WikiClaim`

**Kind:** interface · **Source:** [src/wiki/store.ts:109](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L109)

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

**Kind:** type alias · **Source:** [src/wiki/store.ts:116](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L116)

```ts
type WikiGuidanceKind = 'agents' | 'copilot-instructions' | 'instruction' | 'prompt' | 'agent' | 'skill'
```

---

### `WikiGuidanceFile`

**Kind:** interface · **Source:** [src/wiki/store.ts:118](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L118)

```ts
interface WikiGuidanceFile {
    path: string;
    kind: WikiGuidanceKind;
    summary: string;
}
```

---

### `WikiGuidanceLifecycleStatus`

**Kind:** type alias · **Source:** [src/wiki/store.ts:124](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L124)

```ts
type WikiGuidanceLifecycleStatus = 'active' | 'dormant' | 'superseded' | 'pending-review'
```

---

### `WikiGuidanceLifecycleItem`

**Kind:** interface · **Source:** [src/wiki/store.ts:126](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L126)

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

**Kind:** interface · **Source:** [src/wiki/store.ts:134](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L134)

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

**Kind:** interface · **Source:** [src/wiki/store.ts:147](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L147)

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

**Kind:** type alias · **Source:** [src/wiki/store.ts:159](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L159)

```ts
type WikiProposal = WikiMergeGuidanceProposal | WikiRouteGuidanceProposal
```

---

### `WikiContextResult`

**Kind:** interface · **Source:** [src/wiki/store.ts:164](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L164)

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
}
```

---

### `WikiGraphNode`

**Kind:** interface · **Source:** [src/wiki/store.ts:181](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L181)

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

**Kind:** interface · **Source:** [src/wiki/store.ts:188](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L188)

```ts
interface WikiGraphSnapshot {
    pages: number;
    nodes: WikiGraphNode[];
}
```

---

### `WikiProposalPage`

**Kind:** interface · **Source:** [src/wiki/store.ts:193](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L193)

```ts
interface WikiProposalPage extends WikiPageSummary {
    proposalKind: WikiProposal['kind'];
}
```

---

### `WikiAppliedProposalResult`

**Kind:** interface · **Source:** [src/wiki/store.ts:197](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L197)

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

**Kind:** interface · **Source:** [src/wiki/store.ts:205](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L205)

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

**Kind:** interface · **Source:** [src/wiki/store.ts:213](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L213)

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

**Kind:** function · **Source:** [src/wiki/store.ts:230](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L230)

```ts
function listWikiProposals(): Promise<WikiProposal[]>
```

---

### `writeWikiProposalPages`

**Kind:** function · **Source:** [src/wiki/store.ts:279](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L279)

```ts
function writeWikiProposalPages(): Promise<WikiProposalPage[]>
```

---

### `applyWikiProposal`

**Kind:** function · **Source:** [src/wiki/store.ts:284](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L284)

```ts
function applyWikiProposal(reviewSlug: string): Promise<WikiAppliedProposalResult>
```

---

### `previewWikiProposal`

**Kind:** function · **Source:** [src/wiki/store.ts:333](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L333)

```ts
function previewWikiProposal(reviewSlug: string): Promise<WikiProposalPreview>
```

---

### `pagePathFromSlug`

**Kind:** function · **Source:** [src/wiki/store.ts:640](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L640)

```ts
function pagePathFromSlug(slug: string): string
```

---

### `readWikiPage`

**Kind:** function · **Source:** [src/wiki/store.ts:655](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L655)

```ts
function readWikiPage(slug: string): Promise<string>
```

---

### `writeWikiPage`

**Kind:** function · **Source:** [src/wiki/store.ts:659](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L659)

```ts
function writeWikiPage(slug: string, content: string): Promise<void>
```

---

### `appendProjectLog`

**Kind:** function · **Source:** [src/wiki/store.ts:666](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L666)

```ts
function appendProjectLog(entry: string, date): Promise<void>
```

---

### `insertH1FromSlug`

**Kind:** function · **Source:** [src/wiki/store.ts:693](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L693)

```ts
function insertH1FromSlug(slug: string): Promise<boolean>
```

---

### `EditPageSummaryResult`

**Kind:** interface · **Source:** [src/wiki/store.ts:739](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L739)

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

**Kind:** function · **Source:** [src/wiki/store.ts:746](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L746)

```ts
function editPageSummary(slug: string, newFirstParagraph: string): Promise<EditPageSummaryResult>
```

---

### `archiveGuidanceFile`

**Kind:** function · **Source:** [src/wiki/store.ts:800](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L800)

```ts
function archiveGuidanceFile(relativePath: string): Promise<{
    from: string;
    to: string;
    moved: boolean;
}>
```

---

### `extractWikiPageMetadata`

**Kind:** function · **Source:** [src/wiki/store.ts:825](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L825)

```ts
function extractWikiPageMetadata(content: string): WikiPageMetadata
```

---

### `listWikiPages`

**Kind:** function · **Source:** [src/wiki/store.ts:870](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L870)

```ts
function listWikiPages(): Promise<WikiPageSummary[]>
```

---

### `listGuidanceLifecycle`

**Kind:** function · **Source:** [src/wiki/store.ts:896](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L896)

```ts
function listGuidanceLifecycle(): Promise<WikiGuidanceLifecycleItem[]>
```

---

### `lintWikiPages`

**Kind:** function · **Source:** [src/wiki/store.ts:969](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L969)

```ts
function lintWikiPages(): Promise<WikiLintFinding[]>
```

---

### `searchWikiPages`

**Kind:** function · **Source:** [src/wiki/store.ts:1125](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1125)

```ts
function searchWikiPages(query: string): Promise<WikiSearchResult[]>
```

---

### `buildWikiContext`

**Kind:** function · **Source:** [src/wiki/store.ts:1130](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1130)

```ts
function buildWikiContext(query: string, options: WikiContextOptions): Promise<WikiContextResult>
```

---

### `buildWikiGraphSnapshot`

**Kind:** function · **Source:** [src/wiki/store.ts:1212](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1212)

```ts
function buildWikiGraphSnapshot(): Promise<WikiGraphSnapshot>
```

---

### `listProjectGuidanceFiles`

**Kind:** function · **Source:** [src/wiki/store.ts:1482](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1482)

```ts
function listProjectGuidanceFiles(): Promise<WikiGuidanceFile[]>
```

---

### `extractWikiClaims`

**Kind:** function · **Source:** [src/wiki/store.ts:1797](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/store.ts#L1797)

```ts
function extractWikiClaims(pageSlug: string, content: string, pageByPath: Map<string, string>): WikiClaim[]
```
