---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/maintenance-inbox.ts
---

# `src/wiki/maintenance-inbox.ts`

Maintenance inbox builder — synthesizes the unified queue of operator-actionable findings.

Aggregates `wiki_lint` findings, project-memory review findings (skill-promotion-ready,
stale, contradicting), pending wiki proposals, and recurring raw-observation clusters
into a single ranked list. Each entry carries one or more typed actions (`apply`,
`archive`, `snooze`, `promote`, `forget`, `quiet`) that the Review Board UI binds to
its verb-grouped tabs. Rendering the inbox to markdown produces `docs/wiki/maintenance-
inbox.md` (a human-browseable view) and a JSON twin under `docs/public/maintenance-
inbox.json` (consumed by the in-browser Review Board).

Operator-facing template strings (cluster summaries, ritual reminders) flow through the
i18n table in `./i18n.ts` so non-English operator-facing copy can be localized without
touching the inbox logic. Storage rules ensure memory bodies, wiki pages, and claims
stay English-only — i18n is for messages addressed to humans, not durable knowledge.

## Exports

- [`MaintenanceInboxRenderOptions`](#maintenanceinboxrenderoptions) — interface
- [`MaintenanceInboxActionHint`](#maintenanceinboxactionhint) — interface
- [`MaintenanceProposalReviewMetadata`](#maintenanceproposalreviewmetadata) — interface
- [`MaintenanceInboxSnapshot`](#maintenanceinboxsnapshot) — interface
- [`ResolvedMaintenanceInboxAction`](#resolvedmaintenanceinboxaction) — interface
- [`buildMaintenanceInboxSnapshot`](#buildmaintenanceinboxsnapshot) — function
- [`buildMaintenanceInboxPage`](#buildmaintenanceinboxpage) — function
- [`findMaintenanceInboxAction`](#findmaintenanceinboxaction) — function
- [`LintBucket`](#lintbucket) — type alias

---

### `MaintenanceInboxRenderOptions`

**Kind:** interface · **Source:** [src/wiki/maintenance-inbox.ts:25](../../../../src/wiki/maintenance-inbox.ts#L25)

```ts
interface MaintenanceInboxRenderOptions {
    reviewPageExists?: (reviewPath: string) => Promise<boolean>;
    memoryFindings?: ProjectMemoryReviewFinding[];
    observationClusters?: RawObservationCluster[];
}
```

---

### `MaintenanceInboxActionHint`

**Kind:** interface · **Source:** [src/wiki/maintenance-inbox.ts:31](../../../../src/wiki/maintenance-inbox.ts#L31)

```ts
interface MaintenanceInboxActionHint {
    id: string;
    kind: 'read-review-page' | 'refresh-review-pages' | 'apply-proposal' | 'archive-memory' | 'draft-memory-promotion' | 'apply-memory-promotion' | 'promote-memory-to-skill' | 'create-memory-from-cluster' | 'read-wiki-page' | 'check-proposals' | 'rerun-lint' | 'snooze-page-drift' | 'insert-h1' | 'archive-guidance-file' | 'edit-page-summary';
    label: string;
    tool: 'wiki_read' | 'wiki_write_proposals' | 'wiki_apply_proposal' | 'wiki_proposals' | 'wiki_lint' | 'memory_forget' | 'memory_promote' | 'memory_promote_skill' | 'memory_remember' | 'wiki_snooze_page_drift' | 'wiki_insert_h1' | 'wiki_archive_guidance' | 'wiki_edit_summary';
    arguments: Record<string, string | string[] | boolean | number>;
    available: boolean;
    reason?: string;
}
```

---

### `MaintenanceProposalReviewMetadata`

**Kind:** interface · **Source:** [src/wiki/maintenance-inbox.ts:69](../../../../src/wiki/maintenance-inbox.ts#L69)

```ts
interface MaintenanceProposalReviewMetadata {
    rationale: string;
    affectedPaths: string[];
    beforeSnippet: string;
    afterSnippet: string;
    undoPath: string;
}
```

---

### `MaintenanceInboxSnapshot`

**Kind:** interface · **Source:** [src/wiki/maintenance-inbox.ts:77](../../../../src/wiki/maintenance-inbox.ts#L77)

```ts
interface MaintenanceInboxSnapshot {
    status: {
        proposalCount: number;
        lintFindingCount: number;
        memoryFindingCount: number;
        observationClusterCount: number;
        proposalGroups: Array<{
            kind: WikiProposal['kind'];
            count: number;
        }>;
        lintRuleGroups: Array<{
            bucket: LintBucket;
            bucketTitle: string;
            rule: WikiLintRule;
            count: number;
        }>;
        memoryKindGroups: Array<{
            kind: ProjectMemoryReviewKind;
            title: string;
            count: number;
        }>;
    };
    nextSteps: string[];
    proposals: Array<{
        kind: WikiProposal['kind'];
        count: number;
        items: Array<{
            summary: string;
            currentStateSummary: string;
            afterApplySummary: string;
            review: MaintenanceProposalReviewMetadata;
            reviewSlug: string;
            reviewPath: string;
            reviewPageExists: boolean;
            actions: MaintenanceInboxActionHint[];
        }>;
    }>;
    lintBuckets: Array<{
        bucket: LintBucket;
        bucketTitle: string;
        count: number;
        rules: Array<{
            rule: WikiLintRule;
            count: number;
            items: Array<{
                slug: string;
                path: string;
                message: string;
                actions: MaintenanceInboxActionHint[];
            }>;
        }>;
    }>;
    memoryBuckets: Array<{
        kind: ProjectMemoryReviewKind;
        title: string;
        count: number;
        items: Array<{
            summary: string;
            reason: string;
            memoryIds: string[];
            records: Array<{
                id: string;
                kind: string;
                text: string;
                recallCount: number;
                updatedAt: string;
                sources: string[];
                relatedFiles: string[];
                relatedPages: string[];
            }>;
            actions: MaintenanceInboxActionHint[];
        }>;
    }>;
    observationClusters: Array<{
        kind: RawObservationCluster['kind'];
        target: string;
        observationCount: number;
        distinctSessionCount: number;
        firstSeen: string;
        lastSeen: string;
        outcomeCounts: RawObservationCluster['outcomeCounts'];
        synapticTag: RawObservationCluster['synapticTag'];
        suggestedSourceLink: string;
        actions: MaintenanceInboxActionHint[];
    }>;
}
```

---

### `ResolvedMaintenanceInboxAction`

**Kind:** interface · **Source:** [src/wiki/maintenance-inbox.ts:152](../../../../src/wiki/maintenance-inbox.ts#L152)

```ts
interface ResolvedMaintenanceInboxAction {
    action: MaintenanceInboxActionHint;
    source: {
        type: 'proposal';
        kind: WikiProposal['kind'];
        reviewSlug: string;
    } | {
        type: 'lint';
        bucket: LintBucket;
        rule: WikiLintRule;
        path: string;
    } | {
        type: 'memory';
        kind: ProjectMemoryReviewKind;
        memoryIds: string[];
    } | {
        type: 'observation-cluster';
        clusterKind: RawObservationCluster['kind'];
        target: string;
    };
}
```

---

### `buildMaintenanceInboxSnapshot`

**Kind:** function · **Source:** [src/wiki/maintenance-inbox.ts:161](../../../../src/wiki/maintenance-inbox.ts#L161)

```ts
function buildMaintenanceInboxSnapshot(findings: WikiLintFinding[], proposals: WikiProposal[], options: MaintenanceInboxRenderOptions): Promise<MaintenanceInboxSnapshot>
```

---

### `buildMaintenanceInboxPage`

**Kind:** function · **Source:** [src/wiki/maintenance-inbox.ts:357](../../../../src/wiki/maintenance-inbox.ts#L357)

```ts
function buildMaintenanceInboxPage(findings: WikiLintFinding[], proposals: WikiProposal[], options: MaintenanceInboxRenderOptions): Promise<string>
```

---

### `findMaintenanceInboxAction`

**Kind:** function · **Source:** [src/wiki/maintenance-inbox.ts:428](../../../../src/wiki/maintenance-inbox.ts#L428)

```ts
function findMaintenanceInboxAction(actionId: string, findings: WikiLintFinding[], proposals: WikiProposal[], options: MaintenanceInboxRenderOptions): Promise<ResolvedMaintenanceInboxAction | undefined>
```

---

### `LintBucket`

**Kind:** type alias · **Source:** [src/wiki/maintenance-inbox.ts:1078](../../../../src/wiki/maintenance-inbox.ts#L1078)

```ts
type LintBucket = (typeof lintBucketOrder)[number]
```
