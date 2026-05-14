---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/store.ts
---

# `packages/wiki/src/store.ts`

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

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:48](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L48)

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

**Kind:** type alias · **Source:** [packages/wiki/src/store.ts:55](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L55)

```ts
type WikiPageLifecycle = 'active' | 'dormant' | 'superseded' | 'pending-review' | 'generated'
```

---

### `WikiPageMetadata`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:57](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L57)

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

**Kind:** type alias · **Source:** [packages/wiki/src/store.ts:64](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L64)

```ts
type WikiLintRule = 'missing-h1' | 'missing-summary' | 'orphan-page' | 'stale-claim' | 'unsupported-claim' | 'dormant-skill' | 'oversized-guidance' | 'duplicate-guidance' | 'stale-guidance-reference' | 'conflicting-guidance' | 'unrouted-guidance' | 'page-drift' | 'contradicts-shipped-memory'
```

---

### `WikiLintFinding`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:79](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L79)

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

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:86](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L86)

```ts
interface WikiContextOptions {
    maxPages?: number;
    includeLint?: boolean;
    maxLogEntries?: number;
    maxSkills?: number;
    relatedFiles?: string[];
    languages?: string[];
    frameworks?: string[];
    maxOmittedPageReasons?: number;
    maxOmittedReasonChars?: number;
    maxHandoffTextChars?: number;
    maxMemoryTextChars?: number;
    maxSkillTextChars?: number;
}
```

---

### `WikiContextPage`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:111](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L111)

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

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:118](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L118)

```ts
interface WikiContextEvidence {
    matchedTerms: string[];
    inboundLinks: number;
    relatedPages: string[];
}
```

---

### `WikiClaimStatus`

**Kind:** type alias · **Source:** [packages/wiki/src/store.ts:124](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L124)

```ts
type WikiClaimStatus = 'current' | 'needs-review' | 'superseded' | 'unknown'
```

---

### `WikiClaimSourceKind`

**Kind:** type alias · **Source:** [packages/wiki/src/store.ts:132](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L132)

```ts
type WikiClaimSourceKind = MemorySourceKind
```

---

### `WikiClaimSource`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:134](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L134)

```ts
interface WikiClaimSource {
    kind: WikiClaimSourceKind;
    label: string;
    slug: string;
}
```

---

### `WikiClaim`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:140](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L140)

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

**Kind:** type alias · **Source:** [packages/wiki/src/store.ts:147](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L147)

```ts
type WikiGuidanceKind = 'agents' | 'copilot-instructions' | 'instruction' | 'prompt' | 'agent' | 'skill'
```

---

### `WikiGuidanceFile`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:149](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L149)

```ts
interface WikiGuidanceFile {
    path: string;
    kind: WikiGuidanceKind;
    summary: string;
}
```

---

### `WikiGuidanceLifecycleStatus`

**Kind:** type alias · **Source:** [packages/wiki/src/store.ts:155](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L155)

```ts
type WikiGuidanceLifecycleStatus = 'active' | 'dormant' | 'superseded' | 'pending-review'
```

---

### `WikiGuidanceLifecycleItem`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:157](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L157)

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

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:165](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L165)

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

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:178](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L178)

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

**Kind:** type alias · **Source:** [packages/wiki/src/store.ts:190](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L190)

```ts
type WikiProposal = WikiMergeGuidanceProposal | WikiRouteGuidanceProposal
```

---

### `WikiContextResult`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:195](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L195)

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

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:213](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L213)

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

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:220](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L220)

```ts
interface WikiGraphSnapshot {
    pages: number;
    nodes: WikiGraphNode[];
}
```

---

### `WikiProposalPage`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:225](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L225)

```ts
interface WikiProposalPage extends WikiPageSummary {
    proposalKind: WikiProposal['kind'];
}
```

---

### `WikiAppliedProposalResult`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:229](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L229)

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

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:237](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L237)

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

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:245](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L245)

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

**Kind:** function · **Source:** [packages/wiki/src/store.ts:262](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L262)

```ts
function listWikiProposals(): Promise<WikiProposal[]>
```

---

### `writeWikiProposalPages`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:311](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L311)

```ts
function writeWikiProposalPages(): Promise<WikiProposalPage[]>
```

---

### `applyWikiProposal`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:316](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L316)

```ts
function applyWikiProposal(reviewSlug: string): Promise<WikiAppliedProposalResult>
```

---

### `previewWikiProposal`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:365](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L365)

```ts
function previewWikiProposal(reviewSlug: string): Promise<WikiProposalPreview>
```

---

### `pagePathFromSlug`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:672](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L672)

```ts
function pagePathFromSlug(slug: string): string
```

---

### `readWikiPage`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:687](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L687)

```ts
function readWikiPage(slug: string): Promise<string>
```

---

### `writeWikiPage`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:691](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L691)

```ts
function writeWikiPage(slug: string, content: string): Promise<void>
```

---

### `appendProjectLog`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:698](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L698)

```ts
function appendProjectLog(entry: string, date): Promise<void>
```

---

### `insertH1FromSlug`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:725](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L725)

```ts
function insertH1FromSlug(slug: string): Promise<boolean>
```

---

### `EditPageSummaryResult`

**Kind:** interface · **Source:** [packages/wiki/src/store.ts:771](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L771)

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

**Kind:** function · **Source:** [packages/wiki/src/store.ts:778](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L778)

```ts
function editPageSummary(slug: string, newFirstParagraph: string): Promise<EditPageSummaryResult>
```

---

### `archiveGuidanceFile`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:832](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L832)

```ts
function archiveGuidanceFile(relativePath: string): Promise<{
    from: string;
    to: string;
    moved: boolean;
}>
```

---

### `extractWikiPageMetadata`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:857](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L857)

```ts
function extractWikiPageMetadata(content: string): WikiPageMetadata
```

---

### `listWikiPages`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:902](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L902)

```ts
function listWikiPages(): Promise<WikiPageSummary[]>
```

---

### `listGuidanceLifecycle`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:928](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L928)

```ts
function listGuidanceLifecycle(): Promise<WikiGuidanceLifecycleItem[]>
```

---

### `lintWikiPages`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:1001](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L1001)

```ts
function lintWikiPages(): Promise<WikiLintFinding[]>
```

---

### `searchWikiPages`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:1184](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L1184)

```ts
function searchWikiPages(query: string): Promise<WikiSearchResult[]>
```

---

### `buildWikiContext`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:1189](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L1189)

```ts
function buildWikiContext(query: string, options: WikiContextOptions): Promise<WikiContextResult>
```

---

### `buildWikiGraphSnapshot`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:1311](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L1311)

```ts
function buildWikiGraphSnapshot(): Promise<WikiGraphSnapshot>
```

---

### `listProjectGuidanceFiles`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:1609](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L1609)

```ts
function listProjectGuidanceFiles(): Promise<WikiGuidanceFile[]>
```

---

### `extractWikiClaims`

**Kind:** function · **Source:** [packages/wiki/src/store.ts:1924](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/store.ts#L1924)

```ts
function extractWikiClaims(pageSlug: string, content: string, pageByPath: Map<string, string>): WikiClaim[]
```
