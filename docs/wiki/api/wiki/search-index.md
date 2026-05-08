---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/search-index.ts
---

# `src/wiki/search-index.ts`

Wiki search index — keyword + graph ranking with explainable reasons.

Builds a token index over page titles, slugs, content, and source-backed claims, plus a
companion graph layer (inbound link counts, outbound links, related pages) so search
results carry both lexical and structural signal. Query results include a `reasons` array
explaining why each page surfaced ("title matches X", "content mentions Y", "linked from
the wiki graph", "N inbound links"), which is what makes the recall surface auditable
— operators can read why a page ranked where it did instead of trusting an opaque
vector score.

Used by `wiki_search`, by `wiki_context` for assembling the briefing's "ranked pages"
section, and by the `Memory Trails` recall path in `memory-edges.ts` for query-edge
reinforcement. The Jaccard tokenizer here is the same one used to compute Memory Trails
query-fingerprint similarity, so search ranking and trail bonuses agree on what counts
as a "similar" query.

## Exports

- [`WikiSearchDocument`](#wikisearchdocument) — interface
- [`WikiSearchIndexInput`](#wikisearchindexinput) — interface
- [`WikiSearchGraphNode`](#wikisearchgraphnode) — interface
- [`WikiSearchResult`](#wikisearchresult) — interface
- [`WikiSearchIndex`](#wikisearchindex) — interface
- [`buildWikiSearchIndex`](#buildwikisearchindex) — function
- [`searchWikiIndex`](#searchwikiindex) — function
- [`fallbackSearchResults`](#fallbacksearchresults) — function
- [`searchResultToContextPage`](#searchresulttocontextpage) — function
- [`tokenizeSearchQuery`](#tokenizesearchquery) — function

---

### `WikiSearchDocument`

**Kind:** interface · **Source:** [src/wiki/search-index.ts:21](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L21)

```ts
interface WikiSearchDocument {
    page: WikiPageSummary;
    content: string;
    claims: WikiClaim[];
}
```

---

### `WikiSearchIndexInput`

**Kind:** interface · **Source:** [src/wiki/search-index.ts:27](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L27)

```ts
interface WikiSearchIndexInput {
    pages: WikiSearchDocument[];
    indexContent: string;
}
```

---

### `WikiSearchGraphNode`

**Kind:** interface · **Source:** [src/wiki/search-index.ts:32](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L32)

```ts
interface WikiSearchGraphNode {
    slug: string;
    inboundLinks: number;
    outgoingLinks: string[];
    relatedPages: string[];
}
```

---

### `WikiSearchResult`

**Kind:** interface · **Source:** [src/wiki/search-index.ts:39](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L39)

```ts
interface WikiSearchResult extends WikiPageSummary {
    score: number;
    summary: string;
    reasons: string[];
    matchedTerms: string[];
    claimMatches: Array<{
        text: string;
        status: WikiClaim['status'];
        sources: WikiClaim['sources'];
    }>;
    graph: WikiSearchGraphNode;
}
```

---

### `WikiSearchIndex`

**Kind:** interface · **Source:** [src/wiki/search-index.ts:48](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L48)

```ts
interface WikiSearchIndex {
    pages: WikiSearchDocument[];
    graph: Map<string, WikiSearchGraphNode>;
}
```

---

### `buildWikiSearchIndex`

**Kind:** function · **Source:** [src/wiki/search-index.ts:55](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L55)

```ts
function buildWikiSearchIndex(input: WikiSearchIndexInput): WikiSearchIndex
```

---

### `searchWikiIndex`

**Kind:** function · **Source:** [src/wiki/search-index.ts:89](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L89)

```ts
function searchWikiIndex(index: WikiSearchIndex, query: string): WikiSearchResult[]
```

---

### `fallbackSearchResults`

**Kind:** function · **Source:** [src/wiki/search-index.ts:97](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L97)

```ts
function fallbackSearchResults(index: WikiSearchIndex): WikiSearchResult[]
```

---

### `searchResultToContextPage`

**Kind:** function · **Source:** [src/wiki/search-index.ts:115](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L115)

```ts
function searchResultToContextPage(result: WikiSearchResult): WikiContextPage
```

---

### `tokenizeSearchQuery`

**Kind:** function · **Source:** [src/wiki/search-index.ts:131](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/search-index.ts#L131)

```ts
function tokenizeSearchQuery(query: string): string[]
```
